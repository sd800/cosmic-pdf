import { fetchModels } from './ai-model-catalog.js';
import { AI_MODEL_CATALOG_KEY, normalizeCatalog, selectedModel, modelLabel, excludedMediaModel } from '../../core/ai-models.js';
import { isReaderSender, isExtensionPageSender } from '../reader-sender.js';
import { readSettings } from '../../core/settings.js';
import { AI_PROVIDERS, normalizeAiRequest, explanationMessages, aiFailure, apiKey } from '../../core/ai.js';
import { AI_TEST_MODE_KEY, AI_TEST_MODEL, normalizeAiTestMode } from '../../core/ai-test-mode.js';
import { streamSampleExplanation } from './ai-samples.js';
import { createApiVault } from './ai-vault.js';
import { streamExplanation, testConnection } from './ai-client.js';
export function createAiExplanationProduct({ vault = createApiVault(), read = readSettings, stream = streamExplanation, test = testConnection, listModels = fetchModels, runtime = chrome.runtime, testStorage = globalThis.chrome?.storage?.local } = {}) {
  const clients = new Set(), tests = new Set();let modeWrites=Promise.resolve(),catalogWrites=Promise.resolve();
  const testMode=async()=>normalizeAiTestMode(testStorage?(await testStorage.get(AI_TEST_MODE_KEY))[AI_TEST_MODE_KEY]:null);
  function changeTestMode(message){
    const task=modeWrites.then(async()=>{
      if(!testStorage)throw Error('unavailable');
      const previous=await testMode(),next={...previous};
      if(message.type==='AI_TOGGLE_TEST_MODE'){next.enabled=!previous.enabled;if(!next.enabled)next.selected=false;}
      else{if(!next.enabled||typeof message.selected!=='boolean')throw Error('invalidRequest');next.selected=message.selected;}
      if(previous.selected!==next.selected)cancelRequests();
      await testStorage.set({[AI_TEST_MODE_KEY]:next});
    });
    modeWrites=task.catch(()=>{});return task;
  }
  function writeCatalog(provider,catalog,signal){
    const task=catalogWrites.catch(()=>{}).then(async()=>{
      signal?.throwIfAborted();const old=normalizeCatalog((await testStorage.get(AI_MODEL_CATALOG_KEY))[AI_MODEL_CATALOG_KEY]);signal?.throwIfAborted();
      if(provider===null)for(const key of Object.keys(old))delete old[key];else if(catalog)old[provider]=catalog;else delete old[provider];
      await testStorage.set({[AI_MODEL_CATALOG_KEY]:old});
    });catalogWrites=task;return task;
  }
  function cancelRequests(provider) {
    for (const client of clients) if (!provider || client.provider === provider) client.cancel();
    for (const job of tests) if (!provider || job.provider === provider) job.controller.abort();
  }
  function isPage(sender, path) {
    if (!isExtensionPageSender(sender, runtime) || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || sender.tab.id < 0) return false;
    try { const url = new URL(sender.url), expected = new URL(runtime.getURL(path)); return url.protocol === expected.protocol && url.host === expected.host && url.pathname === expected.pathname; } catch { return false; }
  }
  const settingsSender = sender => isPage(sender, 'settings/index.html');
  const readerSender = sender => isReaderSender(sender, runtime);
  const privateSender = sender => sender?.tab?.incognito === true || chrome.extension?.inIncognitoContext === true;
  const ready = async sender => {
    if(privateSender(sender))return {keys:{},private:true};
    const [keys,mode]=await Promise.all([vault.status(),testMode()]);
    return {keys,private:false,...(mode.enabled?{testMode:mode}:{})};
  };
  async function configuredModel(settings,provider){
    const id=selectedModel(settings,provider);
    if(!id||excludedMediaModel(provider,id))throw Error('modelUnavailable');
    const catalog=testStorage?normalizeCatalog((await testStorage.get(AI_MODEL_CATALOG_KEY))[AI_MODEL_CATALOG_KEY])[provider]:null;
    if(catalog?.excludedIds?.includes(id))throw Error('modelUnavailable');
    return {id,catalog};
  }
  async function handleMessage(message, sender) {
    if (message.type === 'AI_STATUS') {
      if (!settingsSender(sender) && !readerSender(sender)) throw Error('invalidRequest');
      return ready(sender);
    }
    if (!settingsSender(sender)) throw Error('invalidRequest');
    if (privateSender(sender)) throw Error('disabled');
    if(message.type==='AI_TOGGLE_TEST_MODE'||message.type==='AI_SELECT_TEST_MODE'){await changeTestMode(message);return ready(sender);}
    if (message.type === 'AI_DELETE_ALL_KEYS') {
      cancelRequests();if(testStorage)await writeCatalog(null);await vault.clear();return ready(sender);
    }
    if (!Object.hasOwn(AI_PROVIDERS, message.provider)) throw Error('invalidRequest');
    if (message.type === 'AI_CANCEL_MODELS') {
      for(const job of tests)if(job.kind==='models'&&job.tabId===sender.tab.id&&job.provider===message.provider)job.controller.abort();
    } else if (message.type === 'AI_FETCH_MODELS') {
      for(const pending of tests)if(pending.tabId===sender.tab.id&&pending.kind==='models')pending.controller.abort();
      const controller=new AbortController(),job={kind:'models',provider:message.provider,controller,tabId:sender.tab.id,timedOut:false};
      const timer=setTimeout(()=>{job.timedOut=true;controller.abort();},30000);tests.add(job);
      try {
        const key=await vault.read(message.provider);controller.signal.throwIfAborted();
        const catalog=await listModels(message.provider,key,{signal:controller.signal});controller.signal.throwIfAborted();
        await writeCatalog(message.provider,catalog,controller.signal);
        return catalog;
      }catch(error){if(job.timedOut)throw Error('timeout');throw error;}
      finally{clearTimeout(timer);tests.delete(job);}
    } else if (message.type === 'AI_CANCEL_TEST_KEY') {
      for(const job of tests)if(job.tabId===sender.tab.id&&job.provider===message.provider)job.controller.abort();
    } else if (message.type === 'AI_SAVE_KEY') {apiKey(message.key);cancelRequests(message.provider);if(testStorage)await writeCatalog(message.provider);await vault.save(message.provider, message.key);}
    else if (message.type === 'AI_DELETE_KEY') {
      cancelRequests(message.provider);
      if(testStorage)await writeCatalog(message.provider);await vault.remove(message.provider);
    } else if (message.type === 'AI_TEST_KEY') {
      // Repeated Settings requests cannot create overlapping paid checks.
      for(const pending of tests)if(pending.tabId===sender.tab.id)pending.controller.abort();
      const controller = new AbortController(),job = {provider: message.provider, controller, tabId: sender.tab.id,timedOut:false};
      const timer = setTimeout(() => {job.timedOut=true;controller.abort();},25000); tests.add(job);
      try {
        const key = await vault.read(message.provider); controller.signal.throwIfAborted();
        const settings=await read();controller.signal.throwIfAborted();
        const selected=await configuredModel(settings,message.provider);controller.signal.throwIfAborted();
        await test(message.provider, key, { signal: controller.signal, model:selected.id });
        controller.signal.throwIfAborted();
      } catch(error){if(job.timedOut)throw Error('timeout');throw error;}
      finally { clearTimeout(timer); tests.delete(job); }
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
        if (!settings.aiEnabled || settings.aiMode!=='api' || privateSender(port.sender)) throw Error('disabled');
        if (!settings.aiIncludeContext) request.context = '';
        await modeWrites;
        const mode=await testMode(),testing=mode.enabled&&mode.selected;
        client.provider = testing?'test':settings.aiProvider;
        // Local test selection is checked before any credential or API path.
        const key = testing?null:await vault.read(client.provider); job.controller.signal.throwIfAborted();
        const configuration=testing?AI_TEST_MODEL:AI_PROVIDERS[client.provider],selected=testing?null:await configuredModel(settings,client.provider),id=selected?.id,catalog=selected?.catalog;
        job.controller.signal.throwIfAborted();
        post({ type: 'started', id: job.id, provider: client.provider, model: testing?configuration.model:modelLabel(client.provider,id,catalog?.models) });
        timer = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, 90000);
        const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, 25000); };
        resetIdle();
        const options={ model:testing?undefined:selectedModel(settings), signal: job.controller.signal, onText(delta) {
          if (closed || job.controller.signal.aborted || active !== job) return;
          resetIdle();
          pendingText += delta; if (!flushTimer) flushTimer = setTimeout(flush, 40);
        } };
        if(testing)await streamSampleExplanation(request,settings.aiLanguage,options);
        else await stream(client.provider,key,explanationMessages(request,settings.aiLanguage),options);
        job.controller.signal.throwIfAborted(); flush(); post({ type: 'done', id: job.id });
      })().catch(error => { flush(); post({ type: 'error', id: job.id, error: job.timedOut ? 'timeout' : aiFailure(error) }); })
        .finally(() => { clearTimeout(timer); clearTimeout(idleTimer); clearTimeout(flushTimer); pendingText = ''; if (active === job) active = null; client.provider = ''; });
    });
    return true;
  }
  function settingsChanged(settings) { if (!settings.aiEnabled || (settings.aiMode&&settings.aiMode!=='api')) for (const client of clients) client.cancel(); }
  function disposeTab(tabId) { for (const job of tests) if (job.tabId === tabId) job.controller.abort(); }
  return Object.freeze({ handleMessage, connect, settingsChanged, disposeTab });
}
