import { READER_PATH } from '../core/source.js';

// The browser supplies the frame identity. A webpage/content-script sender or
// the opaque rendering sandbox cannot impersonate the extension-owned host.
export function isReaderSender(sender, runtime = chrome.runtime) {
  const reader = runtime.getURL(READER_PATH);
  return sender?.id === runtime.id && Number.isInteger(sender.frameId) && sender.frameId >= 0 &&
    Number.isInteger(sender.tab?.id) && sender.tab.id >= 0 && typeof sender.url === 'string' &&
    (sender.url === reader || sender.url.startsWith(reader + '?') || sender.url.startsWith(reader + '#'));
}
