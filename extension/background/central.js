import * as standing from './provinces/standing.js';
import * as operations from './provinces/operations.js';
const start=()=>operations.readSettings().then(s=>standing.configureTakeover(s.enabled));
chrome.runtime.onInstalled.addListener(()=>void start().catch(console.error));
chrome.runtime.onStartup.addListener(()=>void start().catch(console.error));
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.settings) void start().catch(console.error);});
chrome.action.onClicked.addListener(()=>void start().then(()=>operations.openReader()).catch(console.error));
chrome.tabs.onRemoved.addListener(id=>void standing.forgetNative(id,null,true).catch(()=>{}));
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.url)void standing.forgetNative(id,change.url).catch(()=>{});});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return;
  let job;
  if(message?.type==='NATIVE_READER') job=standing.useNative(sender);
  else if(message?.type==='OPEN_SETTINGS' && sender.frameId===0 && Number.isInteger(sender.tab?.id) && sender.url?.startsWith(chrome.runtime.getURL('workspaces/pdf-reader/index.html'))) job=start().then(()=>operations.openSettings(sender.tab.id));
  else if(message?.type==='SETTINGS_SAVED' && sender.url===chrome.runtime.getURL('settings/index.html')) job=start();
  else return;
  job.then(()=>respond({ok:true}),()=>respond({ok:false}));return true;
});
