import { isAppearanceMode } from '../../core/appearance.js';

// Build three local choices only when requested. No storage, network or document work.
export function createAppearanceMenu({text,signal,getMode,onChoose}) {
  const trigger=document.getElementById('theme'), menu=document.getElementById('appearance-menu');
  const choices=['auto','light','dark'];let buttons=[], pointerDown=false, pending=false, skipClick=false;
  const isOpen=()=>menu.matches(':popover-open');
  function close(focus=false){pending=false;const open=isOpen();if(open)menu.hidePopover();trigger.setAttribute('aria-expanded','false');if(open&&focus)trigger.focus({preventScroll:true});}
  function refresh(){
    menu.setAttribute('aria-label',text.themeMenu);
    for(const button of buttons){button.lastElementChild.textContent=text[{auto:'themeAuto',light:'themeLight',dark:'themeDark'}[button.dataset.mode]];button.setAttribute('aria-checked',String(button.dataset.mode===getMode()));}
  }
  function build(){
    if(buttons.length)return;
    for(const mode of choices){
      const button=document.createElement('button');button.type='button';button.className='menu-action';button.role='menuitemradio';button.tabIndex=-1;button.dataset.mode=mode;
      const check=document.createElement('span');check.className='appearance-check';check.setAttribute('aria-hidden','true');check.textContent='✓';button.append(check,document.createElement('span'));
      button.addEventListener('click',()=>{close(true);if(isAppearanceMode(mode))onChoose(mode);},{signal});menu.append(button);buttons.push(button);
    }
  }
  function open(keyboard=false){
    build();refresh();const rect=trigger.getBoundingClientRect();
    menu.style.right=Math.max(8,innerWidth-rect.right)+'px';menu.style.top=rect.bottom+6+'px';menu.style.maxHeight=Math.max(40,innerHeight-16)+'px';
    if(!isOpen())menu.showPopover();
    const height=menu.getBoundingClientRect().height;
    if(rect.bottom+6+height>innerHeight-8)menu.style.top=Math.max(8,rect.top-height-6)+'px';
    trigger.setAttribute('aria-expanded','true');
    if(keyboard)(buttons.find(button=>button.dataset.mode===getMode())||buttons[0]).focus({preventScroll:true});else menu.focus({preventScroll:true});
  }
  trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-controls',menu.id);trigger.setAttribute('aria-expanded','false');
  // Some platforms dispatch contextmenu before pointerup. Opening an auto
  // popover then makes the same pointerup immediately light-dismiss it.
  trigger.addEventListener('pointerdown',()=>{pointerDown=true;skipClick=false;},{signal});
  document.addEventListener('pointerup',()=>{
    if(!pointerDown)return;pointerDown=false;
    if(pending){pending=false;queueMicrotask(()=>{if(!signal.aborted)open(false);});}
  },{capture:true,signal});
  document.addEventListener('pointercancel',()=>{pointerDown=pending=skipClick=false;},{capture:true,signal});
  trigger.addEventListener('click',event=>{if(skipClick){skipClick=false;event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal});
  trigger.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();skipClick=pointerDown;if(pointerDown)pending=true;else open(false);},{signal});
  trigger.addEventListener('keydown',event=>{skipClick=false;if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'||event.key==='ArrowDown'){event.preventDefault();event.stopPropagation();open(true);}},{signal});
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
    else if(event.key==='Tab')close(true);
    else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();const current=buttons.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:current<0?(event.key==='ArrowUp'?buttons.length-1:0):(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
      buttons[next].focus({preventScroll:true});
    }
  },{signal});
  menu.addEventListener('toggle',()=>trigger.setAttribute('aria-expanded',String(isOpen())),{signal});
  window.addEventListener('blur',()=>{pointerDown=skipClick=false;close();},{signal});
  window.addEventListener('resize',()=>close(),{signal});signal.addEventListener('abort',()=>close(),{once:true});
  return {refresh};
}
