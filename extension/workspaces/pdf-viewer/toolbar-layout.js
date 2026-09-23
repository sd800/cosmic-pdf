// Measure only toolbar geometry on layout changes, never the PDF or scroll path.
// Intrinsic group widths make this decision independent of the current row count.
export function createToolbarLayout(signal) {
  const root = document.documentElement, header = document.querySelector('header');
  const nav = header.querySelector('nav'), groups = [...nav.querySelectorAll('.tool-group')];
  const identity = header.querySelector('.identity'), actions = header.querySelector('.actions');
  const leading = document.getElementById('leading-actions');
  let frame = 0;
  const width = node => node.getBoundingClientRect().width;
  function update() {
    if (root.dataset.toolbar === 'both') return;
    const style = getComputedStyle(header), gap = parseFloat(style.columnGap) || 0;
    const available = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const visible = groups.filter(group => !group.hidden);
    const center = visible.reduce((sum, group) => sum + width(group), 0) +
      Math.max(0, visible.length - 1) * (parseFloat(getComputedStyle(nav).columnGap) || 0);
    const left = root.dataset.toolbar === 'branding'
      ? [...identity.children].reduce((sum, child) => sum + width(child), 0) + (parseFloat(getComputedStyle(identity).columnGap) || 0)
      : root.dataset.toolbar === 'filename' ? 96 : width(leading);
    const right = width(actions);
    for (const [key, value] of [['left', left], ['right', right]]) {
      const name = `--toolbar-${key}-min`, next = `${Math.ceil(value)}px`;
      if (header.style.getPropertyValue(name) !== next) header.style.setProperty(name, next);
    }
    const wrap = String(Math.ceil(left) + center + Math.ceil(right) + gap * 2 > available + .5);
    if (root.dataset.toolbarWrap !== wrap) root.dataset.toolbarWrap = wrap;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
  }
  const observer = new ResizeObserver(schedule);
  for (const node of [header, nav, actions, leading, ...identity.children, ...groups]) observer.observe(node);
  signal.addEventListener('abort', () => { observer.disconnect(); cancelAnimationFrame(frame); }, { once: true });
  return { update };
}
