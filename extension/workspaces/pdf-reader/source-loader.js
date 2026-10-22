import { PDF_LIMITS } from '../pdf-viewer/model.js';

export const SOURCE_TIMEOUTS = Object.freeze({ idle: 90_000, total: 30 * 60_000 });
// Progress, not file size or transfer duration, renews the inactivity budget.
export async function fetchPdfSource(source, {
  signal, fetcher = fetch, onResponse = () => {},
  idleMs = SOURCE_TIMEOUTS.idle, totalMs = SOURCE_TIMEOUTS.total,
  timers = { set: (callback, delay) => setTimeout(callback, delay), clear: id => clearTimeout(id) }
} = {}) {
  const controller = new AbortController();
  let idle, total, timedOut = false, stream;
  const timeout = () => { timedOut = true; controller.abort(); };
  const renew = () => { timers.clear(idle); idle = timers.set(timeout, idleMs); };
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  renew(); total = timers.set(timeout, totalMs);
  try {
    if (controller.signal.aborted) throw Error('abort');
    const response = await fetcher(source, { signal: controller.signal, credentials: 'include', cache: 'default', referrerPolicy: 'no-referrer' });
    if (controller.signal.aborted) throw Error('abort');
    if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'access' : 'fetch');
    if (Number(response.headers.get('content-length')) > PDF_LIMITS.bytes) throw Error('large');
    onResponse(response);
    if (!response.body) throw Error('fetch');
    stream = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      if (controller.signal.aborted) throw Error('abort');
      const {done,value} = await stream.read();
      if (controller.signal.aborted) throw Error('abort');
      if (done) break;
      if (!value?.byteLength) continue;
      size += value.byteLength;
      if (size > PDF_LIMITS.bytes) throw Error('large');
      chunks.push(value); renew();
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return {bytes:bytes.buffer, response};
  } catch (error) {
    if (timedOut) throw Error('timeout');
    throw error;
  } finally {
    timers.clear(idle); timers.clear(total);
    signal?.removeEventListener('abort', cancel);
    // Abort pending transport work on overflow/error; release its reader on every path.
    controller.abort();
    if (stream) { await stream.cancel().catch(() => {}); stream.releaseLock(); }
  }
}
