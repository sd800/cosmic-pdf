import { createSettingsSurface } from '../settings-surface.js';
import { normalizeSettings, DEFAULTS, readSettings } from '../../core/settings.js';
export { readSettings };
export async function openSettings(tabId){
 const source=await chrome.tabs.get(tabId);
 return chrome.tabs.create({url:chrome.runtime.getURL('settings/index.html'),windowId:source.windowId,index:source.index+1,openerTabId:source.id});
}
export function openReader(){return chrome.tabs.create({url:chrome.runtime.getURL('workspaces/pdf-reader/index.html')});}

const settingsURL=chrome.runtime.getURL('settings/index.html');
export function isSettingsPage(url){return typeof url==='string'&&(url===settingsURL||url.startsWith(settingsURL+'?')||url.startsWith(settingsURL+'#'));}
export const settingsOpened=createSettingsSurface(isSettingsPage,'settings-surface');

let preferenceQueue=Promise.resolve();
export function savePreference(edit){
 const job=preferenceQueue.catch(()=>{}).then(async()=>{
  if(!edit||(!edit.reset&&!Object.hasOwn(DEFAULTS,edit.key)))throw Error('invalidRequest');
  const current=await readSettings();
  const next=edit.reset?normalizeSettings():normalizeSettings({...current,[edit.key]:edit.key==='toolbarHidden'?{...current.toolbarHidden,...edit.value}:edit.value});
  await chrome.storage.local.set({settings:next});return next;
 });preferenceQueue=job;return job;
}
