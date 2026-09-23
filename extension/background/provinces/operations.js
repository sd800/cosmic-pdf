import { readSettings } from '../../core/settings.js';
export { readSettings };
export function openSettings(){return chrome.runtime.openOptionsPage();}
export function openReader(){return chrome.tabs.create({url:chrome.runtime.getURL('workspaces/pdf-reader/index.html')});}
