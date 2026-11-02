export const MIME_READER_PATH = 'workspaces/pdf-reader/mime.html';
export const NATIVE_PDF_FRAGMENT = '#cosmic-pdf-native';
export function isNativePdfCopy(info, runtime = chrome.runtime) {
  return info?.originalUrl?.startsWith('blob:' + runtime.getURL(''))
    && new URLSearchParams(new URL(info.originalUrl).hash.slice(1)).has('cosmic-pdf-native');
}
export function mimeApi() { return globalThis.chrome?.mimeHandler || globalThis.browser?.mimeHandler || null; }
export function mimeOriginalUrl(value, runtime = chrome.runtime) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (['http:', 'https:', 'file:'].includes(url.protocol)) return url.href;
    if (url.protocol === 'blob:' && ['http:', 'https:', 'chrome-extension:'].includes(new URL(url.pathname).protocol)) {
      const origin = new URL(url.pathname);
      if (origin.protocol !== 'chrome-extension:' || origin.host === runtime.id) return url.href;
    }
  } catch {}
  return null;
}
export function validateMimeStream(info, runtime = chrome.runtime) {
  const originalUrl = mimeOriginalUrl(info?.originalUrl, runtime);
  const base = runtime.getURL('');
  let stream;
  try { stream = new URL(info?.streamUrl); } catch {}
  if (!originalUrl || info?.mimeType !== 'application/pdf' || !Number.isInteger(info.tabId) || info.tabId < 0
    || !stream || stream.protocol !== 'chrome-extension:' || stream.host !== new URL(base).host
    || stream.username || stream.password || stream.hash || stream.search || !/^\/[a-f0-9-]{36}$/i.test(stream.pathname)) throw Error('format');
  return { ...info, originalUrl, streamUrl: stream.href };
}
export function mimeFilenameHeaders(info) { return new Headers(info.responseHeaders || {}); }
export function mimeLocalFilename(info, runtime = chrome.runtime) {
  if (!info.originalUrl.startsWith('blob:' + runtime.getURL(''))) return null;
  return new URLSearchParams(new URL(info.originalUrl).hash.slice(1)).get('filename');
}
