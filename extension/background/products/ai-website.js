import { isReaderSender } from '../reader-sender.js';
import { normalizeAiRequest } from '../../core/ai.js';
import { webExplanation, isAiWebsite } from '../../core/ai-web.js';
import { readSettings } from '../../core/settings.js';
// Only paired tab IDs survive worker suspension. No question, URL, file name,
// account information or conversation is stored or read by this capability.
export function createAiWebsiteProduct({runtime=chrome.runtime,tabs=chrome.tabs,session=chrome.storage.session,read=readSettings}={}) {
  const registry='ai-website-companions',jobs=new Map();let queue=Promise.resolve(),cachedRecords;
  const preferenceKeys=['aiEnabled','aiMode','aiWebsite','aiLanguage','aiIncludeContext'];
  const signature=settings=>JSON.stringify(preferenceKeys.map(key=>settings[key]));
  const serialize=task=>{const job=queue.catch(()=>{}).then(task);queue=job;return job;};
  const readerURL=runtime.getURL('workspaces/pdf-reader/index.html');
  function isReader(url){return typeof url==='string'&&(url===readerURL||url.startsWith(readerURL+'?')||url.startsWith(readerURL+'#'));}
  function authorize(sender){
    if(!isReaderSender(sender,runtime)||!sender.documentId)throw Error('invalidRequest');
  }
  async function owner(sender,job){
    if(job.cancelled)throw Error('cancelled');
    const [source,contexts]=await Promise.all([tabs.get(sender.tab.id),runtime.getContexts({documentIds:[sender.documentId],contextTypes:['TAB']})]);
    if(job.cancelled||!contexts.some(c=>c.documentId===sender.documentId&&c.tabId===source.id&&c.frameId===sender.frameId&&c.documentUrl===sender.url))throw Error('cancelled');
    const settings=await read();
    if(!settings.aiEnabled||settings.aiMode!=='subscription')throw Error('disabled');
    const current=signature(settings);if(job.preferences&&job.preferences!==current)throw Error('cancelled');job.preferences=current;
    return {source,settings};
  }
  async function records(){
    if(!cachedRecords){
      const raw=(await session.get(registry))[registry],result={};
      if(raw&&typeof raw==='object')for(const [id,entry]of Object.entries(raw).slice(-128))if(/^\d+$/.test(id)&&Number.isSafeInteger(Number(id))&&Number.isInteger(entry?.tabId)&&entry.tabId>=0)result[id]={tabId:entry.tabId};
      cachedRecords=result;
    }return {...cachedRecords};
  }
  async function persist(data){const bounded=Object.fromEntries(Object.entries(data).slice(-128));await session.set({[registry]:bounded});cachedRecords=bounded;}
  const inSplit=tab=>Number.isInteger(tab.splitViewId)&&tab.splitViewId>=0;
  const compatibleView=(source,target)=>!inSplit(target)||inSplit(source)&&source.splitViewId===target.splitViewId;
  async function split(source,target){
    const already=Number.isInteger(source.splitViewId)&&source.splitViewId>=0;
    if(already)return source.splitViewId===target.splitViewId?'split':'tab';
    if(typeof tabs.createSplit!=='function'||(Number.isInteger(target.splitViewId)&&target.splitViewId>=0)||source.pinned!==target.pinned||source.groupId!==target.groupId)return 'tab';
    try{await tabs.createSplit([source.id,target.id]);return 'split';}catch{return 'tab';}
  }
  async function open(message,sender){
    authorize(sender);
    if(typeof message.id!=='string'||!/^[a-z0-9-]{1,80}$/i.test(message.id))throw Error('invalidRequest');
    const request=normalizeAiRequest(message.request);
    if(request.history.length||request.question.trim())throw Error('invalidRequest');
    const prior=jobs.get(sender.tab.id);if(prior)prior.cancelled=true;
    const job={id:message.id,documentId:sender.documentId,cancelled:false};jobs.set(sender.tab.id,job);
    try{return await serialize(async()=>{
      let {source,settings}=await owner(sender,job);
      if(!settings.aiIncludeContext)request.context='';
      const payload=webExplanation(request,settings.aiLanguage,settings.aiWebsite);
      if(!payload.url&&message.withoutPrompt!==true)return {copyRequired:true,provider:settings.aiWebsite};
      const data=await records();let target;
      if(data[source.id]){
        const candidate=await tabs.get(data[source.id].tabId).catch(()=>null);
        if(candidate&&candidate.id!==source.id&&candidate.windowId===source.windowId&&candidate.incognito===source.incognito&&compatibleView(source,candidate)&&isAiWebsite(candidate.pendingUrl||candidate.url))target=candidate;
        else delete data[source.id];
      }
      ({source,settings}=await owner(sender,job));
      // Rebuild from current trusted preferences before any browser navigation.
      const current=webExplanation({...request,context:settings.aiIncludeContext?request.context:''},settings.aiLanguage,settings.aiWebsite);
      if(!current.url&&message.withoutPrompt!==true)return {copyRequired:true,provider:settings.aiWebsite};
      const url=message.withoutPrompt===true?current.home:current.url;
      let created=false;
      if(target){
        // Recheck immediately before updating: a tab may have been repurposed.
        target=await tabs.get(target.id).catch(()=>null);
        if(target&&target.windowId===source.windowId&&target.incognito===source.incognito&&compatibleView(source,target)&&isAiWebsite(target.pendingUrl||target.url)){
          if(target.index!==source.index+1&&!(Number.isInteger(source.splitViewId)&&source.splitViewId>=0))target=await tabs.move(target.id,{windowId:source.windowId,index:target.index<source.index?source.index:source.index+1});
          await owner(sender,job);target=await tabs.update(target.id,{url,active:true});
        }else target=null;
      }
      if(!target){
        await owner(sender,job);
        target=await tabs.create({url,windowId:source.windowId,index:source.index+1,openerTabId:source.id,active:true});created=true;
      }
      if(job.cancelled){if(created){const live=await tabs.get(target.id).catch(()=>null);if(live&&isAiWebsite(live.pendingUrl||live.url))await tabs.remove(target.id).catch(()=>{});}throw Error('cancelled');}
      // Once Chrome has opened the requested page, never navigate it again on
      // behalf of a stale request. Retain only the ID for explicit future reuse.
      data[source.id]={tabId:target.id};await persist(data);
      source=await tabs.get(source.id).catch(()=>source);target=await tabs.get(target.id).catch(()=>target);
      const presentation=await split(source,target);
      return {provider:settings.aiWebsite,presentation};
    });}finally{if(jobs.get(sender.tab.id)===job)jobs.delete(sender.tab.id);}
  }
  function cancel(message,sender){authorize(sender);const job=jobs.get(sender.tab.id);if(job?.id===message.id&&job.documentId===sender.documentId)job.cancelled=true;}
  function disposeTab(tabId,url){
    const job=jobs.get(tabId);if(job&&(!url||!isReader(url)))job.cancelled=true;
    return serialize(async()=>{
      const data=await records();let changed=false;
      for(const [id,entry]of Object.entries(data))if((Number(id)===tabId&&(!url||!isReader(url)))||(entry.tabId===tabId&&(!url||!isAiWebsite(url)))){delete data[id];changed=true;}
      if(changed)await persist(data);
    });
  }
  function settingsChanged(settings){for(const job of jobs.values())if(!settings.aiEnabled||settings.aiMode!=='subscription'||job.preferences&&job.preferences!==signature(settings))job.cancelled=true;}
  return {open,cancel,disposeTab,settingsChanged};
}
