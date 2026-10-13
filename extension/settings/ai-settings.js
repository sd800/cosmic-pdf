import { AI_PROVIDERS } from '../core/ai.js';
import { AI_WEBSITES } from '../core/ai-web.js';
const words = {
 'en-US': {
  title:'AI explanations',
  enabled:'Explain with AI',enabledHelp:'Explain selected PDF text and ask follow-up questions. Pages without selectable text are recognized as you read. You can also use the sparkle switch in the reader.',
  model:'Model',language:'Explanation language',auto:'Interface language (default)',english:'English',chinese:'简体中文',
  method:'AI connection',api:'Built-in AI via API',subscription:'Bring Your Own AI via Subscription',website:'Website',apiHelp:'Receive explanations in Cosmic PDF using your own API key.',webHelp:'Use your existing ChatGPT or Claude account without an API key. Opens beside the PDF where Chrome supports automatic split view, otherwise in the next tab.',webPrivacy:'Only selected text and any nearby paragraphs you choose are passed to the AI website. Questions are included in links and may appear in browser history or sync. Responses and follow-up questions stay on the website. Reusing the paired tab starts a new question and can replace an unsent draft.',
  context:'Include nearby paragraphs',contextHelp:'Send a small amount of text around the selection for additional context. Off by default.',
  key:'API key',keyHelp:'Your API key is encrypted and stored on this device, and is used only for AI requests you initiate.',
  save:'Save key',remove:'Delete key',test:'Test connection',saved:'Key saved.',removed:'Key deleted.',connected:'Connection successful.',
  placeholder:'Enter this service’s API key',stored:'A key is saved. Enter a new key to replace it.',missing:'No key saved for this service.',
  sending:'Testing connection…',testHelp:'Testing sends a short request to the selected service.',
  confirm:'Delete the saved API key for this service?',privacy:'AI receives only the passage you choose to explain and any nearby text you choose to include. PDF reading and OCR remain on this device. Explanations are not saved after the reader closes.',
  free:'Google offers a free API tier. Quotas and availability depend on your Google AI Studio project.',
  data:'Google’s free-tier data policy differs from its paid tier. Review the service’s data-use terms before sending private text.',
  private:'AI explanations are available in regular browsing windows.',working:'Saving…',error:'Could not complete this operation. Please try again.',
  auth:'The service did not accept this key. Check the key and its API access.',quota:'This service’s quota or usage limit has been reached.',invalidKey:'Enter a valid API key.',keyMissing:'Save an API key for this service first.',unavailable:'The service could not be reached. Please try again.',cancelled:'Connection test cancelled.',timeout:'The service took too long to respond.',disabled:'AI explanations are available in regular browsing windows.'
 },
 'zh-CN': {
  title:'AI 解释',
  enabled:'使用 AI 解释',enabledHelp:'解释选中的 PDF 文字，也可针对选段继续提问。当前页没有可选文字时会自动识别，阅读器中的星芒开关也可控制此功能。',
  model:'模型',language:'解释语言',auto:'跟随界面语言（默认）',english:'English',chinese:'简体中文',
  method:'AI 使用方式',api:'内置 AI（API）',subscription:'自带 AI（订阅账号）',website:'网站',apiHelp:'使用您自己的 API 密钥，直接在 Cosmic PDF 中查看解释。',webHelp:'使用已有的 ChatGPT 或 Claude 账号，无需 API 密钥。Chrome 支持时在 PDF 旁分屏打开，否则在相邻标签页打开。',webPrivacy:'仅将选中文字和您选择附带的附近段落交给 AI 网站。问题包含在链接中，可能出现在浏览器历史记录或同步记录中。回复和后续提问均留在该网站；复用配套标签页会开始新问题，可能替换尚未发送的草稿。',
  context:'包含附近段落',contextHelp:'附带选段附近的少量文字，帮助理解上下文。默认关闭。',
  key:'API 密钥',keyHelp:'您的 API 密钥使用行业标准加密方式保存在此设备上，仅用于您主动发起的 AI 请求。',
  save:'保存密钥',remove:'删除密钥',test:'验证连接',saved:'密钥已保存。',removed:'密钥已删除。',connected:'连接成功。',
  placeholder:'输入此服务的 API 密钥',stored:'已保存密钥。输入新密钥可替换。',missing:'尚未保存此服务的密钥。',
  sending:'正在验证连接…',testHelp:'验证会向所选服务发送一个简短请求。',
  confirm:'是否删除此服务已保存的 API 密钥？',privacy:'AI 仅接收您选择解释的文字，以及您选择附带的附近文字。PDF 阅读和 OCR 仍在本机进行，关闭阅读器后不保留解释记录。',
  free:'Google 提供免费 API 额度，具体额度和适用条件以您的 Google AI Studio 项目为准。',
  data:'Google 免费层与付费层的数据使用政策不同。发送私密文字前，请查看该服务的数据使用条款。',
  private:'AI 解释在普通浏览窗口中提供。',working:'正在保存…',error:'未能完成此操作，请重试。',
  auth:'服务未接受此密钥，请检查密钥和 API 访问权限。',quota:'已达到此服务的额度或使用上限。',invalidKey:'请输入有效的 API 密钥。',keyMissing:'请先保存此服务的 API 密钥。',unavailable:'暂时无法连接此服务，请重试。',cancelled:'已取消验证连接。',timeout:'服务响应超时。',disabled:'AI 解释在普通浏览窗口中提供。'
 }
};

