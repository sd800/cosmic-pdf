import { READER_PATH, safeSource, sourceFromReader, withoutHash } from '../../core/source.js';
const readerURL=chrome.runtime.getURL(READER_PATH);
let serial=Promise.resolve();
const enqueue=fn=>{ const result=serial.catch(()=>{}).then(fn); serial=result; return result; };
export function takeoverRules(enabled, fileAccess) {
  if(!enabled) return [];
  const action={type:'redirect',redirect:{regexSubstitution:readerURL+'?source=\\0'}};
  const base={resourceTypes:['main_frame'],requestMethods:['get'],regexFilter:'^https?://.*'};
  // Attachments remain normal downloads. Never retry/replay a POST response.
  const rules=[{id:1,priority:20,action:{type:'allow'},condition:{...base,responseHeaders:[{header:'content-disposition',values:['attachment*']}] }},
    {id:2,priority:10,action,condition:{...base,responseHeaders:[{header:'content-type',values:['application/pdf*','application/x-pdf*']}] }},
    {id:3,priority:10,action,condition:{...base,regexFilter:'^https?://[^?#]+\\.pdf([?#].*)?$',isUrlFilterCaseSensitive:false,responseHeaders:[{header:'content-type',values:['application/octet-stream*','binary/octet-stream*']}] }}];
  if(fileAccess) rules.push({id:4,priority:10,action,condition:{resourceTypes:['main_frame'],requestMethods:['get'],regexFilter:'^file:///.*\\.pdf([?#].*)?$',isUrlFilterCaseSensitive:false}});
  return rules;
}
export function configureTakeover(enabled) {return enqueue(async()=>{
  const access=await chrome.extension.isAllowedFileSchemeAccess();
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[1,2,3,4],addRules:takeoverRules(enabled,access)});
});}
export function useNative(sender) {return enqueue(async()=>{
  if(sender.frameId!==0 || !Number.isInteger(sender.tab?.id)) throw Error('Invalid reader');
  const source=sourceFromReader(sender.url||'',readerURL);if(!source) throw Error('Invalid PDF source');
  const url=withoutHash(source), tabId=sender.tab.id, id=1000+tabId;
  const regex='^'+url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(#.*)?$';
  // Chrome limits compiled regex size. Fail safely instead of navigating into a loop.
  const supported=await chrome.declarativeNetRequest.isRegexSupported({regex});
  if(!supported.isSupported) throw Error('This URL cannot be temporarily exempted. Disable automatic opening in Settings.');
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[id],addRules:[{id,priority:100,action:{type:'allow'},condition:{tabIds:[tabId],resourceTypes:['main_frame'],regexFilter:regex}}]});
  await chrome.storage.session.set({['native:'+tabId]:{url,id}});
  await chrome.tabs.update(tabId,{url:source});
});}
export function forgetNative(tabId,url,closed=false){return enqueue(async()=>{
  const key='native:'+tabId, state=(await chrome.storage.session.get(key))[key];
  if(!state || (!closed && (!url || (safeSource(url) && withoutHash(url)===state.url))))return;
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[state.id]});await chrome.storage.session.remove(key);
});}
