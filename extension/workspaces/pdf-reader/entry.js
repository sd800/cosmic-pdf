import { readerEntryTarget, takeoverTicket } from '../../core/source.js';
// Replace the transient public entry, so bookmarks/history retain the stable
// reader URL. No document bytes, messages, or caller-selected destination page.
const ticket = await chrome.declarativeNetRequest.getSessionRules().then(rules => takeoverTicket(rules)).catch(() => null);
const target = readerEntryTarget(location.href, chrome.runtime, ticket);
if (target) location.replace(target);
else {
  const chinese = /^zh/i.test(chrome.i18n.getUILanguage());
  document.documentElement.lang = chinese ? 'zh-CN' : 'en';
  document.documentElement.dataset.view = 'home';
  document.getElementById('message').textContent = chinese
    ? '此打开链接已失效。请从原位置重新打开 PDF。'
    : 'This reader link is no longer valid. Reopen the PDF from its original location.';
  document.getElementById('welcome').hidden = false;
}
