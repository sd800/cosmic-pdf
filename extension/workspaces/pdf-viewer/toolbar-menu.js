import { hiddenToolbarActions } from '../../core/settings.js';
import { setReaderIcon } from './icons.js';
import { createToolbarLayout } from './toolbar-layout.js';

const groups = {
  pages:['sidebar-toggle'], find:['search-toggle'], paging:['previous','next'],
  zoom:['zoom-out','zoom-in'], fit:['fit-width','fit-page'], rotate:['rotate'],
  fullscreen:['fullscreen'], ocr:['ocr-toggle'], print:['print'],
  properties:['properties'], native:['native']
};

// Presentation only: original controls keep their handlers, permissions and
// disabled state. The menu never adds commands to the privileged host bridge.
export function createToolbarMenu({ text, signal, onSettings, onFit }) {
  const $ = id => document.getElementById(id), trigger = $('settings'), menu = $('more-actions');
  const pages = $('sidebar-toggle'), marker = document.createComment('pages control');
  pages.before(marker);
  const layout = createToolbarLayout(signal);
  let actions = [], entries = [], built = false;
  const isOpen = () => menu.matches(':popover-open');
  function close(focus = false) {
    if (!isOpen()) return;
    menu.hidePopover(); trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }
  function refresh() {
    if (!isOpen()) return;
    for (const entry of entries) {
      const source = $(entry.action), fit = entry.action.startsWith('fit-');
      entry.button.disabled = fit ? $('scale').disabled : entry.action === 'open-settings' ? false : source.disabled;
      const label = fit ? text[entry.action === 'fit-width' ? 'fitWidth' : 'fitPage'] : entry.action === 'open-settings' ? text.settings : source.title;
      const svg = source?.querySelector('svg'), iconKey = svg?.outerHTML || entry.action;
      if (entry.icon !== iconKey) {
        if (svg) entry.button.replaceChildren(svg.cloneNode(true));
        else setReaderIcon(entry.button, entry.action === 'open-settings' ? 'settings' : entry.action);
        const caption = document.createElement('span'); caption.textContent = label; entry.button.append(caption);
        entry.icon = iconKey;
      }
      entry.button.lastElementChild.textContent = label;
      entry.button.setAttribute('aria-label', label);
    }
  }
  function build() {
    if (built) return;
    menu.replaceChildren(); entries = [];
    for (const action of [...actions.flatMap(key => groups[key]), 'open-settings']) {
      const button = document.createElement('button'); button.type = 'button'; button.role = 'menuitem'; button.tabIndex = -1; button.dataset.action = action; button.className = 'menu-action';
      if (action === 'open-settings') button.classList.add('menu-settings');
      button.addEventListener('click', () => {
        if (button.disabled) return;
        close(true);
        if (action === 'open-settings') onSettings();
        else if (action.startsWith('fit-')) onFit(action === 'fit-width' ? 'page-width' : 'page-fit');
        else $(action).click();
      });
      menu.append(button); entries.push({ action, button });
    }
    built = true;
  }
  function open(last = false) {
    if (!actions.length) return onSettings();
    build();
    const rect = trigger.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${Math.max(8, innerWidth - rect.right)}px`;
    menu.style.maxHeight = `${Math.max(80, innerHeight - rect.bottom - 14)}px`;
    menu.showPopover(); trigger.setAttribute('aria-expanded', 'true'); refresh();
    const enabled = entries.filter(entry => !entry.button.disabled);
    (last ? enabled.at(-1) : enabled[0])?.button.focus();
  }
  trigger.addEventListener('click', () => isOpen() ? close(true) : open(), { signal });
  trigger.addEventListener('keydown', event => {
    if (!actions.length || !['ArrowDown','ArrowUp'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); open(event.key === 'ArrowUp');
  }, { signal });
  menu.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close(true);
    else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      const enabled = entries.filter(entry => !entry.button.disabled), current = enabled.findIndex(entry => entry.button === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
      enabled[next]?.button.focus();
    }
  }, { signal });
  menu.addEventListener('toggle', () => trigger.setAttribute('aria-expanded', String(isOpen())), { signal });
  window.addEventListener('resize', () => close(), { signal });
  return {
    refresh,
    update(settings) {
      close(true); actions = hiddenToolbarActions(settings); built = false;
      const hidden = new Set(actions);
      for (const [key, ids] of Object.entries(groups)) if (key !== 'fit') for (const id of ids) $(id).hidden = hidden.has(key);
      $('scale').hidden = hidden.has('fit'); $('scale-input').hidden = !hidden.has('fit');
      const leading = !settings.showFilename && !settings.showBranding && !hidden.has('pages');
      if (leading) $('leading-actions').append(pages); else marker.after(pages);
      $('leading-actions').hidden = !leading;
      let first = true;
      for (const group of document.querySelectorAll('header nav .tool-group')) {
        group.hidden = ![...group.children].some(node => !node.hidden);
        group.dataset.first = String(first && !group.hidden); if (!group.hidden) first = false;
      }
      setReaderIcon(trigger, actions.length ? 'more' : 'settings');
      trigger.title = actions.length ? text.moreActions : text.settings;
      trigger.setAttribute('aria-label', trigger.title);
      if (actions.length) { trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-controls', menu.id); trigger.setAttribute('aria-expanded', 'false'); }
      else { trigger.removeAttribute('aria-haspopup'); trigger.removeAttribute('aria-controls'); trigger.removeAttribute('aria-expanded'); }
      layout.update();
    }
  };
}
