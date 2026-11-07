import { readerEntryTarget, takeoverTicket } from '../../core/source.js';
// Replace the transient public entry, so bookmarks/history retain the stable
// reader URL. No document bytes, messages, or caller-selected destination page.
const ticket = await chrome.declarativeNetRequest.getSessionRules().then(rules => takeoverTicket(rules)).catch(() => null);
const target = readerEntryTarget(location.href, chrome.runtime, ticket);
if (target) location.replace(target);
