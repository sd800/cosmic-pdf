// This sandbox is web-accessible only so Chrome can nest it inside an embedded
// extension reader. It still accepts initialization solely from our own host.
export function isViewerHost(origin, moduleURL) {
  try {
    const module = new URL(moduleURL);
    return module.protocol === 'chrome-extension:' && origin === `chrome-extension://${module.host}`;
  } catch { return false; }
}
