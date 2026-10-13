import * as standing from './provinces/standing.js';
import * as operations from './provinces/operations.js';
import { aiExplanation } from './provinces/customs.js';
import { aiFailure } from '../core/ai.js';
void chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
void chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
const readerURL=chrome.runtime.getURL('workspaces/pdf-reader/index.html');
const isReaderSender=sender=>sender.frameId===0&&Number.isInteger(sender.tab?.id)&&typeof sender.url==='string'&&(sender.url===readerURL||sender.url.startsWith(readerURL+'?')||sender.url.startsWith(readerURL+'#'));
let startup=Promise.resolve();
const start=()=>startup=startup.catch(()=>{}).then(()=>operations.readSettings()).then(s=>standing.configureTakeover(s.enabled));
chrome.runtime.onInstalled.addListener(()=>void start().catch(console.error));
chrome.runtime.onStartup.addListener(()=>void start().catch(console.error));
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.settings && changes.settings.oldValue?.enabled!==changes.settings.newValue?.enabled) void start().catch(console.error);});
chrome.action.onClicked.addListener(()=>void start().then(()=>operations.openReader()).catch(console.error));
chrome.tabs.onRemoved.addListener(id=>{aiExplanation.disposeTab(id);void standing.forgetNative(id,null,true).catch(()=>{});});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='loading'||change.url)aiExplanation.disposeTab(id);if(change.url)void standing.forgetNative(id,change.url).catch(()=>{});});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(typeof message?.type==='string' && ['AI_STATUS','AI_SAVE_KEY','AI_DELETE_KEY','AI_DELETE_ALL_KEYS','AI_TEST_KEY'].includes(message.type)){
    void aiExplanation.handleMessage(message,sender).then(result=>respond({ok:true,result}),error=>respond({ok:false,error:aiFailure(error)}));return true;
  }
  if(message?.type==='SAVE_SETTING' && sender.frameId===0 && operations.isSettingsPage(sender.url)){
    void operations.savePreference(message.edit).then(result=>respond({ok:true,result}),()=>respond({ok:false}));return true;
  }
  if(message?.type==='SAVE_AI_PREFERENCE' && isReaderSender(sender) && ['aiEnabled','aiIncludeContext'].includes(message.key) && typeof message.enabled==='boolean'){
    void operations.savePreference({key:message.key,value:message.enabled}).then(result=>respond({ok:true,result}),()=>respond({ok:false}));return true;
  }
  let job;
  if(message?.type==='NATIVE_READER') job=standing.useNative(sender);
  else if(message?.type==='OPEN_SETTINGS' && isReaderSender(sender)) job=start().then(()=>operations.openSettings(sender.tab.id));
  else if(message?.type==='SETTINGS_OPENED') job=operations.settingsOpened(sender,message.openedAt);
  else if(message?.type==='SETTINGS_SAVED' && sender.frameId===0 && operations.isSettingsPage(sender.url)) job=start();
  else return;
  job.then(()=>respond({ok:true}),()=>respond({ok:false}));return true;
});
chrome.runtime.onConnect.addListener(port=>{if(!aiExplanation.connect(port))port.disconnect();});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.settings)aiExplanation.settingsChanged(changes.settings.newValue||{});});
