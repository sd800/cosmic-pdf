import { readSettings } from '../../core/settings.js';
import { isReaderSender } from '../reader-sender.js';
import { READER_PATH, safeSource, sourceFromReader, withoutHash } from '../../core/source.js';
const readerURL=chrome.runtime.getURL(READER_PATH);
let serial=Promise.resolve();
const enqueue=fn=>{ const result=serial.catch(()=>{}).then(fn); serial=result; return result; };
export function takeoverRules(enabled) {
  if(!enabled) return [];
  const action={type:'redirect',redirect:{regexSubstitution:readerURL+'?source=\\0'}};
  const base={resourceTypes:['main_frame','sub_frame','object'],requestMethods:['get'],regexFilter:'^https?://.*'};
  // Attachments remain normal downloads. Never retry/replay a POST response.
  const rules=[{id:1,priority:20,action:{type:'allow'},condition:{...base,responseHeaders:[{header:'content-disposition',values:['attachment*']}] }},
    {id:2,priority:10,action,condition:{...base,responseHeaders:[{header:'content-type',values:['application/pdf*','application/x-pdf*']}] }},
    {id:3,priority:10,action,condition:{...base,regexFilter:'^https?://[^?#]+\\.pdf([?#].*)?$',isUrlFilterCaseSensitive:false,responseHeaders:[{header:'content-type',values:['application/octet-stream*','binary/octet-stream*']}] }}];
  return rules;
}
export function configureTakeover(enabled) {return enqueue(async()=>{
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[1,2,3,4],addRules:takeoverRules(enabled)});
});}
async function assertCurrentReader(sender) {
  if (!sender.documentId) throw Error('Reader document unavailable');
  const contexts = await chrome.runtime.getContexts({ contextTypes:['TAB'], documentIds:[sender.documentId] });
  if (!contexts.some(context => context.tabId === sender.tab.id && context.frameId === sender.frameId && context.documentUrl === sender.url)) throw Error('Reader has navigated');
}
// One tab may contain several independent PDF frames. Keep each fallback
// scoped to its exact source and resource kind; never navigate the parent page.
function nativeEntries(state) {
  const entries=Array.isArray(state?.entries)?state.entries:state?.url?[{...state,frameId:0}]:[];
  return entries.filter(entry=>Number.isInteger(entry.id)&&entry.id>0&&Number.isInteger(entry.frameId)&&entry.frameId>=0&&safeSource(entry.url));
}
export function useNative(sender) {return enqueue(async()=>{
  if(!isReaderSender(sender)) throw Error('Invalid reader');
  const source=sourceFromReader(sender.url||'',readerURL);if(!source) throw Error('Invalid PDF source');
  await assertCurrentReader(sender);
  const url=withoutHash(source), tabId=sender.tab.id, key='native:'+tabId;
  const regex='^'+url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(#.*)?$';
  const supported=await chrome.declarativeNetRequest.isRegexSupported({regex});
  if(!supported.isSupported) throw Error('This URL cannot be temporarily exempted. Disable automatic opening in Settings.');
  const previous=(await chrome.storage.session.get(key))[key],entries=nativeEntries(previous);
  const rules=await chrome.declarativeNetRequest.getSessionRules(),prior=entries.find(entry=>entry.frameId===sender.frameId);
  if(!prior&&entries.length>=64)throw Error('Too many embedded reader exemptions');
  let id=prior?.id;
  // A prior failed cleanup can outlive its rule. Never overwrite an ID that
  // has since been allocated to another tab.
  const priorRule=rules.find(rule=>rule.id===id);
  if(priorRule&&!priorRule.condition.tabIds?.includes(tabId))id=undefined;
  if(!id){id=1000;const used=new Set(rules.map(rule=>rule.id));while(used.has(id))id++;}
  const previousRule=rules.find(rule=>rule.id===id);
  const next=entries.filter(entry=>entry.frameId!==sender.frameId).concat({url,id,frameId:sender.frameId});
  await assertCurrentReader(sender);
  // Persist cleanup ownership before granting an exemption. A failed storage
  // write must not leave an untracked allow rule behind.
  await chrome.storage.session.set({[key]:{entries:next}});
  let installed=false;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[id],addRules:[{id,priority:100,action:{type:'allow'},condition:{tabIds:[tabId],resourceTypes:sender.frameId===0?['main_frame']:['sub_frame','object'],...(sender.frameId===0?{}:{initiatorDomains:[chrome.runtime.id]}),regexFilter:regex}}]});
    installed=true;
    await assertCurrentReader(sender);
    // Embedded hosts perform their own same-frame navigation after the reply.
    if(sender.frameId===0)await chrome.tabs.update(tabId,{url:source});
  } catch(error) {
    // If rollback fails, keep cleanup metadata for the tab's next lifecycle event.
    if(installed) await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[id],addRules:previousRule?[previousRule]:[]});
    if(previous) await chrome.storage.session.set({[key]:previous});
    else await chrome.storage.session.remove(key);
    throw error;
  }
});}
export function forgetNative(tabId,url,closed=false){return enqueue(async()=>{
  const key='native:'+tabId, state=(await chrome.storage.session.get(key))[key];
  if(!state)return;
  const entries=nativeEntries(state);
  if(!closed && (!url || (safeSource(url) && entries.some(entry=>entry.frameId===0&&withoutHash(url)===entry.url))))return;
  if(entries.length){
    const ids=new Set(entries.map(entry=>entry.id)),rules=await chrome.declarativeNetRequest.getSessionRules();
    const owned=rules.filter(rule=>ids.has(rule.id)&&rule.condition.tabIds?.length===1&&rule.condition.tabIds[0]===tabId).map(rule=>rule.id);
    if(owned.length)await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:owned});
  }
  await chrome.storage.session.remove(key);
});}

// File navigations do not reliably pass through Chrome's network redirect
// rules. Observe only explicit local PDF URL changes, never download history.
export function openLocalPdf(tabId,value){
  const source=safeSource(value);
  if(!Number.isInteger(tabId)||tabId<0||!source||!source.startsWith('file:')||!new URL(source).pathname.toLowerCase().endsWith('.pdf'))return Promise.resolve();
  return enqueue(async()=>{
    if(!(await readSettings()).enabled||!await chrome.extension.isAllowedFileSchemeAccess())return;
    const state=(await chrome.storage.session.get('native:'+tabId))['native:'+tabId];
    if(nativeEntries(state).some(entry=>entry.frameId===0&&entry.url===withoutHash(source)))return;
    const tab=await chrome.tabs.get(tabId);
    if(tab.url!==source||(tab.pendingUrl&&tab.pendingUrl!==source))return;
    await chrome.tabs.update(tabId,{url:readerURL+'?source='+source});
  });
}
