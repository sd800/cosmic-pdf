import { isReaderSender } from '../reader-sender.js';
import { READER_PATH, sourceFromReader, withoutHash } from '../../core/source.js';

// Source-origin Referer only, scoped to this authenticated reader's exact GET.
// No page-history observer, caller-selected header, cross-site path, or query is exposed.
let serial = Promise.resolve();
const enqueue = job => { const result=serial.catch(()=>{}).then(job); serial=result; return result; };
const keyFor = id => 'pdf-fetch:' + id;
function entries(value) { return Array.isArray(value) ? value.filter(v=>Number.isInteger(v.id)&&v.id>=2_000_000&&typeof v.token==='string') : []; }
async function remove(tabId, selected) {
  const rules=await chrome.declarativeNetRequest.getSessionRules();
  const owned=new Set(selected.map(v=>v.id));
  const ids=rules.filter(rule=>owned.has(rule.id)&&rule.condition.tabIds?.length===1&&rule.condition.tabIds[0]===tabId&&rule.action.type==='modifyHeaders').map(v=>v.id);
  if(ids.length)await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:ids});
}
async function current(sender) {
  if(!isReaderSender(sender)||!sender.documentId)throw Error('Invalid PDF request');
  const contexts=await chrome.runtime.getContexts({contextTypes:['TAB'],documentIds:[sender.documentId]});
  if(!contexts.some(v=>v.tabId===sender.tab.id&&v.frameId===sender.frameId&&v.documentUrl===sender.url))throw Error('Reader departed');
}
export function preparePdfRequest(sender) { return enqueue(async()=>{
  await current(sender);
  const source=sourceFromReader(sender.url,chrome.runtime.getURL(READER_PATH));
  if(!source||!/^https?:/.test(source))return null;
  const url=new URL(source), regex='^'+withoutHash(source).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$';
  if(!(await chrome.declarativeNetRequest.isRegexSupported({regex})).isSupported)return null;
  const tabId=sender.tab.id,key=keyFor(tabId),all=entries((await chrome.storage.session.get(key))[key]);
  const obsolete=all.filter(v=>v.documentId===sender.documentId||v.frameId===sender.frameId);
  await remove(tabId,obsolete);
  const retained=all.filter(v=>!obsolete.includes(v));
  if(retained.length>=64)throw Error('PDF request budget');
  const rules=await chrome.declarativeNetRequest.getSessionRules(),used=new Set(rules.map(v=>v.id));
  let id=2_000_000;while(used.has(id))id++;
  if(id>=2_001_024)throw Error('PDF request budget');
  const entry={id,token:crypto.randomUUID(),documentId:sender.documentId,frameId:sender.frameId,reader:sender.url};
  // Register ownership before adding a header rule; keep it until removal succeeds.
  await chrome.storage.session.set({[key]:retained.concat(entry)});
  try {
    await chrome.declarativeNetRequest.updateSessionRules({addRules:[{id,priority:80,
      action:{type:'modifyHeaders',requestHeaders:[{header:'referer',operation:'set',value:url.origin+'/'}]},
      condition:{tabIds:[tabId],initiatorDomains:[chrome.runtime.id],resourceTypes:['xmlhttprequest'],requestMethods:['get'],regexFilter:regex,isUrlFilterCaseSensitive:true}}]});
    await current(sender);
    return entry.token;
  } catch(error) {
    await remove(tabId,[entry]);
    if(retained.length)await chrome.storage.session.set({[key]:retained});else await chrome.storage.session.remove(key);
    throw error;
  }
}); }
export function finishPdfRequest(sender,token) { return enqueue(async()=>{
  if(!isReaderSender(sender)||typeof token!=='string')throw Error('Invalid PDF request');
  const key=keyFor(sender.tab.id),all=entries((await chrome.storage.session.get(key))[key]);
  const selected=all.filter(v=>v.token===token&&v.documentId===sender.documentId);
  if(!selected.length)return;
  await remove(sender.tab.id,selected);
  const retained=all.filter(v=>!selected.includes(v));
  if(retained.length)await chrome.storage.session.set({[key]:retained});else await chrome.storage.session.remove(key);
}); }
export function forgetPdfRequests(tabId,url=null) { return enqueue(async()=>{
  const key=keyFor(tabId),all=entries((await chrome.storage.session.get(key))[key]);
  if(url&&all.some(v=>v.reader===url))return;
  await remove(tabId,all);await chrome.storage.session.remove(key);
}); }
