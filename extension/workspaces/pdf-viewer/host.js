import { isAppearanceMode } from '../../core/appearance.js';
import { createAiBridge } from '../pdf-reader/ai-bridge.js';
import { normalizeSettings } from '../../core/settings.js';
import { PDF_LIMITS } from './model.js';
// This host is the only connection to a product. The opaque viewer has no
// extension APIs, storage access, network capability, or arbitrary command channel.
// The validated source URL supplies inert metadata and a bounded initial page destination.
export function createPdfViewer({ container, locale, sampling, settings, filename = 'PDF', documentUrl = '', canUseNative = false, embedded = window !== window.top, sharpening = false, dark, themeMode, onDownload, onPrint, onNative, onSettings, onTheme, onReady, onError, onAiPreference }) {
  themeMode = isAppearanceMode(themeMode) ? themeMode : normalizeSettings(settings).appearance;
  const iframe = document.createElement('iframe');
  iframe.className = 'pdf-viewer-frame'; iframe.title = 'PDF Viewer';
  iframe.referrerPolicy = 'no-referrer';
  // Grant write-only clipboard access to this fixed opaque reader (e.g. Copy
  // all PDF text). No clipboard read access or privileged host copy command.
  iframe.allow = 'clipboard-write *';
  // Reveal the real toolbar after localization/preferences are applied, without
  // waiting for document bytes. No placeholder toolbar or loading cover.
  iframe.style.visibility = 'hidden';
  iframe.style.background = dark ? '#121416' : '#e8eaed';
  iframe.style.colorScheme = dark ? 'dark' : 'light';
  const url = new URL('viewer.html', import.meta.url);
  url.hash = new URLSearchParams({ dark: dark ? '1' : '0', locale });
  iframe.src = url.href;
  const channel = new MessageChannel(); let closed = false, frameLoaded = false, opened = false, pending, timeout, shellTimeout;
  let awaitingPage = false, interactive = false;
  function fail() { destroy(); onError(); }
  function updatePageDeadline() {
    clearTimeout(timeout);
    // The viewer intentionally pauses painting in a background tab.
    if (awaitingPage && !document.hidden) timeout = setTimeout(fail, 30000);
  }
  document.addEventListener('visibilitychange', updatePageDeadline);
  let fullscreenFailed = false;
  const canFullscreen = () => !embedded && !fullscreenFailed && document.fullscreenEnabled === true
    && typeof container.requestFullscreen === 'function' && typeof document.exitFullscreen === 'function';
  const aiBridge=createAiBridge({
    onEvent:event=>{if(!closed)channel.port1.postMessage({type:'ai-event',event});},
    onStatus:state=>{if(!closed)channel.port1.postMessage({type:'ai-status',state});}
  });
  const fullscreenChanged = () => {
    if (!closed) channel.port1.postMessage({ type: 'fullscreen', active: document.fullscreenElement === container, available: canFullscreen() });
  };
  document.addEventListener('fullscreenchange', fullscreenChanged);
  const focusLost = () => { if (!closed && !document.hasFocus()) channel.port1.postMessage({ type: 'clear-selection' }); };
  window.addEventListener('blur', focusLost);
  function sendDocument() {
    if (closed || !frameLoaded || !pending) return;
    const { bytes, filename } = pending; pending = null;
    channel.port1.postMessage({ type: 'document', bytes, filename }, [bytes]);
  }
  function destroy() {
    if (closed) return; closed = true; pending = null; clearTimeout(timeout); clearTimeout(shellTimeout);
    document.removeEventListener('visibilitychange', updatePageDeadline);
    document.removeEventListener('fullscreenchange', fullscreenChanged);
    window.removeEventListener('blur', focusLost);
    if (document.fullscreenElement === container) void document.exitFullscreen().catch(() => {});
    aiBridge.destroy(); channel.port1.close(); iframe.remove();
  }
  channel.port1.onmessage = ({ data }) => {
    if (closed || !data || typeof data.type !== 'string') return;
    if (data.type === 'ai-request') aiBridge.request(data.id,data.request);
    else if (data.type === 'ai-web-request') void aiBridge.openWebsite(data.id,data.request,data.withoutPrompt);
    else if (data.type === 'ai-cancel') aiBridge.cancel(data.id);
    else if (data.type === 'ai-refresh') void aiBridge.refresh();
    else if (data.type === 'ai-toggle' || data.type === 'ai-context') {if(typeof data.enabled==='boolean')onAiPreference(data.type==='ai-toggle'?'aiEnabled':'aiIncludeContext',data.enabled);}
    else if (data.type === 'shell-ready') { clearTimeout(shellTimeout); iframe.style.visibility = ''; }
    else if (data.type === 'opening') { awaitingPage = true; updatePageDeadline(); }
    else if (data.type === 'ready' || data.type === 'password') {
      awaitingPage = false; clearTimeout(timeout);
      if (!interactive) { interactive = true; onReady(); }
    }
    else if (data.type === 'download') onDownload();
    else if (data.type === 'print') onPrint?.();
    else if (data.type === 'native') onNative(Number.isSafeInteger(data.page) && data.page > 0 && data.page <= PDF_LIMITS.pages ? data.page : undefined);
    else if (data.type === 'settings') onSettings();
    else if (data.type === 'theme') { if (data.mode === undefined) onTheme(); else if (isAppearanceMode(data.mode)) onTheme(data.mode); }
    else if (data.type === 'fullscreen') {
      // User activation from the reader reaches its ancestor. Fullscreen belongs
      // to the trusted host; the opaque sandbox never receives extra privileges.
      if (!canFullscreen()) { fullscreenChanged(); return; }
      const operation = document.fullscreenElement === container ? document.exitFullscreen() : container.requestFullscreen();
      void operation.catch(() => { fullscreenFailed = true; fullscreenChanged(); });
    }
    else if (data.type === 'error') fail();
  };
  iframe.addEventListener('load', () => {
    if (closed) return;
    iframe.contentWindow.postMessage({ type: 'CP_PDF_INIT', filename, documentUrl, canUseNative, embedded, canFullscreen: canFullscreen(), locale, settings, sampling, sharpening: sharpening === true, dark, themeMode }, '*', [channel.port2]);
    frameLoaded = true; sendDocument();
  }, { once: true });
  // A blocked or failed frame can still dispatch load. Require the private
  // channel's acknowledgement before treating its UI as available.
  shellTimeout = setTimeout(fail, 10000);
  container.append(iframe);
  return {
    open(bytes, filename) {
      if (closed || opened || !(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > PDF_LIMITS.bytes) throw Error('Invalid PDF open');
      opened = true; pending = { bytes, filename };
      // Network transfer has its own budget. Start this only when bytes arrive.
      awaitingPage = true; updatePageDeadline();
      sendDocument();
    },
    showError(message) { if (!closed) channel.port1.postMessage({ type: 'host-error', message: String(message).slice(0,1000) }); },
    goToPage(page) { if (!closed && Number.isSafeInteger(page) && page > 0 && page <= 99_999_999) channel.port1.postMessage({type:'page-destination',page}); },
    setToolbar({ showFilename, toolbarHidden }) {
      const next = normalizeSettings({ showFilename, toolbarHidden });
      const toolbar = { showFilename: next.showFilename, toolbarHidden: next.toolbarHidden };
      settings = { ...settings, ...toolbar };
      if (!closed) channel.port1.postMessage({ type: 'toolbar', toolbar });
    },
    setInterface(nextLocale, nextSettings) {
      const next = normalizeSettings(nextSettings);
      locale = nextLocale === 'zh-CN' ? nextLocale : 'en-US';
      settings = { ...settings, propertyDateFormat: next.propertyDateFormat, ocrAction: next.ocrAction, automaticOcr: next.automaticOcr, useChromeFind: next.useChromeFind, captureLinks: next.captureLinks };
      if (!closed) channel.port1.postMessage({ type: 'interface', locale, propertyDateFormat: next.propertyDateFormat, ocrAction: next.ocrAction, automaticOcr: next.automaticOcr, useChromeFind: next.useChromeFind, captureLinks: next.captureLinks });
    },
    setAi(nextSettings) {
      const next=normalizeSettings(nextSettings);
      const preferences={aiEnabled:next.aiEnabled,aiMode:next.aiMode,aiWebsite:next.aiWebsite,aiProvider:next.aiProvider,aiLanguage:next.aiLanguage,aiIncludeContext:next.aiIncludeContext};
      settings={...settings,...preferences};
      if(!closed)channel.port1.postMessage({type:'ai-preferences',preferences});
      void aiBridge.refresh();
    },
    setDarkPaper(value) {
      settings = { ...settings, preserveDarkPaper: value === true };
      if (!closed) channel.port1.postMessage({ type: 'dark-paper', enabled: settings.preserveDarkPaper });
    },
    setSharpening(value) { if (!closed) { sharpening = value === true; channel.port1.postMessage({ type: 'sharpening', enabled: sharpening }); } },
    setTheme(nextDark, mode) {
      if (closed) return;
      dark = !!nextDark; if (isAppearanceMode(mode)) themeMode = mode;
      iframe.style.background = dark ? '#121416' : '#e8eaed';
      iframe.style.colorScheme = dark ? 'dark' : 'light';
      channel.port1.postMessage({ type: 'theme', dark, themeMode });
    },
    destroy
  };
}
