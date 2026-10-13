import { readSettings } from '../../core/settings.js';
import { AI_PROVIDERS, normalizeAiRequest, explanationMessages, aiFailure } from '../../core/ai.js';
import { createApiVault } from './ai-vault.js';
import { streamExplanation } from './ai-client.js';
export function createAiExplanationProduct({ vault = createApiVault(), read = readSettings, stream = streamExplanation, runtime = chrome.runtime } = {}) {
  const clients = new Set(), tests = new Set();
  function cancelRequests(provider) {
    for (const client of clients) if (!provider || client.provider === provider) client.cancel();
    for (const job of tests) if (!provider || job.provider === provider) job.controller.abort();
  }
  function isPage(sender, path) {
    if (sender?.id !== runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)) return false;
    try { const url = new URL(sender.url), expected = new URL(runtime.getURL(path)); return url.protocol === expected.protocol && url.host === expected.host && url.pathname === expected.pathname; } catch { return false; }
  }
  const settingsSender = sender => isPage(sender, 'settings/index.html');
  const readerSender = sender => isPage(sender, 'workspaces/pdf-reader/index.html');
  const privateSender = sender => sender?.tab?.incognito === true || chrome.extension?.inIncognitoContext === true;
  const ready = async sender => privateSender(sender) ? {keys:{},private:true} : { keys: await vault.status(), private:false };
  async function handleMessage(message, sender) {
    if (message.type === 'AI_STATUS') {
      if (!settingsSender(sender) && !readerSender(sender)) throw Error('invalidRequest');
      return ready(sender);
    }
    if (!settingsSender(sender)) throw Error('invalidRequest');
    if (privateSender(sender)) throw Error('disabled');
    if (message.type === 'AI_DELETE_ALL_KEYS') {
      cancelRequests(); await vault.clear(); return ready(sender);
    }
    if (!Object.hasOwn(AI_PROVIDERS, message.provider)) throw Error('invalidRequest');
    if (message.type === 'AI_SAVE_KEY') await vault.save(message.provider, message.key);
    else if (message.type === 'AI_DELETE_KEY') {
      cancelRequests(message.provider);
      await vault.remove(message.provider);
    } else if (message.type === 'AI_TEST_KEY') {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
      const job = {provider: message.provider, controller, tabId: sender.tab.id}; tests.add(job);
      try {
        const key = await vault.read(message.provider); controller.signal.throwIfAborted();
        await stream(message.provider, key, { system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'Test connection.' }] }, { signal: controller.signal, onText() {} });
        controller.signal.throwIfAborted();
      } finally { clearTimeout(timer); tests.delete(job); }
    } else throw Error('invalidRequest');
    return ready(sender);
  }
  function connect(port) {
    if (port.name !== 'ai-explanation' || !readerSender(port.sender)) return false;
    let active = null, closed = false, timer = null, idleTimer = null, pendingText = '', flushTimer = null;
    const client = { provider: '', cancel: () => active?.controller.abort() }; clients.add(client);
    function post(data) { if (!closed) try { port.postMessage(data); } catch { close(); } }
    function flush() { clearTimeout(flushTimer); flushTimer = null; if (pendingText && active) post({ type: 'delta', id: active.id, text: pendingText }); pendingText = ''; }
    function close() { if (closed) return; closed = true; client.cancel(); clearTimeout(timer); clearTimeout(idleTimer); clearTimeout(flushTimer); pendingText = ''; clients.delete(client); }
    port.onDisconnect.addListener(close);
    port.onMessage.addListener(message => {
      if (closed || !message) return;
      if (message.type === 'cancel') { if (active?.id === message.id) client.cancel(); return; }
      if (message.type === 'heartbeat') return;
      if (message.type !== 'explain' || active || typeof message.id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(message.id)) return;
      const job = { id: message.id, controller: new AbortController(), timedOut: false }; active = job;
      void (async () => {
        const request = normalizeAiRequest(message.request), settings = await read();
        if (!settings.aiEnabled || privateSender(port.sender)) throw Error('disabled');
        if (!settings.aiIncludeContext) request.context = '';
        client.provider = settings.aiProvider;
        const key = await vault.read(client.provider); job.controller.signal.throwIfAborted();
        const configuration = AI_PROVIDERS[client.provider];
        post({ type: 'started', id: job.id, provider: client.provider, model: configuration.model });
        timer = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, 90000);
        const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, 25000); };
        resetIdle();
        const prompt = explanationMessages(request, settings.aiLanguage);
        await stream(client.provider, key, prompt, { signal: job.controller.signal, onText(delta) {
          if (closed || job.controller.signal.aborted || active !== job) return;
          resetIdle();
          pendingText += delta; if (!flushTimer) flushTimer = setTimeout(flush, 40);
        } });
        job.controller.signal.throwIfAborted(); flush(); post({ type: 'done', id: job.id });
      })().catch(error => { flush(); post({ type: 'error', id: job.id, error: job.timedOut ? 'timeout' : aiFailure(error) }); })
        .finally(() => { clearTimeout(timer); clearTimeout(idleTimer); clearTimeout(flushTimer); pendingText = ''; if (active === job) active = null; client.provider = ''; });
    });
    return true;
  }
  function settingsChanged(settings) { if (!settings.aiEnabled) for (const client of clients) client.cancel(); }
  function disposeTab(tabId) { for (const job of tests) if (job.tabId === tabId) job.controller.abort(); }
  return Object.freeze({ handleMessage, connect, settingsChanged, disposeTab });
}
