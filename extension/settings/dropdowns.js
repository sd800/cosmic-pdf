// Passive settings pickers: keep select/value/change as the preference boundary,
// while every visible menu uses the same theme-aware DOM and keyboard behavior.
export function createSettingsDropdowns(root=document.body) {
  const controls=new Map();let active=null,counter=0;
  function close(focus=false) {
    if(!active)return;const item=active;active=null;item.menu.remove();item.menu.replaceChildren();item.focused=null;item.resetTyping?.();item.button.setAttribute('aria-expanded','false');
    item.button.removeAttribute('aria-activedescendant');if(focus&&item.button.isConnected)item.button.focus();
  }
  function position(item) {
    const box=item.button.getBoundingClientRect(),space=innerHeight-box.bottom-12,up=space<150&&box.top>space;
    const height=Math.max(80,Math.min(360,up?box.top-12:space));
    Object.assign(item.menu.style,{left:Math.max(8,Math.min(box.left,innerWidth-box.width-8))+'px',width:Math.min(box.width,innerWidth-16)+'px',maxHeight:height+'px',top:up?'auto':box.bottom+4+'px',bottom:up?innerHeight-box.top+4+'px':'auto'});
  }
  function focusOption(item,index) {
    const available=[...item.menu.children].filter(node=>node.getAttribute('aria-disabled')!=='true');if(!available.length)return;
    const node=available[Math.max(0,Math.min(index,available.length-1))];item.focused=node;
    for(const child of item.menu.children)child.dataset.focused=String(child===node);
    item.button.setAttribute('aria-activedescendant',node.id);node.scrollIntoView({block:'nearest'});
  }
  function choose(item,option) {
    if(option.disabled||item.select.disabled)return;
    const changed=item.select.value!==option.value;item.select.value=option.value;close(true);sync(item);
    if(changed){item.select.dispatchEvent(new Event('input',{bubbles:true}));item.select.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  function open(select) {
    const item=controls.get(select);if(!item||select.disabled||!item.button.getClientRects().length)return;
    if(active===item){close();return;}close();sync(item);active=item;item.menu.replaceChildren();
    for(const option of select.options) {
      if(option.hidden)continue;const row=document.createElement('div');row.id='pdf-option-'+(++counter);row.setAttribute('role','option');row.setAttribute('aria-selected',String(option.selected));row.setAttribute('aria-disabled',String(option.disabled));
      const label=document.createElement('span'),check=document.createElement('span');label.textContent=option.label;check.className='settings-picker-check';check.setAttribute('aria-hidden','true');check.textContent=option.selected?'✓':'';row.append(label,check);
      if(option.dataset.detail){const detail=document.createElement('small');detail.textContent=option.dataset.detail;row.append(detail);}
      row.addEventListener('pointerdown',event=>event.preventDefault());row.addEventListener('click',()=>choose(item,option));row.addEventListener('pointermove',()=>{if(!option.disabled){item.focused=row;for(const child of item.menu.children)child.dataset.focused=String(child===row);item.button.setAttribute('aria-activedescendant',row.id);}});
      item.menu.append(row);row.option=option;
    }
    root.append(item.menu);position(item);item.button.setAttribute('aria-expanded','true');
    const available=[...item.menu.children].filter(node=>node.getAttribute('aria-disabled')!=='true');
    focusOption(item,Math.max(0,available.findIndex(node=>node.option.selected)));item.button.focus();
  }
  function sync(item) {
    item.label.textContent=item.select.selectedOptions[0]?.label||'';item.button.disabled=item.select.disabled;
    for(const attr of ['aria-labelledby','aria-describedby']){const value=item.select.getAttribute(attr);if(value)item.button.setAttribute(attr,value);else item.button.removeAttribute(attr);}
    item.button.title=item.select.selectedOptions[0]?.label||'';
    if(active===item&&(item.select.disabled||!item.button.getClientRects().length))close();
  }
  function refresh() {
    for(const [select,item]of controls)if(!root.contains(select)){if(active===item)close();controls.delete(select);}
    for(const select of root.querySelectorAll('select')) {
      if(select.multiple||select.size>1)continue;let item=controls.get(select);
      if(!item){
        const wrapper=document.createElement('span'),button=document.createElement('button'),label=document.createElement('span'),arrow=document.createElement('span'),menu=document.createElement('div');
        wrapper.className='settings-picker';button.type='button';button.className='settings-picker-button';button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
        menu.className='settings-picker-menu';menu.id='pdf-picker-'+(++counter);menu.setAttribute('role','listbox');button.setAttribute('aria-controls',menu.id);
        label.className='settings-picker-value';arrow.className='settings-picker-arrow';arrow.setAttribute('aria-hidden','true');button.append(label,arrow);
        select.before(wrapper);wrapper.append(select,button);select.classList.add('settings-picker-source');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
        item={select,button,label,menu};controls.set(select,item);
        button.addEventListener('click',()=>open(select));select.addEventListener('change',()=>sync(item));select.addEventListener('focus',()=>button.focus());
        let prefix='',last=0;item.resetTyping=()=>{prefix='';last=0;};
        button.addEventListener('keydown',event=>{
          if(event.isComposing||event.metaKey||event.ctrlKey)return;
          if(event.key==='Escape'&&active===item){event.preventDefault();close(true);return;}
          if(event.key==='Tab'){close();return;}
          if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
            event.preventDefault();if(active!==item){open(select);return;}
            const available=[...menu.children].filter(node=>node.getAttribute('aria-disabled')!=='true'),index=available.indexOf(item.focused);
            if(event.key==='Enter'||event.key===' '){if(item.focused)choose(item,item.focused.option);}
            else focusOption(item,event.key==='Home'?0:event.key==='End'?available.length-1:index+(event.key==='ArrowDown'?1:-1));
          }else if(event.key.length===1&&!event.altKey){
            event.preventDefault();if(active!==item)open(select);const now=performance.now();prefix=now-last<700?prefix+event.key:event.key;last=now;
            const available=[...menu.children].filter(node=>node.getAttribute('aria-disabled')!=='true'),index=available.findIndex(node=>node.option.label.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()));if(index>=0)focusOption(item,index);
          }
        });
      }sync(item);
    }
  }
  document.addEventListener('pointerdown',event=>{if(active&&!active.menu.contains(event.target)&&!active.button.contains(event.target))close();},true);
  document.addEventListener('focusin',event=>{if(active&&event.target!==active.button&&!active.menu.contains(event.target))close();});
  document.addEventListener('scroll',event=>{if(active&&!active.menu.contains(event.target)){const box=active.button.getBoundingClientRect();if(box.bottom<0||box.top>innerHeight)close();else position(active);}},true);
  addEventListener('resize',()=>close());addEventListener('blur',()=>close());addEventListener('pagehide',()=>close());
  return {refresh,open,close};
}
