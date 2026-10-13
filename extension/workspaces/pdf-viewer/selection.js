// Clear only the reading selection, never a selection in an AI reply or input.
// Focus events also cover a visible PDF losing focus to another split pane.
export function clearPdfSelection(pages, selection) {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
  let belongs = pages.contains(selection.anchorNode) || pages.contains(selection.focusNode);
  for (let i = 0; !belongs && i < selection.rangeCount; i++) {
    try { belongs = selection.getRangeAt(i).intersectsNode(pages); } catch {}
  }
  if (!belongs) return false;
  selection.removeAllRanges(); return true;
}
export function bindPdfSelection({ pages, signal, onClear = () => {} }) {
  function clear() {
    if (signal.aborted) return;
    if (clearPdfSelection(pages, getSelection())) onClear();
  }
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || event.target?.closest?.('#ai-selection')) return;
    // Keep native Shift-click range extension and right-click Copy intact.
    if (event.shiftKey && event.target?.closest?.('.textLayer,.ocr-text-layer')) return;
    clear();
  }, { capture: true, signal });
  window.addEventListener('blur', () => { if (!document.hasFocus()) clear(); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); }, { signal });
  return { clear };
}
