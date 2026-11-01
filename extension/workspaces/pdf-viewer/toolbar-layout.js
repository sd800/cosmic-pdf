// Measure only toolbar geometry on layout changes, never the PDF or scroll path.
// Intrinsic group widths make this decision independent of the current row count.
export function createToolbarLayout(signal, { embedded = false, onResize } = {}) {
  const root = document.documentElement, header = document.querySelector('header');
  const nav = header.querySelector('nav'), groups = [...nav.querySelectorAll('.tool-group')];
  const file = header.querySelector('.file'), actions = header.querySelector('.actions');
  const leading = document.getElementById('leading-actions');
  let frame = 0;
  const width = node => node.getBoundingClientRect().width;
  function update() {
    const style = getComputedStyle(header), gap = parseFloat(style.columnGap) || 0;
    const available = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const visible = groups.filter(group => !group.hidden);
    const center = visible.reduce((sum, group) => sum + width(group), 0) +
      Math.max(0, visible.length - 1) * (parseFloat(getComputedStyle(nav).columnGap) || 0);
    const leadingWidth = width(leading), contentWidth = file.hidden ? 0 : 96;
    const left = leadingWidth + contentWidth + (leadingWidth && contentWidth ? 12 : 0);
    const right = width(actions);
    for (const [key, value] of [['left', left], ['right', right], ['side', Math.max(left, right)], ['leading', leadingWidth ? leadingWidth + 12 : 0]]) {
      const name = `--toolbar-${key}-min`, next = `${Math.ceil(value)}px`;
      if (header.style.getPropertyValue(name) !== next) header.style.setProperty(name, next);
    }
    const overflow = Math.ceil(left) + center + Math.ceil(right) + gap * 2 > available + .5;
    const wrap = String(!embedded && overflow);
    if (root.dataset.toolbarWrap !== wrap) root.dataset.toolbarWrap = wrap;
    root.dataset.toolbarOverflow = String(embedded && overflow);
    return overflow;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (onResize) onResize(); else update(); });
  }
  const observer = new ResizeObserver(schedule);
  for (const node of [header, nav, actions, leading, file, ...groups]) observer.observe(node);
  signal.addEventListener('abort', () => { observer.disconnect(); cancelAnimationFrame(frame); }, { once: true });
  return { update };
}
