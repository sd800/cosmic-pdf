import { PDF_SOURCE_PORT } from '../../core/source.js';
// The browser-owned connection releases header ownership if this frame goes
// away. A heartbeat exists only during its bounded document transfer.
export function createSourceRequest({ signal, runtime = chrome.runtime, timers = globalThis } = {}) {
  let port, token, deadline, heartbeat, acknowledged = false, released = false, settle;
  const ready = new Promise(resolve => { settle = resolve; });
  function release() {
    if (released) return; released = true;
    timers.clearTimeout(deadline); timers.clearInterval(heartbeat);
    signal?.removeEventListener('abort', release);
    try { port?.disconnect(); } catch {}
    // Also handles an unexpected service-worker restart after initialization.
    if (token) try { void runtime.sendMessage({type:'PDF_REQUEST_END',token}).catch(()=>{}); } catch {}
    settle();
  }
  try {
    if (signal?.aborted) { release(); return {ready,release}; }
    port = runtime.connect({name:PDF_SOURCE_PORT});
    signal?.addEventListener('abort', release, {once:true});
    port.onDisconnect.addListener(release);
    port.onMessage.addListener(message => {
      if (released || acknowledged || message?.type !== 'ready') return;
      acknowledged = true;
      token = typeof message.token === 'string' && message.token.length <= 64 ? message.token : null;
      timers.clearTimeout(deadline); settle();
      if (!token) release();
      else heartbeat = timers.setInterval(()=>{try {port.postMessage({type:'heartbeat'});}catch{release();}},20_000);
    });
    deadline = timers.setTimeout(release, 5000);
  } catch { release(); }
  return {ready,release};
}
