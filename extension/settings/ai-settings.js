import { AI_PROVIDERS } from '../core/ai.js';
const words = {
 'en-US': {
  title:'AI explanations',
  enabled:'Explain with AI',enabledHelp:'Explain selected PDF text and ask follow-up questions. You can also use the sparkle switch in the reader.',
  model:'Model',language:'Explanation language',auto:'Interface language (default)',english:'English',chinese:'简体中文',
  context:'Include nearby paragraphs',contextHelp:'Send a small amount of text around the selection for additional context. Off by default.',
  key:'API key',keyHelp:'Your API key is encrypted and stored on this device, and is used only for AI requests you initiate.',
  save:'Save key',remove:'Delete key',test:'Test connection',saved:'Key saved.',removed:'Key deleted.',connected:'Connection successful.',
  placeholder:'Enter this service’s API key',stored:'A key is saved. Enter a new key to replace it.',missing:'No key saved for this service.',
  sending:'Testing connection…',testHelp:'Testing sends a short request to the selected service.',
  confirm:'Delete the saved API key for this service?',removeAll:'Delete all saved API keys',confirmAll:'Delete every locally saved API key? This also clears the encryption key and stops active AI requests. Other settings will stay unchanged.',allRemoved:'All saved API keys deleted.',privacy:'AI receives only the passage you choose to explain and any nearby text you choose to include. PDF reading and OCR remain on this device. Explanations are not saved after the reader closes.',
  free:'Google offers a free API tier. Quotas and availability depend on your Google AI Studio project.',
  data:'Google’s free-tier data policy differs from its paid tier. Review the service’s data-use terms before sending private text.',
  private:'AI explanations are available in regular browsing windows.',working:'Saving…',error:'Could not complete this operation. Please try again.',
  auth:'The service did not accept this key. Check the key and its API access.',quota:'This service’s quota or usage limit has been reached.',invalidKey:'Enter a valid API key.',keyMissing:'Save an API key for this service first.',unavailable:'The service could not be reached. Please try again.',cancelled:'Connection test cancelled.',timeout:'The service took too long to respond.',disabled:'AI explanations are available in regular browsing windows.'
 },
 'zh-CN': {
  title:'AI 解释',
  enabled:'使用 AI 解释',enabledHelp:'解释选中的 PDF 文字，也可针对选段继续提问。阅读器中的星芒开关也可控制此功能。',
  model:'模型',language:'解释语言',auto:'跟随界面语言（默认）',english:'English',chinese:'简体中文',
  context:'包含附近段落',contextHelp:'附带选段附近的少量文字，帮助理解上下文。默认关闭。',
  key:'API 密钥',keyHelp:'您的 API 密钥使用行业标准加密方式保存在此设备上，仅用于您主动发起的 AI 请求。',
  save:'保存密钥',remove:'删除密钥',test:'验证连接',saved:'密钥已保存。',removed:'密钥已删除。',connected:'连接成功。',
  placeholder:'输入此服务的 API 密钥',stored:'已保存密钥。输入新密钥可替换。',missing:'尚未保存此服务的密钥。',
  sending:'正在验证连接…',testHelp:'验证会向所选服务发送一个简短请求。',
  confirm:'是否删除此服务已保存的 API 密钥？',removeAll:'删除本地所有 API 密钥',confirmAll:'是否删除本地保存的所有 API 密钥？这也会清除加密存储密钥并停止正在进行的 AI 请求，其他设置保持不变。',allRemoved:'已删除本地所有 API 密钥。',privacy:'AI 仅接收您选择解释的文字，以及您选择附带的附近文字。PDF 阅读和 OCR 仍在本机进行，关闭阅读器后不保留解释记录。',
  free:'Google 提供免费 API 额度，具体额度和适用条件以您的 Google AI Studio 项目为准。',
  data:'Google 免费层与付费层的数据使用政策不同。发送私密文字前，请查看该服务的数据使用条款。',
  private:'AI 解释在普通浏览窗口中提供。',working:'正在保存…',error:'未能完成此操作，请重试。',
  auth:'服务未接受此密钥，请检查密钥和 API 访问权限。',quota:'已达到此服务的额度或使用上限。',invalidKey:'请输入有效的 API 密钥。',keyMissing:'请先保存此服务的 API 密钥。',unavailable:'暂时无法连接此服务，请重试。',cancelled:'已取消验证连接。',timeout:'服务响应超时。',disabled:'AI 解释在普通浏览窗口中提供。'
 }
};
export function createAiSettings({container,locale,state,save}) {
  let settings=state,language=locale,optionsLanguage='',keys={},privateWindow=false,busy=false,busyType='',generation=0,statusRevision=0,notice='',suspended=false;
  const $=id=>container.querySelector('#'+id);
  container.innerHTML='<h2></h2><div class="card"><div class="row"><div><h3 id="ai-enabled-title"></h3><p id="ai-enabled-help"></p></div><input id="aiEnabled" type="checkbox" role="switch" aria-labelledby="ai-enabled-title" aria-describedby="ai-enabled-help"></div><div class="row"><div><h3 id="ai-model-title"></h3></div><select id="aiProvider" aria-labelledby="ai-model-title"></select></div><div class="row"><div><h3 id="ai-language-title"></h3></div><select id="aiLanguage" aria-labelledby="ai-language-title"></select></div><div class="row"><div><h3 id="ai-context-title"></h3><p id="ai-context-help"></p></div><input id="aiIncludeContext" type="checkbox" role="switch" aria-labelledby="ai-context-title" aria-describedby="ai-context-help"></div><div class="ai-key-row"><h3 id="ai-key-title"></h3><p id="ai-key-help"></p><input id="ai-key" type="password" maxlength="512" autocomplete="off" spellcheck="false" aria-labelledby="ai-key-title" aria-describedby="ai-key-help"><p id="ai-key-state"></p><div class="ai-key-actions"><button id="ai-save" type="button"></button><button id="ai-test" type="button"></button><button id="ai-remove" type="button"></button></div><p id="ai-test-help"></p><p id="ai-key-notice" role="status" aria-live="polite"></p></div><div class="ai-privacy"><p id="ai-privacy"></p><p id="ai-free"></p><p id="ai-data"></p></div></div>';
  const clearRow=document.createElement('div');clearRow.id='ai-key-clear-row';clearRow.innerHTML='<button id="ai-remove-all" type="button"></button>';
  container.querySelector('.ai-key-row').append(clearRow);
  function render() {
    const t=words[language];container.querySelector('h2').textContent=t.title;container.querySelector('h2').id='ai-settings-title';
    for(const [id,key]of [['ai-enabled-title','enabled'],['ai-enabled-help','enabledHelp'],['ai-model-title','model'],['ai-language-title','language'],['ai-context-title','context'],['ai-context-help','contextHelp'],['ai-key-title','key'],['ai-key-help','keyHelp'],['ai-save','save'],['ai-test','test'],['ai-remove','remove'],['ai-test-help','testHelp'],['ai-privacy','privacy'],['ai-free','free'],['ai-data','data']])$(id).textContent=t[key];
    $('ai-remove-all').textContent=t.removeAll;
    if(optionsLanguage!==language){
      $('aiProvider').replaceChildren(...Object.entries(AI_PROVIDERS).map(([id,p])=>new Option(p.label+' · '+p.model,id)));
      $('aiLanguage').replaceChildren(new Option(t.auto,'auto'),new Option(t.english,'en-US'),new Option(t.chinese,'zh-CN'));optionsLanguage=language;
    }
    $('aiProvider').value=settings.aiProvider;$('aiLanguage').value=settings.aiLanguage;
    $('aiEnabled').checked=settings.aiEnabled;$('aiIncludeContext').checked=settings.aiIncludeContext;
    $('ai-key').placeholder=keys[settings.aiProvider]?t.stored:t.placeholder;
    $('ai-key-state').textContent=privateWindow?t.private:keys[settings.aiProvider]?t.stored:t.missing;
    $('ai-free').hidden=$('ai-data').hidden=settings.aiProvider!=='gemini';
    $('ai-key-notice').textContent=t[notice]||t.error;
    if(!notice)$('ai-key-notice').textContent='';
    for(const node of container.querySelectorAll('input,select,button'))node.disabled=busy||privateWindow;
    $('ai-test').disabled=busy||privateWindow||!keys[settings.aiProvider];$('ai-remove').disabled=$('ai-test').disabled;
    $('ai-remove-all').disabled=privateWindow||(busy&&busyType!=='AI_TEST_KEY');
  }
  async function command(type) {
    if(suspended||privateWindow||(busy&&!(type==='AI_DELETE_ALL_KEYS'&&busyType==='AI_TEST_KEY')))return;
    const provider=settings.aiProvider,id=++generation;statusRevision++;busy=true;busyType=type;notice=type==='AI_TEST_KEY'?'sending':'working';render();
    try {
      const result=await chrome.runtime.sendMessage({type,provider,...(type==='AI_SAVE_KEY'?{key:$('ai-key').value}:{})});
      if(id!==generation)return;
      if(!result?.ok)throw Error(result?.error||'error');
      keys=result.result.keys||{};$('ai-key').value='';
      notice=type==='AI_SAVE_KEY'?'saved':type==='AI_DELETE_KEY'?'removed':type==='AI_DELETE_ALL_KEYS'?'allRemoved':'connected';
    }catch(error){if(id===generation)notice=Object.hasOwn(words[language],error.message)?error.message:'error';}
    finally{if(id===generation){busy=false;busyType='';render();}}
  }
  $('aiEnabled').onchange=()=>save('aiEnabled',$('aiEnabled').checked);
  $('aiIncludeContext').onchange=()=>save('aiIncludeContext',$('aiIncludeContext').checked);
  $('aiLanguage').onchange=()=>save('aiLanguage',$('aiLanguage').value);
  $('aiProvider').onchange=()=>{$('ai-key').value='';notice='';save('aiProvider',$('aiProvider').value);};
  $('ai-key').oninput=()=>{if(notice==='invalidKey'){notice='';$('ai-key-notice').textContent='';}};
  $('ai-key').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void command('AI_SAVE_KEY');}};
  $('ai-save').onclick=()=>void command('AI_SAVE_KEY');$('ai-test').onclick=()=>void command('AI_TEST_KEY');
  $('ai-remove').onclick=()=>{if(confirm(words[language].confirm))void command('AI_DELETE_KEY');};
  $('ai-remove-all').onclick=()=>{if(confirm(words[language].confirmAll))void command('AI_DELETE_ALL_KEYS');};
  async function refreshStatus(){
    const revision=++statusRevision;
    try{const result=await chrome.runtime.sendMessage({type:'AI_STATUS'});if(suspended||revision!==statusRevision)return;if(result?.ok){keys=result.result.keys||{};privateWindow=result.result.private===true;}else notice='error';}
    catch{if(suspended||revision!==statusRevision)return;notice='error';}render();
  }
  void refreshStatus();
  addEventListener('pagehide',()=>{suspended=true;generation++;statusRevision++;$('ai-key').value='';});
  addEventListener('pageshow',event=>{if(event.persisted){suspended=false;busy=false;busyType='';notice='';render();void refreshStatus();}});
  render();
  return {update(nextLocale,next){const providerChanged=settings.aiProvider!==next.aiProvider;language=nextLocale;settings=next;if(providerChanged){$('ai-key').value='';notice='';}if(!suspended)render();}};
}