Object.assign(words['en-US'],{
  savedKeys:'Saved API keys',add:'Add API key',replace:'Replace key',cancel:'Cancel',stop:'Stop test',serviceLabel:'Service',loading:'Loading saved keys…',none:'No saved API keys.',encrypted:'Encrypted on this device',selected:'Selected',replaceHelp:'Saving replaces the key for this service. The saved key is never shown here.',
  network:'Could not connect. Check your network and access to the API service.',service:'The API service is temporarily unavailable. Try again later.',incomplete:'The service returned an incomplete or unexpected response. Try again.',access:'Access denied. Check the key’s project permissions and application/API restrictions.',accountSetup:'Check the project’s billing, regional availability and account requirements.',serviceDisabled:'Enable the API service in the project that owns this key.',modelUnavailable:'This key cannot access the selected model. Check model availability for its project.',requestRejected:'The service rejected the request configuration. Update the extension or check API compatibility.',unavailable:'The connection test could not finish. Please try again.',empty:'The service returned no text. Try again.',blocked:'The service blocked this test request.',limit:'The service stopped before completing the test.'
});
Object.assign(words['zh-CN'],{
  savedKeys:'已保存的 API 密钥',add:'添加 API 密钥',replace:'替换密钥',cancel:'取消',stop:'停止测试',serviceLabel:'服务',loading:'正在读取已保存的密钥…',none:'尚未保存 API 密钥。',encrypted:'已在此设备上加密保存',selected:'已选用',replaceHelp:'保存后会替换此服务的密钥，此处不会显示已保存的密钥。',
  network:'无法建立连接，请检查网络及 API 服务访问情况。',service:'API 服务暂时不可用，请稍后重试。',incomplete:'服务返回的内容不完整或格式异常，请重试。',access:'访问被拒绝，请检查密钥的项目权限及应用／API 限制。',accountSetup:'请检查项目的结算设置、地区可用性及账号要求。',serviceDisabled:'请为此密钥所属项目启用相应 API 服务。',modelUnavailable:'此密钥无法使用所选模型，请检查所属项目的模型可用性。',requestRejected:'服务拒绝了请求配置，请更新插件或检查 API 兼容性。',unavailable:'未能完成连接测试，请重试。',empty:'服务未返回文字，请重试。',blocked:'服务阻止了此测试请求。',limit:'服务在测试完成前停止了响应。'
});
const keyIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4a6 6 0 0 0-5.5 8.4L3 18v3h3v-3h3l2.6-2.5A6 6 0 1 0 14 4Z"/><circle cx="16" cy="8" r="1"/></svg>';
const trashIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
export function createAiSettings({container,locale,state,save}) {
  let settings=state,language=locale,optionsLanguage='',keys={},keysReady=false,privateWindow=false,busy=false,busyType='',busyProvider='',generation=0,statusRevision=0,notice='',suspended=false,editing=false,draftProvider=state.aiProvider;
  const rows=new Map(),checks=new Map(),$=id=>container.querySelector('#'+id),t=()=>words[language];
  container.innerHTML='<h2></h2><div class="card"><div class="row"><div><h3 id="ai-enabled-title"></h3><p id="ai-enabled-help"></p></div><input id="aiEnabled" type="checkbox" role="switch" aria-labelledby="ai-enabled-title" aria-describedby="ai-enabled-help"></div><div class="row"><div><h3 id="ai-method-title"></h3><p id="ai-method-help"></p></div><fieldset id="aiMode" class="language-choices" aria-labelledby="ai-method-title" aria-describedby="ai-method-help"><div class="language-options"><label><input id="ai-mode-api" type="radio" name="ai-mode" value="api"><span id="ai-mode-api-label"></span></label><label><input id="ai-mode-subscription" type="radio" name="ai-mode" value="subscription"><span id="ai-mode-subscription-label"></span></label></div></fieldset></div><div class="row" id="ai-website-row"><div><h3 id="ai-website-title"></h3></div><select id="aiWebsite" aria-labelledby="ai-website-title"></select></div><div class="row" id="ai-model-row"><div><h3 id="ai-model-title"></h3></div><select id="aiProvider" aria-labelledby="ai-model-title"></select></div><div class="row"><div><h3 id="ai-language-title"></h3></div><select id="aiLanguage" aria-labelledby="ai-language-title"></select></div><div class="row"><div><h3 id="ai-context-title"></h3><p id="ai-context-help"></p></div><input id="aiIncludeContext" type="checkbox" role="switch" aria-labelledby="ai-context-title" aria-describedby="ai-context-help"></div><div class="ai-key-row" id="ai-keys"><div class="ai-keys-heading"><h3 id="ai-saved-title"></h3><button id="ai-add" type="button" aria-controls="ai-key-editor" aria-expanded="false"></button></div><p id="ai-key-help"></p><ul id="ai-key-list" aria-labelledby="ai-saved-title"></ul><p id="ai-key-empty" role="status"></p><div id="ai-key-editor" hidden><h4 id="ai-key-title"></h4><label id="ai-key-provider-label" for="ai-key-provider"></label><select id="ai-key-provider"></select><label id="ai-key-label" for="ai-key"></label><input id="ai-key" type="password" maxlength="512" autocomplete="off" spellcheck="false" aria-describedby="ai-key-editor-help"><p id="ai-key-editor-help"></p><div class="ai-key-actions"><button id="ai-save" type="button" class="primary"></button><button id="ai-key-cancel" type="button"></button></div></div><p id="ai-key-notice" role="status" aria-live="polite"></p><p id="ai-test-help"></p></div><div class="ai-privacy"><p id="ai-privacy"></p><p id="ai-free"></p><p id="ai-data"></p></div></div>';
  function renderKeys(){
    const text=t(),providers=privateWindow?[]:Object.keys(AI_PROVIDERS).filter(p=>keys[p]);
    for(const [provider,row]of rows)if(!providers.includes(provider)){row.remove();rows.delete(provider);checks.delete(provider);}
    providers.forEach((provider,index)=>{
      let row=rows.get(provider);
      if(!row){
        row=document.createElement('li');row.dataset.provider=provider;row.className='ai-saved-key';
        row.innerHTML='<span class="ai-key-icon">'+keyIcon+'</span><div class="ai-key-info"><div class="ai-key-heading"><strong></strong><span class="ai-key-selected"></span></div><span class="ai-key-model"></span><span class="ai-key-state"></span><p class="ai-key-result" role="status" aria-live="polite" hidden></p></div><div class="ai-saved-actions"><button type="button" data-action="test"></button><button type="button" data-action="replace"></button><button type="button" data-action="delete" class="ai-key-delete">'+trashIcon+'</button></div>';
        rows.set(provider,row);
      }
      if($('ai-key-list').children[index]!==row)$('ai-key-list').insertBefore(row,$('ai-key-list').children[index]||null);
      row.querySelector('strong').textContent=AI_PROVIDERS[provider].label;
      row.querySelector('.ai-key-model').textContent=AI_PROVIDERS[provider].model;
      const chosen=row.querySelector('.ai-key-selected');chosen.textContent=text.selected;chosen.hidden=settings.aiMode!=='api'||settings.aiProvider!==provider;
      row.querySelector('.ai-key-state').textContent=text.encrypted;
      const result=row.querySelector('.ai-key-result'),value=checks.get(provider);result.hidden=!value;result.textContent=value?(text[value]||text.error):'';result.dataset.error=String(!!value&&!['connected','sending','cancelled'].includes(value));
      for(const action of ['test','replace','delete']){
        const button=row.querySelector('[data-action='+action+']'),testing=busy&&busyType==='AI_TEST_KEY'&&busyProvider===provider;
        const label=action==='test'?(testing?text.stop:text.test):action==='replace'?text.replace:text.remove;
        if(action!=='delete')button.textContent=label;
        button.title=button.ariaLabel=label+' · '+AI_PROVIDERS[provider].label;
        button.disabled=privateWindow||busy&&!(action==='test'&&testing);
      }
    });
    $('ai-key-empty').hidden=providers.length>0;$('ai-key-empty').textContent=privateWindow?text.private:keysReady?text.none:text.loading;
    $('ai-keys').hidden=settings.aiMode==='subscription'&&!providers.length;
  }
  function render() {
    const text=t(),subscription=settings.aiMode==='subscription';
    container.querySelector('h2').textContent=text.title;container.querySelector('h2').id='ai-settings-title';
    for(const [id,key]of [['ai-enabled-title','enabled'],['ai-enabled-help','enabledHelp'],['ai-model-title','model'],['ai-language-title','language'],['ai-context-title','context'],['ai-context-help','contextHelp'],['ai-key-help','keyHelp'],['ai-save','save'],['ai-key-cancel','cancel'],['ai-test-help','testHelp'],['ai-privacy','privacy'],['ai-free','free'],['ai-data','data'],['ai-saved-title','savedKeys'],['ai-add','add'],['ai-key-provider-label','serviceLabel'],['ai-key-label','key']])$(id).textContent=text[key];
    $('ai-method-title').textContent=text.method;$('ai-method-help').textContent=text[subscription?'webHelp':'apiHelp'];$('ai-website-title').textContent=text.website;
    $('ai-mode-api-label').textContent=text.api;$('ai-mode-subscription-label').textContent=text.subscription;
    if(optionsLanguage!==language){
      $('aiProvider').replaceChildren(...Object.entries(AI_PROVIDERS).map(([id,p])=>new Option(p.label+' · '+p.model,id)));
      $('ai-key-provider').replaceChildren(...Object.entries(AI_PROVIDERS).map(([id,p])=>new Option(p.label,id)));
      $('aiWebsite').replaceChildren(...Object.entries(AI_WEBSITES).map(([id,p])=>new Option(p.label,id)));
      $('aiLanguage').replaceChildren(new Option(text.auto,'auto'),new Option(text.english,'en-US'),new Option(text.chinese,'zh-CN'));optionsLanguage=language;
    }
    $('aiProvider').value=settings.aiProvider;$('aiLanguage').value=settings.aiLanguage;$('aiWebsite').value=settings.aiWebsite;$('ai-key-provider').value=draftProvider;
    for(const node of $('aiMode').querySelectorAll('input'))node.checked=node.value===settings.aiMode;
    $('ai-website-row').hidden=!subscription;$('ai-model-row').hidden=subscription;
    $('aiEnabled').checked=settings.aiEnabled;$('aiIncludeContext').checked=settings.aiIncludeContext;
    $('ai-key-editor').hidden=!editing||privateWindow;$('ai-add').hidden=subscription||editing;$('ai-add').setAttribute('aria-expanded',String(editing));
    $('ai-key-title').textContent=text[keys[draftProvider]?'replace':'add'];$('ai-key-editor-help').textContent=keys[draftProvider]?text.replaceHelp:'';
    $('ai-key').placeholder=text.placeholder;$('ai-key-notice').textContent=notice?(text[notice]||text.error):'';
    $('ai-test-help').hidden=!Object.values(keys).some(Boolean)||privateWindow;
    $('ai-privacy').textContent=text[subscription?'webPrivacy':'privacy'];$('ai-free').hidden=$('ai-data').hidden=subscription||settings.aiProvider!=='gemini';
    for(const node of container.querySelectorAll('input,select,button'))node.disabled=busy;
    for(const node of $('ai-key-editor').querySelectorAll('input,select,button'))node.disabled=busy||privateWindow;
    $('ai-add').disabled=busy||privateWindow||!keysReady;$('ai-save').disabled=busy||privateWindow||!$('ai-key').value.trim();
    $('aiEnabled').disabled=busy||privateWindow&&!subscription;
    renderKeys();
  }
  function edit(provider=settings.aiProvider){if(busy||privateWindow||!keysReady)return;draftProvider=provider;editing=true;notice='';$('ai-key').value='';render();$('ai-key').focus();}
  function closeEditor(){editing=false;$('ai-key').value='';render();}
  async function command(type,provider=draftProvider) {
    if(suspended||privateWindow||busy)return;
    const key=type==='AI_SAVE_KEY'?$('ai-key').value:undefined,id=++generation;statusRevision++;busy=true;busyType=type;busyProvider=provider;notice='';
    if(type==='AI_TEST_KEY')checks.set(provider,'sending');else notice='working';render();
    try {
      const result=await chrome.runtime.sendMessage({type,provider,...(key===undefined?{}:{key})});
      if(id!==generation||suspended)return;
      if(!result?.ok)throw Error(result?.error||'error');
      keys=result.result.keys||{};keysReady=true;
      if(type==='AI_TEST_KEY')checks.set(provider,'connected');
      else{checks.delete(provider);$('ai-key').value='';editing=false;notice=type==='AI_SAVE_KEY'?'saved':'removed';}
    }catch(error){if(id===generation&&!suspended){const message=Object.hasOwn(words[language],error.message)?error.message:'error';if(type==='AI_TEST_KEY')checks.set(provider,message);else notice=message;}}
    finally{if(id===generation&&!suspended){busy=false;busyType='';busyProvider='';render();}}
  }
  $('ai-key-list').onclick=event=>{
    const button=event.target.closest('button[data-action]'),provider=button?.closest('[data-provider]')?.dataset.provider;if(!button||button.disabled||!Object.hasOwn(AI_PROVIDERS,provider))return;
    if(button.dataset.action==='replace')edit(provider);
    else if(button.dataset.action==='delete'){if(confirm(t().confirm+'\n'+AI_PROVIDERS[provider].label))void command('AI_DELETE_KEY',provider);}
    else if(busy){button.disabled=true;void chrome.runtime.sendMessage({type:'AI_CANCEL_TEST_KEY',provider}).then(result=>{if(!result?.ok&&busy)render();},()=>{if(busy)render();});}
    else void command('AI_TEST_KEY',provider);
  };
  $('aiEnabled').onchange=()=>save('aiEnabled',$('aiEnabled').checked);
  $('aiIncludeContext').onchange=()=>save('aiIncludeContext',$('aiIncludeContext').checked);
  $('aiLanguage').onchange=()=>save('aiLanguage',$('aiLanguage').value);
  for(const node of $('aiMode').querySelectorAll('input'))node.onchange=()=>{if(node.checked)save('aiMode',node.value);};
  $('aiWebsite').onchange=()=>save('aiWebsite',$('aiWebsite').value);
  $('aiProvider').onchange=()=>save('aiProvider',$('aiProvider').value);
  $('ai-add').onclick=()=>edit();$('ai-key-cancel').onclick=closeEditor;
  $('ai-key-provider').onchange=()=>{draftProvider=$('ai-key-provider').value;$('ai-key').value='';notice='';render();};
  $('ai-key').oninput=()=>{if(notice){notice='';$('ai-key-notice').textContent='';}$('ai-save').disabled=busy||!$('ai-key').value.trim();};
  $('ai-key').onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();if(!$('ai-save').disabled)void command('AI_SAVE_KEY');}else if(event.key==='Escape'){event.preventDefault();closeEditor();$('ai-add').focus();}};
  $('ai-save').onclick=()=>void command('AI_SAVE_KEY');
  async function refreshStatus(){
    const revision=++statusRevision;
    try{const result=await chrome.runtime.sendMessage({type:'AI_STATUS'});if(suspended||revision!==statusRevision)return;if(result?.ok){keys=result.result.keys||{};privateWindow=result.result.private===true;keysReady=true;}else notice='error';}
    catch{if(suspended||revision!==statusRevision)return;notice='error';}render();
  }
  void refreshStatus();
  addEventListener('pagehide',()=>{suspended=true;generation++;statusRevision++;$('ai-key').value='';});
  addEventListener('pageshow',event=>{if(event.persisted){suspended=false;busy=false;busyType='';busyProvider='';notice='';checks.clear();editing=false;render();void refreshStatus();}});
  render();
  return {update(nextLocale,next){const methodChanged=settings.aiMode!==next.aiMode;language=nextLocale;settings=next;if(methodChanged){editing=false;$('ai-key').value='';notice='';}if(!suspended)render();}};
}
