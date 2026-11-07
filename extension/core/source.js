export const READER_PATH = 'workspaces/pdf-reader/index.html';
export const READER_ENTRY_PATH = 'workspaces/pdf-reader/entry.html';
export const PDF_SOURCE_PORT = 'pdf-source-request';
export const TAKEOVER_REDIRECT_RULE_IDS = Object.freeze([2, 3]);
const TAKEOVER_TICKET = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const captureSuffix = '&source=\\0';
// History, local-file state, and privileged identities use the stable reader.
// Only the external navigation entry has a session-specific public URL.
export function readerPageURL(runtime = chrome.runtime) { return runtime.getURL('') + READER_PATH; }
export function takeoverRedirectURL(ticket, runtime = chrome.runtime) {
  if (!TAKEOVER_TICKET.test(ticket)) throw Error('Invalid PDF takeover ticket');
  return runtime.getURL(READER_ENTRY_PATH) + '?ticket=' + ticket + captureSuffix;
}
export function takeoverTicket(rules, runtime = chrome.runtime) {
  const prefix = runtime.getURL(READER_ENTRY_PATH) + '?ticket=';
  for (const rule of rules) {
    if (!TAKEOVER_REDIRECT_RULE_IDS.includes(rule.id) || rule.action.type !== 'redirect') continue;
    const url = rule.action.redirect?.regexSubstitution;
    if (!url?.startsWith(prefix) || !url.endsWith(captureSuffix)) continue;
    const ticket = url.slice(prefix.length, -captureSuffix.length);
    if (TAKEOVER_TICKET.test(ticket)) return ticket;
  }
  return null;
}
export function readerEntryTarget(url, runtime = chrome.runtime, ticket = null) {
  if (!TAKEOVER_TICKET.test(ticket)) return null;
  const query = '?ticket=' + ticket + '&source=';
  const prefix = [runtime.getURL('') + READER_ENTRY_PATH, runtime.getURL(READER_ENTRY_PATH)]
    .map(path => path + query).find(candidate => url.startsWith(candidate));
  const source = prefix ? safeSource(url.slice(prefix.length)) : null;
  return source && /^https?:/.test(source) ? readerPageURL(runtime) + '?source=' + source : null;
}
// DNR substitutions cannot percent-encode captures. Keep the complete raw URL,
// including signed query parameters, in the final parameter; never split on &.
export function sourceFromReader(url, readerURL) {
  const prefix=readerURL+'?source=';
  return url.startsWith(prefix) ? safeSource(url.slice(prefix.length)) : null;
}
export function safeSource(value) {
  try { const url=new URL(value); return ['https:','http:','file:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function withoutHash(url){const result=new URL(url);result.hash='';return result.href;}
export function filenameFrom(url, disposition='') {
  let name='';
  const utf=disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i), simple=disposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  try {name=utf?decodeURIComponent(utf[1]):simple?(simple[1]||simple[2]).trim():decodeURIComponent(new URL(url).pathname.split('/').pop());} catch {}
  return cleanFilename(name || 'document.pdf');
}
export function cleanFilename(name) { const value=String(name).replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g,'_').slice(0,220); return /\.pdf$/i.test(value)?value:(value||'document')+'.pdf'; }
export function isPdf(bytes){return new TextDecoder('latin1').decode(new Uint8Array(bytes,0,Math.min(bytes.byteLength,1024))).includes('%PDF-');}
