import { READER_PATH } from '../core/source.js';

// Packaged pages must retain their owning extension origin and active document.
// A matching path inside an opaque or retiring frame is not UI authority.
export function isExtensionPageSender(sender, runtime = chrome.runtime) {
  if (sender?.id !== runtime.id || typeof sender.url !== 'string'
    || sender.documentLifecycle !== undefined && sender.documentLifecycle !== 'active') return false;
  try {
    const url = new URL(sender.url), expected = new URL(runtime.getURL(''));
    return url.protocol === 'chrome-extension:' && url.host === expected.host
      && !url.username && !url.password
      && (sender.origin === undefined || sender.origin === `chrome-extension://${expected.host}`);
  } catch { return false; }
}

// The browser supplies the frame identity. A webpage/content-script sender or
// the opaque rendering sandbox cannot impersonate the extension-owned host.
export function isReaderSender(sender, runtime = chrome.runtime) {
  const reader = runtime.getURL(READER_PATH);
  return isExtensionPageSender(sender, runtime) && Number.isInteger(sender.frameId) && sender.frameId >= 0 &&
    Number.isInteger(sender.tab?.id) && sender.tab.id >= 0 && typeof sender.url === 'string' &&
    (sender.url === reader || sender.url.startsWith(reader + '?') || sender.url.startsWith(reader + '#'));
}
