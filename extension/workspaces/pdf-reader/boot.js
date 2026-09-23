// A tiny synchronous, non-sensitive appearance hint prevents a light first paint.
try { const theme=localStorage.getItem('appearance'); document.documentElement.dataset.dark=String(theme==='dark'||(theme!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches)); }catch{}
