import { hiddenToolbarActions } from '../../core/settings.js';
import { setReaderIcon } from './icons.js';
import { createToolbarLayout } from './toolbar-layout.js';
import { bindPressAction } from './press-action.js';

const groups = {
  pages:['sidebar-toggle'], find:['search-toggle'], paging:['previous','next'],
  zoom:['zoom-out','zoom-in'], fit:['fit-width','fit-page'], rotate:['rotate'],
  fullscreen:['fullscreen'], ocr:['ocr-toggle'], print:['print'],
  properties:['properties'], native:['native']
};

// Presentation only: original controls keep their handlers, permissions and
// disabled state. The menu never adds commands to the privileged host bridge.
export function createToolbarMenu({ text, signal, onSettings, onFit, onOcrPanel, canHoldOcr }) {
  const $ = id => document.getElementById(id), trigger = $('settings'), menu = $('more-actions');
  const layout = createToolbarLayout(signal);
  let actions = [], entries = [], built = false, menuLifetime = new AbortController();
  signal.addEventListener('abort',()=>menuLifetime.abort(),{once:true});
  const isOpen = () => menu.matches(':popover-open');
  function close(focus = false) {
    const wasOpen = isOpen();
    if (wasOpen) menu.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    if (focus && wasOpen) trigger.focus();
  }
  function refresh() {
    if (!isOpen()) return;
    for (const entry of entries) {
      const source = $(entry.action), fit = entry.action.startsWith('fit-');
      entry.button.disabled = fit ? $('scale').disabled : entry.action === 'open-settings' ? false : source.disabled;
      const label = fit ? text[entry.action === 'fit-width' ? 'fitWidth' : 'fitPage'] : entry.action === 'open-settings' ? text.settings : entry.action === 'properties' ? text.menuProperties : entry.action === 'native' ? text.menuNative : source.title;
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
    menuLifetime.abort(); menuLifetime = new AbortController(); menu.replaceChildren(); entries = [];
    for (const action of [...actions.flatMap(key => groups[key]), 'open-settings']) {
      const button = document.createElement('button'); button.type = 'button'; button.role = 'menuitem'; button.tabIndex = -1; button.dataset.action = action; button.className = 'menu-action';
      if (action === 'open-settings') button.classList.add('menu-settings');
      const activate = () => {
        if (button.disabled) return;
        close(true);
        if (action === 'open-settings') onSettings();
        else if (action.startsWith('fit-')) onFit(action === 'fit-width' ? 'page-width' : 'page-fit');
        else $(action).click();
      };
      if(action==='ocr-toggle')bindPressAction(button,{click:activate,hold:()=>{close(true);onOcrPanel();},canHold:canHoldOcr,signal:menuLifetime.signal});
      else button.addEventListener('click',activate);
      menu.append(button); entries.push({ action, button });
    }
    built = true;
  }
  function open(last = false) {
    if (!actions.length) return onSettings();
    build();
    const rect = trigger.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    const right = Math.max(8, innerWidth - rect.right);
    menu.style.right = `${right}px`;
    menu.style.maxWidth = `${Math.max(0, innerWidth - right - 8)}px`;
    menu.style.maxHeight = `${Math.max(80, innerHeight - rect.bottom - 14)}px`;
    menu.showPopover(); trigger.setAttribute('aria-expanded', 'true'); refresh();
    const enabled = entries.filter(entry => !entry.button.disabled);
    (last ? enabled.at(-1) : enabled[0])?.button.focus();
  }
  // Auto popovers can light-dismiss between pointerdown and click. Remember
  // the pointer's starting state so a second trigger click cannot reopen it.
  let pointerWasOpen = false;
  trigger.addEventListener('pointerdown', () => { pointerWasOpen = isOpen(); }, { signal });
  trigger.addEventListener('pointercancel', () => { pointerWasOpen = false; }, { signal });
  trigger.addEventListener('click', event => {
    const shouldClose = isOpen() || (event.detail > 0 && pointerWasOpen);
    pointerWasOpen = false;
    if (shouldClose) { close(true); trigger.focus(); } else open();
  }, { signal });
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
    refreshLabels() { trigger.title = actions.length ? text.moreActions : text.settings; trigger.setAttribute('aria-label',trigger.title); refresh(); },
    update(settings) {
      close(true); actions = hiddenToolbarActions(settings); built = false;
      const hidden = new Set(actions);
      for (const [key, ids] of Object.entries(groups)) if (key !== 'fit') for (const id of ids) $(id).hidden = hidden.has(key);
      $('scale').hidden = hidden.has('fit'); $('scale-input').hidden = !hidden.has('fit');
      $('leading-actions').hidden = hidden.has('pages');
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
