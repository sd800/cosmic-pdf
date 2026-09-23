import { createSettingsSurface } from '../settings-surface.js';
import { readSettings } from '../../core/settings.js';
export { readSettings };
export async function openSettings(tabId){
 const source=await chrome.tabs.get(tabId);
 return chrome.tabs.create({url:chrome.runtime.getURL('settings/index.html'),windowId:source.windowId,index:source.index+1,openerTabId:source.id});
}
export function openReader(){return chrome.tabs.create({url:chrome.runtime.getURL('workspaces/pdf-reader/index.html')});}

const settingsURL=chrome.runtime.getURL('settings/index.html');
export function isSettingsPage(url){return typeof url==='string'&&(url===settingsURL||url.startsWith(settingsURL+'?')||url.startsWith(settingsURL+'#'));}
export const settingsOpened=createSettingsSurface(isSettingsPage,'settings-surface');
