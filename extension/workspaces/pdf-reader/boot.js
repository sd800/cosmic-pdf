// Choose the document-loading view before the first paint or async settings read.
if (location.pathname.endsWith('/workspaces/pdf-reader/index.html')) {
  document.documentElement.dataset.view = location.search.startsWith('?source=') ? 'loading' : 'home';
}
// A tiny synchronous, non-sensitive appearance hint prevents a light first paint.
try { const theme=localStorage.getItem('appearance'); document.documentElement.dataset.dark=String(theme==='dark'||(theme!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches)); }catch{}
