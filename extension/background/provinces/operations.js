import { readSettings } from '../../core/settings.js';
export { readSettings };
export async function openSettings(tabId){
 const source=await chrome.tabs.get(tabId);
 return chrome.tabs.create({url:chrome.runtime.getURL('settings/index.html'),windowId:source.windowId,index:source.index+1,openerTabId:source.id});
}
export function openReader(){return chrome.tabs.create({url:chrome.runtime.getURL('workspaces/pdf-reader/index.html')});}
