export const READER_PATH = 'workspaces/pdf-reader/index.html';
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
