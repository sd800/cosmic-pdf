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
async function assertCurrentReader(sender) {
  if (!sender.documentId) throw Error('Reader document unavailable');
  const contexts = await chrome.runtime.getContexts({ contextTypes:['TAB'], documentIds:[sender.documentId] });
  if (!contexts.some(context => context.tabId === sender.tab.id && context.frameId === 0 && context.documentUrl === sender.url)) throw Error('Reader has navigated');
}
export function useNative(sender) {return enqueue(async()=>{
  if(sender.frameId!==0 || !Number.isInteger(sender.tab?.id)) throw Error('Invalid reader');
  const source=sourceFromReader(sender.url||'',readerURL);if(!source) throw Error('Invalid PDF source');
  await assertCurrentReader(sender);
  const url=withoutHash(source), tabId=sender.tab.id, id=1000+tabId, key='native:'+tabId;
  const regex='^'+url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(#.*)?$';
  const supported=await chrome.declarativeNetRequest.isRegexSupported({regex});
  if(!supported.isSupported) throw Error('This URL cannot be temporarily exempted. Disable automatic opening in Settings.');
  const previous=(await chrome.storage.session.get(key))[key];
  const previousRule=(await chrome.declarativeNetRequest.getSessionRules()).find(rule=>rule.id===id);
  await assertCurrentReader(sender);
  // Persist cleanup ownership before granting an exemption. A failed storage
  // write must not leave an untracked allow rule behind.
  await chrome.storage.session.set({[key]:{url,id}});
  let installed=false;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[id],addRules:[{id,priority:100,action:{type:'allow'},condition:{tabIds:[tabId],resourceTypes:['main_frame'],regexFilter:regex}}]});
    installed=true;
    await assertCurrentReader(sender);
    await chrome.tabs.update(tabId,{url:source});
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
  if(!state){if(closed)await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[1000+tabId]});return;}
  if(!closed && (!url || (safeSource(url) && withoutHash(url)===state.url)))return;
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[state.id]});await chrome.storage.session.remove(key);
});}
