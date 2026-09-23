// A long press opens secondary controls without also activating the short click.
export function bindPressAction(button, { click, hold, canHold = () => true, signal }) {
 let timer = 0, held = false, pointer, x = 0, y = 0;
 const clear = () => { clearTimeout(timer); timer = 0; pointer = undefined; };
 button.addEventListener('pointerdown', event => {
  clear(); held = false;
  if (button.disabled || event.button !== 0 || !event.isPrimary || !canHold()) return;
  pointer = event.pointerId; x = event.clientX; y = event.clientY;
  timer = setTimeout(() => { timer = 0; if (!button.disabled) { held = true; hold(); } }, 550);
 }, { signal });
 button.addEventListener('pointermove', event => { if (event.pointerId === pointer && Math.hypot(event.clientX - x, event.clientY - y) > 8) clear(); }, { signal });
 for (const type of ['pointerup','pointercancel','pointerleave']) button.addEventListener(type, clear, { signal });
 window.addEventListener('blur', clear, { signal });
 button.addEventListener('click', event => {
  clear(); if (button.disabled) return;
  if (held && event.detail !== 0) { held = false; event.preventDefault(); event.stopImmediatePropagation(); return; }
  held = false; click();
 }, { signal });
 button.addEventListener('contextmenu', event => { if (canHold()) event.preventDefault(); }, { signal });
 signal?.addEventListener('abort', clear, { once: true });
}
