import { AI_PROVIDERS, AI_LIMITS } from '../../core/ai.js';
import { PermissionFlag } from '../../vendor/pdfjs/pdf.min.mjs';
const copy = {
 'en-US': {
  title:'Explain with AI',on:'Turn off AI explanations',off:'Turn on AI explanations',explain:'Explain with AI',close:'Close AI explanations',
  selected:'Selected passage',page:'Page',intro:'Select text on a PDF page, then choose Explain with AI.',
  privacy:'Only the selected passage and any nearby text you choose to include are sent to your selected AI service.',
  context:'Include nearby paragraphs',again:'Explain again',ask:'Ask a follow-up',send:'Send',placeholder:'Ask about this passage…',stop:'Stop',
  clear:'Clear conversation',working:'Explaining…',complete:'Explanation complete.',settings:'Open Settings',missing:'Add an API key in Settings to start.',
  private:'AI explanations are available in regular browsing windows.',sensitive:'Google’s free-tier data policy differs from its paid tier. Use the appropriate API plan for private documents.',
  auth:'The service did not accept the saved key. Check it in Settings.',quota:'This service’s quota or usage limit has been reached.',
  unavailable:'The explanation could not finish. Please try again.',timeout:'The service took too long to respond.',empty:'The service returned no explanation.',
  blocked:'The service could not explain this passage.',limit:'This explanation reached its limit. Select a shorter passage or start a new explanation.',
  invalidRequest:'Select a shorter passage or start a new explanation.',disabled:'Turn on AI explanations to continue.',keyMissing:'Add an API key in Settings to start.',
  cancelled:'Explanation stopped.',permission:'This document does not allow text extraction.',tooLong:'Select up to 8,000 characters.',
  historyLimit:'Start a new explanation to continue.',finishedNote:'AI explanations can contain mistakes. Check them against the passage.'
 },
 'zh-CN': {
  title:'AI 解释',on:'关闭 AI 解释',off:'开启 AI 解释',explain:'使用 AI 解释',close:'关闭 AI 解释栏',
  selected:'选中文字',page:'页',intro:'选取 PDF 页面上的文字，再点击「使用 AI 解释」。',
  privacy:'仅将选中文字和您选择附带的附近文字发送至所选 AI 服务。',
  context:'包含附近段落',again:'重新解释',ask:'继续提问',send:'发送',placeholder:'针对这段内容提问…',stop:'停止',
  clear:'清除对话',working:'正在解释…',complete:'解释完成。',settings:'打开设置',missing:'请先在设置中添加 API 密钥。',
  private:'AI 解释在普通浏览窗口中提供。',sensitive:'Google 免费层与付费层的数据使用政策不同。私密文档请使用适合的 API 方案。',
  auth:'服务未接受已保存的密钥，请在设置中检查。',quota:'已达到此服务的额度或使用上限。',
  unavailable:'未能完成解释，请重试。',timeout:'服务响应超时。',empty:'服务未返回解释内容。',
  blocked:'服务未能解释这段内容。',limit:'已达到此次解释的上限，请缩短选段或重新解释。',
  invalidRequest:'请缩短选段或重新开始解释。',disabled:'请开启 AI 解释后继续。',keyMissing:'请先在设置中添加 API 密钥。',
  cancelled:'已停止解释。',permission:'此文档不允许提取文字。',tooLong:'请选择不超过 8,000 个字符的文字。',
  historyLimit:'请重新开始解释后继续。',finishedNote:'AI 解释可能存在错误，请结合原文核对。'
 }
};
function layerFor(node) { return (node?.nodeType === 1 ? node : node?.parentElement)?.closest('.textLayer,.ocr-text-layer'); }
export function pdfSelection(selection, pages) {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range=selection.getRangeAt(0),start=layerFor(range.startContainer),end=layerFor(range.endContainer);
  if(!start||!end||!pages.contains(start)||!pages.contains(end)||getComputedStyle(start).display==='none'||getComputedStyle(end).display==='none')return null;
  const text=range.toString();if(!text.trim())return null;
  const page=Number(start.closest('.page')?.dataset.pageNumber);if(!Number.isSafeInteger(page)||page<1)return null;
  return {text,page,range:range.cloneRange(),start,end};
}
function nearby(snapshot) {
  try {
    const before=document.createRange();before.selectNodeContents(snapshot.start);before.setEnd(snapshot.range.startContainer,snapshot.range.startOffset);
    const after=document.createRange();after.selectNodeContents(snapshot.end);after.setStart(snapshot.range.endContainer,snapshot.range.endOffset);
    return before.toString().slice(-1500)+'\n[Selected passage]\n'+after.toString().slice(0,1500);
  } catch { return ''; }
}
export function createAiReader({settings,post,getPdf,getLocale,signal,onBusy=()=>{}}) {
  const $=id=>document.getElementById(id),panel=$('ai-panel'),entry=$('ai-selection'),toggle=$('ai-toggle'),pages=$('pages');
  let prefs=settings,status={keys:{}},source=null,history=[],active=null,sequence=0,selectionFrame=0,selecting=false,closed=false,notice='',permission;
  const t=()=>copy[getLocale()]||copy['en-US'];
  function enabled(){return prefs.aiEnabled===true;}
  function openPanel(){panel.hidden=false;document.documentElement.dataset.aiOpen='true';$('ocr-panel').hidden=true;document.documentElement.dataset.ocrOpen='false';}
  function closePanel(){panel.hidden=true;document.documentElement.dataset.aiOpen='false';}
  function cancel(){if(!active)return;const job=active;active=null;post({type:'ai-cancel',id:job.id});notice='cancelled';render();}
  function render(){
    const text=t();toggle.setAttribute('aria-pressed',String(enabled()));toggle.title=text[enabled()?'on':'off'];toggle.setAttribute('aria-label',toggle.title);
    toggle.disabled=status.private===true;
    for(const [id,key]of [['ai-title','title'],['ai-close','close'],['ai-intro','intro'],['ai-disclosure','privacy'],['ai-context-label','context'],['ai-again','again'],['ai-stop','stop'],['ai-clear','clear'],['ai-settings','settings'],['ai-ask-label','ask'],['ai-send','send'],['ai-selection','explain'],['ai-note','finishedNote']]){
      if(id==='ai-close'){$(id).title=text[key];$(id).setAttribute('aria-label',text[key]);}else $(id).textContent=text[key];
    }
    $('ai-question').placeholder=text.placeholder;$('ai-context').checked=prefs.aiIncludeContext;
    const configured=!status.private&&status.keys?.[prefs.aiProvider];
    $('ai-intro').textContent=status.private?text.private:configured?text.intro:text.missing;
    $('ai-intro').hidden=!!source&&!!configured;
    $('ai-disclosure').hidden=!!source;
    $('ai-gemini-note').hidden=prefs.aiProvider!=='gemini';$('ai-gemini-note').textContent=text.sensitive;
    $('ai-source').hidden=!source;
    $('ai-source-label').textContent=source?text.selected+' · '+text.page+' '+source.page:'';
    $('ai-source-text').textContent=source?.selection||'';
    $('ai-status').textContent=notice?text[notice]||text.unavailable:'';
    $('ai-stop').hidden=!active;$('ai-again').disabled=!source||!!active||!enabled()||!configured;
    $('ai-clear').disabled=!source&& !history.length;
    const blocked=!source||!!active||!enabled()||!configured||!history.length||history.length>AI_LIMITS.turns;
    $('ai-question').disabled=$('ai-send').disabled=blocked;
    $('ai-settings').hidden=!!configured && notice!=='auth' && notice!=='keyMissing';
    panel.setAttribute('aria-busy',String(!!active));
    onBusy(!!active);
  }
  function hideEntry(){entry.hidden=true;cancelAnimationFrame(selectionFrame);selectionFrame=0;}
  function select(){
    selectionFrame=0;if(closed||selecting||!enabled()||!getPdf())return hideEntry();
    const chosen=pdfSelection(getSelection(),pages);if(!chosen||!panel.hidden&&source?.selection===chosen.text&&source.page===chosen.page)return hideEntry();
    const rectangles=chosen.range.getClientRects(),last=rectangles[rectangles.length-1];if(!last||!last.width||!last.height)return hideEntry();
    const viewport=$('viewport').getBoundingClientRect();
    if(last.bottom<viewport.top||last.top>viewport.bottom)return hideEntry();
    entry.hidden=false;entry.disabled=chosen.text.length>AI_LIMITS.selection;
    entry.title=entry.disabled?t().tooLong:t().explain;
    const box=entry.getBoundingClientRect();
    entry.style.left=Math.max(8,Math.min(last.right-box.width,innerWidth-box.width-8))+'px';
    const below=last.bottom+8;
    entry.style.top=(below+box.height<=Math.min(viewport.bottom,innerHeight)-8?below:Math.max(viewport.top+8,last.top-box.height-8))+'px';
  }
  function scheduleSelection(){if(closed||selecting||!enabled()||selectionFrame)return;selectionFrame=requestAnimationFrame(select);}
  function article(role,content){
    const node=document.createElement('article');node.className='ai-message ai-'+role;node.textContent=content;node.setAttribute('dir','auto');$('ai-messages').append(node);return node;
  }
  function scrollBottom(){const list=$('ai-messages');list.scrollTop=list.scrollHeight;}
  function run(question=''){
    if(!source||active||!enabled()||history.length&&!question.trim())return;
    if(status.private||!status.keys?.[prefs.aiProvider]){notice='keyMissing';openPanel();render();return;}
    if(history.length>AI_LIMITS.turns||history.reduce((n,m)=>n+m.content.length,0)>AI_LIMITS.history){notice='historyLimit';render();return;}
    const id='ai-'+(++sequence)+'-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>n.toString(16).padStart(2,'0')).join('');
    const asked=question.trim();if(asked)article('user',asked);
    const node=article('assistant','');active={id,node,answer:'',question:asked,model:AI_PROVIDERS[prefs.aiProvider].model};
    notice='working';$('ai-model').textContent=active.model;$('ai-question').value='';openPanel();render();scrollBottom();
    post({type:'ai-request',id,request:{selection:source.selection,context:prefs.aiIncludeContext?source.context:'',page:source.page,
      history,question:asked,locale:getLocale()}});
  }
  async function explain(){
    const chosen=pdfSelection(getSelection(),pages);if(!chosen||chosen.text.length>AI_LIMITS.selection)return;
    if(!getPdf())return;
    const own=++sequence;hideEntry();cancel();openPanel();
    try {
      permission ||= getPdf().getPermissions();
      const flags=await permission;if(closed||sequence!==own||!enabled())return;
      if(flags&&!flags.includes(PermissionFlag.COPY)){notice='permission';render();return;}
      source={selection:chosen.text,context:nearby(chosen),page:chosen.page};history=[];$('ai-messages').replaceChildren();$('ai-model').textContent='';notice='';render();run();
    }catch{permission=null;if(!closed&&sequence===own){notice='unavailable';render();}}
  }
  toggle.addEventListener('click',event=>{if(event.isTrusted)post({type:'ai-toggle',enabled:!enabled()});},{signal});
  entry.addEventListener('pointerdown',event=>event.preventDefault(),{signal});
  entry.addEventListener('click',event=>{if(event.isTrusted)void explain();},{signal});
  $('ai-close').addEventListener('click',closePanel,{signal});
  $('ai-stop').addEventListener('click',cancel,{signal});
  $('ai-again').addEventListener('click',()=>{if(active||!source)return;history=[];$('ai-messages').replaceChildren();run();},{signal});
  $('ai-clear').addEventListener('click',()=>{sequence++;cancel();source=null;history=[];notice='';$('ai-messages').replaceChildren();$('ai-model').textContent='';$('ai-question').value='';render();},{signal});
  $('ai-settings').addEventListener('click',()=>post({type:'settings'}),{signal});
  $('ai-context').addEventListener('change',()=>post({type:'ai-context',enabled:$('ai-context').checked}),{signal});
  $('ai-send').addEventListener('click',event=>{if(event.isTrusted)run($('ai-question').value.slice(0,AI_LIMITS.question));},{signal});
  $('ai-question').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(event.isTrusted&&$('ai-question').value.trim())run($('ai-question').value);}},{signal});
  document.addEventListener('selectionchange',scheduleSelection,{signal});
  document.addEventListener('pointerdown',event=>{if(event.target.closest('#ai-selection,#ai-panel'))return;selecting=true;hideEntry();},{signal,capture:true});
  document.addEventListener('pointerup',()=>{selecting=false;scheduleSelection();},{signal});
  document.addEventListener('pointercancel',()=>{selecting=false;hideEntry();},{signal});
  $('viewport').addEventListener('scroll',hideEntry,{signal,passive:true});
  window.addEventListener('resize',hideEntry,{signal});
  $('ocr-toggle').addEventListener('click',closePanel,{signal});
  const observer=new MutationObserver(()=>{if(!$('ocr-panel').hidden)closePanel();});
  observer.observe($('ocr-panel'),{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',()=>{hideEntry();if(!document.hidden)post({type:'ai-refresh'});},{signal});
  function destroy(){if(closed)return;sequence++;cancel();closed=true;hideEntry();observer.disconnect();source=null;history=[];active=null;$('ai-messages').replaceChildren();}
  signal.addEventListener('abort',destroy,{once:true});
  render();
  return {
    preferences(next){const was=enabled();prefs=next;if(was&&!enabled()){sequence++;hideEntry();cancel();closePanel();}if(!was&&enabled()&&source)openPanel();render();if(!was&&enabled()){post({type:'ai-refresh'});scheduleSelection();}},
    status(next){status=next||{keys:{}};render();if(enabled()&&!status.keys?.[prefs.aiProvider]&&!source)openPanel();},
    localize:render,
    event(message){
      const job=active;if(!job||message.id!==job.id||closed)return;
      if(message.type==='started'){job.model=String(message.model||'').slice(0,100);$('ai-model').textContent=job.model;}
      else if(message.type==='delta'&&typeof message.text==='string'){
        const list=$('ai-messages'),atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<60;
        job.answer+=message.text;if(job.answer.length>AI_LIMITS.output){cancel();notice='limit';render();return;}
        job.node.textContent=job.answer;if(atBottom)scrollBottom();
      }else if(message.type==='done'){
        if(job.question)history.push({role:'user',content:job.question});history.push({role:'assistant',content:job.answer});
        active=null;notice='complete';render();
      }else if(message.type==='error'){active=null;notice=message.error;job.node.classList.add('ai-incomplete');render();}
    },
    destroy
  };
}
