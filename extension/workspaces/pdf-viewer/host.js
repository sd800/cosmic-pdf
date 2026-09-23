import { normalizeSettings } from '../../core/settings.js';
import { PDF_LIMITS } from './model.js';
// This host is the only connection to a product. The opaque viewer has no
// extension APIs, storage access, document URL, or arbitrary command channel.
export function createPdfViewer({ container, locale, sampling, settings, filename = 'PDF', canUseNative = false, sharpening = false, dark, onDownload, onNative, onSettings, onTheme, onReady, onError }) {
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
  const url = new URL('viewer.html', import.meta.url);
  url.hash = new URLSearchParams({ dark: dark ? '1' : '0', locale });
  iframe.src = url.href;
  const channel = new MessageChannel(); let closed = false, loaded = false, frameLoaded = false, opened = false, pending, timeout;
  const fullscreenChanged = () => {
    if (!closed) channel.port1.postMessage({ type: 'fullscreen', active: document.fullscreenElement === container });
  };
  document.addEventListener('fullscreenchange', fullscreenChanged);
  function sendDocument() {
    if (closed || !frameLoaded || !pending) return;
    const { bytes, filename } = pending; pending = null;
    channel.port1.postMessage({ type: 'document', bytes, filename }, [bytes]);
  }
  function destroy() {
    if (closed) return; closed = true; pending = null; clearTimeout(timeout);
    document.removeEventListener('fullscreenchange', fullscreenChanged);
    if (document.fullscreenElement === container) void document.exitFullscreen().catch(() => {});
    channel.port1.close(); iframe.remove();
  }
  channel.port1.onmessage = ({ data }) => {
    if (closed || !data || typeof data.type !== 'string') return;
    if (data.type === 'shell-ready') iframe.style.visibility = '';
    else if (data.type === 'ready' || data.type === 'password') {
      if (!loaded) { loaded = true; clearTimeout(timeout); onReady(); }
    }
    else if (data.type === 'parsed') clearTimeout(timeout);
    else if (data.type === 'download') onDownload();
    else if (data.type === 'native') onNative();
    else if (data.type === 'settings') onSettings();
    else if (data.type === 'theme') onTheme();
    else if (data.type === 'fullscreen') {
      // User activation from the reader reaches its ancestor. Fullscreen belongs
      // to the trusted host; the opaque sandbox never receives extra privileges.
      const operation = document.fullscreenElement === container ? document.exitFullscreen() : container.requestFullscreen();
      void operation.catch(() => { if (!closed) channel.port1.postMessage({ type: 'fullscreen-error' }); });
    }
    else if (data.type === 'error') { clearTimeout(timeout); if (!loaded) destroy(); onError(); }
  };
  iframe.addEventListener('load', () => {
    if (closed) return;
    iframe.contentWindow.postMessage({ type: 'CP_PDF_INIT', filename, canUseNative, locale, settings, sampling, sharpening: sharpening === true, dark }, '*', [channel.port2]);
    frameLoaded = true; sendDocument();
  }, { once: true });
  container.append(iframe);
  return {
    open(bytes, filename) {
      if (closed || opened || !(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > PDF_LIMITS.bytes) throw Error('Invalid PDF open');
      opened = true; pending = { bytes, filename };
      // Network transfer has its own budget. Start this only when bytes arrive.
      timeout = setTimeout(() => { if (!loaded && !closed) { destroy(); onError(); } }, 30000);
      sendDocument();
    },
    showError(message) { if (!closed) channel.port1.postMessage({ type: 'host-error', message: String(message).slice(0,1000) }); },
    setToolbar({ showFilename, showBranding, toolbarHidden }) {
      const next = normalizeSettings({ showFilename, showBranding, toolbarHidden });
      const toolbar = { showFilename: next.showFilename, showBranding: next.showBranding, toolbarHidden: next.toolbarHidden };
      settings = { ...settings, ...toolbar };
      if (!closed) channel.port1.postMessage({ type: 'toolbar', toolbar });
    },
    setInterface(nextLocale, nextSettings) {
      const next = normalizeSettings(nextSettings);
      locale = nextLocale === 'zh-CN' ? nextLocale : 'en-US';
      settings = { ...settings, propertyDateFormat: next.propertyDateFormat, ocrAction: next.ocrAction, useChromeFind: next.useChromeFind, captureLinks: next.captureLinks };
      if (!closed) channel.port1.postMessage({ type: 'interface', locale, propertyDateFormat: next.propertyDateFormat, ocrAction: next.ocrAction, useChromeFind: next.useChromeFind, captureLinks: next.captureLinks });
    },
    setDarkPaper(value) {
      settings = { ...settings, preserveDarkPaper: value === true };
      if (!closed) channel.port1.postMessage({ type: 'dark-paper', enabled: settings.preserveDarkPaper });
    },
    setSharpening(value) { if (!closed) { sharpening = value === true; channel.port1.postMessage({ type: 'sharpening', enabled: sharpening }); } },
    setTheme(nextDark) { dark = !!nextDark; if (!closed) channel.port1.postMessage({ type: 'theme', dark }); },
    destroy
  };
}
