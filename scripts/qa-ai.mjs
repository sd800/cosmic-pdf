// AI browser QA uses fake credentials and a localhost-only streaming service.
// Endpoint replacement happens only in the disposable extension copy.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AI_PROVIDERS } from '../extension/core/ai.js';
import { AI_WEBSITES } from '../extension/core/ai-web.js';
export const mockAi = { calls: [], mode: 'normal', cancelled: 0 };
export function handleAiMock(req, res) {
  if (!req.url.startsWith('/mock-ai/')) return false;
  const provider=req.url.split('/')[2]; let body='';
  req.on('data',chunk=>{body+=chunk;if(body.length>100000)req.destroy();});
  req.on('end',()=>{
    const input=JSON.parse(body);mockAi.calls.push({provider,input});
    const secret=provider==='openai'?req.headers.authorization?.replace('Bearer ',''):req.headers[provider==='gemini'?'x-goog-api-key':'x-api-key'];
    assert.equal(secret,'qa-not-a-real-key-'+provider);
    assert.equal(body.includes('qa-not-a-real-key'),false);assert.equal(req.headers.cookie,undefined);
    if(mockAi.mode==='auth'){res.writeHead(401);res.end('private upstream details');return;}
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.flushHeaders();
    const testing=body.includes('Test connection.'),texts=testing?['OK']:['Mock explanation for this passage.\n\n','<img src=x onerror=alert(1)> is plain text.'];
    function frame(text,end=false){
      const value=provider==='openai'?(end?{type:'response.completed'}:{type:'response.output_text.delta',delta:text}):provider==='claude'?(end?{type:'message_stop'}:{type:'content_block_delta',delta:{type:'text_delta',text}}):{candidates:[{content:{parts:text?[{text}]:[]},...(end?{finishReason:'STOP'}:{})}]};
      res.write('data: '+JSON.stringify(value)+'\n\n');
    }
    frame(texts[0]);
    let timer;
    if(mockAi.mode!=='hold')timer=setTimeout(()=>{if(texts[1])frame(texts[1]);frame('',true);res.end();},700);
    res.on('close',()=>{clearTimeout(timer);if(!res.writableEnded)mockAi.cancelled++;});
  });return true;
}
export async function prepareAiMock(ext,base){
  const file=join(ext,'core/ai.js');let source=await readFile(file,'utf8');
  for(const [provider,config]of Object.entries(AI_PROVIDERS))source=source.replace(config.endpoint,base+'/mock-ai/'+provider);
  await writeFile(file,source);
}
export async function runAiQa({context,worker,page,settings,open,report,folder}){
  const {version}=JSON.parse(await readFile('extension/manifest.json','utf8'));const out=resolve('test-dist/ai-api-'+version);await mkdir(out,{recursive:true});
  const prefs=await context.newPage();await prefs.goto(settings);
  await prefs.waitForSelector('#aiLanguage');
  await prefs.locator('#ai-mode-api').check();
  await prefs.locator('#locale').selectOption('en-US');await prefs.locator('#appearance').selectOption('light');
  await prefs.locator('#sampling').selectOption('1');
  await prefs.waitForFunction(async()=>{const s=(await chrome.storage.local.get('settings')).settings;return s.locale==='en-US'&&s.appearance==='light'&&s.sampling===1;});
  const width=await prefs.locator('#aiLanguage').evaluate(node=>{
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=getComputedStyle(node).font;
    return {actual:node.clientWidth,needed:ctx.measureText(node.selectedOptions[0].textContent).width+44};
  });assert.ok(width.actual>=width.needed,'default explanation-language label fits');
  assert.equal(await prefs.locator('#aiEnabled').isChecked(),false);
  for(const provider of Object.keys(AI_PROVIDERS)){
    await prefs.locator('#aiProvider').selectOption(provider);
    await prefs.waitForFunction(async p=>(await chrome.storage.local.get('settings')).settings.aiProvider===p,provider);
    await prefs.locator('#ai-key').fill('qa-not-a-real-key-'+provider);await prefs.locator('#ai-save').click();
    await prefs.waitForFunction(()=>document.querySelector('#ai-key-notice').textContent==='Key saved.');
    assert.equal(await prefs.locator('#ai-key').inputValue(),'');
  }
  await prefs.locator('#ai-test').click();await prefs.waitForFunction(()=>document.querySelector('#ai-key-notice').textContent==='Connection successful.');
  const vault=await worker.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('cosmic-pdf-api-vault');r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
    const all=await new Promise(resolve=>{const r=db.transaction('keys').objectStore('keys').getAll();r.onsuccess=()=>resolve(r.result);});db.close();
    return {count:all.length,root:all.some(x=>x instanceof CryptoKey&&!x.extractable&&x.algorithm.name==='AES-GCM'),plaintext:JSON.stringify(all).includes('qa-not-a-real-key')};
  });assert.deepEqual(vault,{count:4,root:true,plaintext:false});
  assert.equal(JSON.stringify(await worker.evaluate(()=>chrome.storage.local.get())).includes('qa-not-a-real-key'),false);
  let frame=await open('/ai-passage?private-test-token=not-for-the-model');
  await frame.waitForSelector('.textLayer span');
  assert.equal(await frame.evaluate(()=>typeof chrome.runtime),'undefined');
  assert.equal(await frame.locator('#ai-toggle').getAttribute('aria-pressed'),'false');
  async function selectText(mouse=false){
    if(mouse){await frame.evaluate(()=>getSelection().removeAllRanges());const box=await frame.locator('.textLayer span').first().boundingBox();await page.mouse.move(box.x+1,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width-1,box.y+box.height/2,{steps:12});await page.mouse.up();}
    else await frame.evaluate(()=>{const n=document.querySelector('.textLayer span'),r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);});
  }
  await selectText();assert.equal(await frame.locator('#ai-selection').isVisible(),false);
  await frame.locator('#ai-toggle').click();await frame.waitForFunction(()=>document.querySelector('#ai-toggle').getAttribute('aria-pressed')==='true');
  await selectText(true);await frame.waitForSelector('#ai-selection:not([hidden])');
  const toggle=await frame.locator('#ai-toggle').evaluate(n=>({color:getComputedStyle(n).color,right:n.getBoundingClientRect().right,theme:document.querySelector('#theme').getBoundingClientRect().left}));
  assert.ok(toggle.right<=toggle.theme);assert.match(toggle.color,/rgb\(\d+, \d+, \d+\)/);
  await frame.locator('#ai-selection').click();await frame.waitForFunction(()=>document.querySelector('#ai-status').textContent==='Explanation complete.');
  assert.match(await frame.locator('#ai-messages').textContent(),/Mock explanation/);assert.equal(await frame.locator('#ai-messages img').count(),0);
  assert.equal(await frame.locator('#ai-model').textContent(),'Claude Haiku 5.5');
  const first=mockAi.calls.at(-1);assert.equal(first.provider,'claude');
  assert.equal(JSON.stringify(first.input).includes('private-test-token'),false);assert.equal(JSON.stringify(first.input).includes('nearby_context'),false);
  await frame.locator('#ai-question').fill('Please give an example.');await frame.locator('#ai-send').click();
  await frame.waitForFunction(()=>document.querySelector('#ai-status').textContent==='Explanation complete.');
  assert.equal(mockAi.calls.at(-1).input.messages.length,3);assert.equal(await frame.locator('.ai-assistant').count(),2);
  await frame.locator('#ai-context').check();await frame.waitForFunction(()=>window.qaSettings().aiIncludeContext);
  await frame.locator('#ai-again').click();await frame.waitForFunction(()=>document.querySelector('#ai-status').textContent==='Explanation complete.');
  assert.equal(JSON.stringify(mockAi.calls.at(-1).input).includes('nearby_context'),true);
  await page.screenshot({path:join(out,'reader-en-light.png')});
  for(const provider of ['openai','gemini']){
    await prefs.locator('#aiProvider').selectOption(provider);await frame.waitForFunction(p=>window.qaSettings().aiProvider===p,provider);
    await frame.locator('#ai-again').click();await frame.waitForFunction(()=>document.querySelector('#ai-status').textContent==='Explanation complete.');
    assert.equal(mockAi.calls.at(-1).provider,provider);assert.equal(await frame.locator('#ai-model').textContent(),AI_PROVIDERS[provider].model);
  }
  mockAi.mode='hold';const before=mockAi.cancelled;
  await frame.locator('#ai-again').click();await frame.waitForSelector('#ai-stop:not([hidden])');
  await frame.locator('#ai-stop').click();await frame.waitForFunction(()=>document.querySelector('#ai-status').textContent==='Explanation stopped.');
  for(let i=0;i<30&&mockAi.cancelled===before;i++)await new Promise(r=>setTimeout(r,50));assert.ok(mockAi.cancelled>before);
  await frame.locator('#ai-again').click();await frame.waitForSelector('#ai-stop:not([hidden])');await frame.locator('#ai-toggle').click();
  await frame.waitForFunction(()=>document.querySelector('#ai-toggle').getAttribute('aria-pressed')==='false'&&document.querySelector('#ai-panel').hidden);
  mockAi.mode='normal';await frame.locator('#ai-toggle').click();await frame.waitForFunction(()=>document.querySelector('#ai-toggle').getAttribute('aria-pressed')==='true');
  await frame.locator('#ai-clear').click();await frame.locator('#ai-close').click();
  // Authored OCR rows exercise the selection bridge without a costly OCR run.
  await frame.evaluate(async()=>{
    const {createOcrTextLayer}=await import('./ocr-text-layer.js');const v=qaViewer.getPageView(0);
    const result={rotation:0,words:[{text:'OCR passage',separator:'',line:0,topLeft:[60,742],topRight:[210,742],bottomLeft:[60,718]}]};
    const overlay=createOcrTextLayer(result,v.viewport);v.div.append(overlay);v.textLayer.div.style.display='none';
    const n=overlay.querySelector('.ocr-text-glyphs'),r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);
  });
  await frame.waitForSelector('#ai-selection:not([hidden])');await frame.locator('#ai-selection').click();await frame.waitForFunction(()=>document.querySelector('#ai-status').textContent==='Explanation complete.');
  assert.match(await frame.locator('#ai-source-text').textContent(),/OCR passage/);
  await prefs.locator('#locale').selectOption('zh-CN');await frame.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  await prefs.locator('#appearance').selectOption('dark');await page.screenshot({path:join(out,'reader-zh-dark.png')});
  await prefs.screenshot({path:join(out,'settings-zh-dark.png'),fullPage:true});
  await prefs.locator('#locale').selectOption('en-US');await prefs.locator('#appearance').selectOption('light');
  await prefs.screenshot({path:join(out,'settings-en-light.png'),fullPage:true});
  await prefs.setViewportSize({width:360,height:850});assert.equal(await prefs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await prefs.screenshot({path:join(out,'settings-narrow.png'),fullPage:true});
  await page.setViewportSize({width:560,height:850});await frame.waitForFunction(()=>innerWidth===560&&document.documentElement.scrollWidth<=innerWidth,undefined,{timeout:5000});
  await prefs.setViewportSize({width:1360,height:960});
  // Cancel keeps every key; confirmation atomically clears credentials and root.
  prefs.once('dialog',dialog=>dialog.dismiss());await prefs.locator('#ai-remove-all').click();
  assert.equal(Object.values((await prefs.evaluate(()=>chrome.runtime.sendMessage({type:'AI_STATUS'}))).result.keys).filter(Boolean).length,3);
  mockAi.mode='hold';await prefs.locator('#ai-test').click();
  await prefs.waitForFunction(()=>document.querySelector('#ai-key-notice').textContent==='Testing connection…');
  prefs.once('dialog',dialog=>dialog.accept());await prefs.locator('#ai-remove-all').click();
  await prefs.waitForFunction(()=>document.querySelector('#ai-key-notice').textContent==='All saved API keys deleted.');
  const remaining=await worker.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('cosmic-pdf-api-vault');r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction('keys').objectStore('keys').count();r.onsuccess=()=>{db.close();resolve(r.result);};});});assert.equal(remaining,0);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('settings'))).settings.aiProvider,'gemini');
  mockAi.mode='normal';await page.reload();await page.waitForSelector('iframe');
  frame=await(await page.waitForSelector('iframe')).contentFrame();await frame.waitForSelector('#ai-settings:not([hidden])');
  assert.match(await frame.locator('#ai-intro').textContent(),/API key/);
  report.checks.push('AI settings widths and encrypted credentials; native/OCR selection; three mock SSE providers; follow-up/context; neutral toolbar; cancel/off; bilingual themes/narrow layout; confirmed clear-all including active test and AES root');
  await writeFile(join(out,'README.md'),'# AI API '+version+' QA\n\nAuthored local PDF plus fake API keys and localhost SSE responses. No real AI requests or private documents. Run `PDF_QA=ai` with `scripts/test-browser.mjs`. Screenshots cover the new settings and explanation pane; no credentials are included.\n');
  report.screenshots=out;await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
}
export function handleWebAiMock(req,res){
  if(!req.url.startsWith('/web-ai-'))return false;
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html><head><meta name="color-scheme" content="light dark"><title>AI website mock</title></head><body style="font:16px system-ui"><h1>AI website mock</h1><label for="question">Prefilled question</label><textarea id="question" style="display:block;width:90%;height:300px"></textarea><script>document.querySelector("#question").value=new URL(location.href).searchParams.get("q")||"";</script></body></html>');return true;
}
export async function prepareWebAiMock(ext,base){
  const file=join(ext,'core/ai-web.js');let source=await readFile(file,'utf8');
  source=source.replace(AI_WEBSITES.chatgpt.url,base+'/web-ai-chatgpt').replace(AI_WEBSITES.claude.url,base+'/web-ai-claude/new');await writeFile(file,source);
}
export async function runWebAiQa({context,worker,page,settings,open,report,base}){
  const out=resolve('test-dist/ai-subscription-3.2.1');await mkdir(out,{recursive:true});
  const prefs=await context.newPage();await prefs.goto(settings);await prefs.waitForSelector('#aiMode');
  await prefs.locator('#locale').selectOption('en-US');await prefs.locator('#sampling').selectOption('1');await prefs.locator('#appearance').selectOption('light');
  assert.equal(await prefs.locator('#ai-mode-subscription').isChecked(),true);
  assert.deepEqual(await prefs.locator('#aiMode input').evaluateAll(nodes=>nodes.map(n=>n.value)),['api','subscription']);
  assert.equal(await prefs.locator('#aiMode').innerText(),'Built-in AI via API\nBring Your Own AI via Subscription');
  assert.deepEqual(await prefs.locator('#aiWebsite option').allTextContents(),['ChatGPT','Claude']);
  assert.equal(await prefs.locator('#aiProvider').evaluate(n=>[...n.options].some(o=>/default|默认/.test(o.textContent))),false);
  await prefs.locator('#ai-mode-subscription').focus();await prefs.keyboard.press('ArrowUp');await prefs.waitForFunction(()=>!document.querySelector('.ai-key-row').hidden);
  await prefs.keyboard.press('ArrowDown');await prefs.waitForFunction(()=>document.querySelector('.ai-key-row').hidden);
  await prefs.locator('#aiEnabled').check();
  await prefs.waitForFunction(async()=>{const s=(await chrome.storage.local.get('settings')).settings;return s?.aiMode==='subscription'&&s.aiEnabled&&s.sampling===1;});
  assert.equal(await prefs.locator('#ai-key').isVisible(),false);assert.equal(await prefs.locator('#aiWebsite').isVisible(),true);assert.equal(await prefs.locator('#aiLanguage').isVisible(),true);assert.equal(await prefs.locator('#ai-remove-all').isVisible(),true);
  assert.equal(await prefs.locator('#aiMode input:checked').count(),1);
  let frame=await open('/subscription?source-token=never-send');await frame.waitForSelector('.textLayer span');
  assert.equal(await frame.locator('#ai-panel').isVisible(),false,'subscription needs no API setup pane');
  async function select(index=0){await page.bringToFront();await frame.evaluate(i=>{const n=document.querySelectorAll('.textLayer span')[i],r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);},index);await frame.waitForSelector('#ai-selection:not([hidden])');}
  const initial=context.pages().length;await select();const created=context.waitForEvent('page');await frame.locator('#ai-selection').click();let companion=await created;await companion.waitForURL(base+'/web-ai-chatgpt?q=*');await companion.waitForSelector('#question');
  const firstQuestion=await companion.locator('#question').inputValue();assert.match(firstQuestion,/Small text/);assert.equal(firstQuestion.includes('source-token'),false);assert.equal(firstQuestion.includes('nearby_context'),false);
  assert.equal(context.pages().length,initial+1);
  const order=await worker.evaluate(async()=>{const data=(await chrome.storage.session.get('ai-website-companions'))['ai-website-companions'],[source,entry]=Object.entries(data)[0],a=await chrome.tabs.get(Number(source)),b=await chrome.tabs.get(entry.tabId);return {next:b.index===a.index+1,same:a.windowId===b.windowId,data};});assert.equal(order.next,true);assert.equal(order.same,true);assert.deepEqual(Object.keys(Object.values(order.data)[0]),['tabId']);
  await prefs.locator('#aiWebsite').selectOption('claude');await prefs.locator('#aiIncludeContext').check();await prefs.locator('#aiLanguage').selectOption('zh-CN');
  await frame.waitForFunction(()=>qaSettings().aiWebsite==='claude'&&qaSettings().aiIncludeContext&&qaSettings().aiLanguage==='zh-CN');
  await select(1);await frame.locator('#ai-selection').click();await companion.waitForURL(base+'/web-ai-claude/new?q=*');
  await companion.waitForFunction(()=>document.querySelector('#question').value.includes('nearby_context'));assert.match(await companion.locator('#question').inputValue(),/Simplified Chinese/);assert.equal(context.pages().length,initial+1);
  // Reload the PDF; its explicit companion survives without content storage.
  await page.bringToFront();await page.reload();frame=await(await page.waitForSelector('iframe')).contentFrame();await frame.waitForSelector('.textLayer span');await select(2);await frame.locator('#ai-selection').click();await companion.waitForFunction(()=>document.querySelector('#question').value.includes('Small text 11 pt'));assert.equal(context.pages().length,initial+1);
  // Long selected text is not silently cropped or opened in a huge URL.
  await page.bringToFront();await frame.evaluate(()=>{const layer=document.querySelector('.textLayer'),span=document.createElement('span');span.dataset.qaLong='true';span.textContent='中'.repeat(8000);span.style.cssText='left:20px;top:220px;--font-height:16px;';layer.append(span);const r=document.createRange();r.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(r);});
  await frame.waitForSelector('#ai-selection:not([hidden])');await frame.locator('#ai-selection').click();await frame.waitForSelector('#ai-web-handoff:not([hidden])');
  assert.ok((await frame.locator('#ai-web-question').inputValue()).includes('中'.repeat(8000)));assert.equal(context.pages().length,initial+1);
  await frame.evaluate(()=>{document.addEventListener('copy',event=>{event.preventDefault();window.qaWebCopied=document.querySelector('#ai-web-question').value;},{once:true});Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{window.qaWebCopied=text;}});});
  await frame.locator('#ai-web-copy').click();assert.ok((await frame.evaluate(()=>qaWebCopied)).includes('中'.repeat(8000)));
  await page.screenshot({path:join(out,'long-question-en-light.png')});
  await frame.locator('#ai-web-open').click();await companion.waitForURL(base+'/web-ai-claude/new');assert.equal(context.pages().length,initial+1);await frame.evaluate(()=>{document.querySelector('[data-qa-long]')?.remove();getSelection().removeAllRanges();});
  await prefs.locator('#locale').selectOption('zh-CN');await prefs.locator('#appearance').selectOption('dark');await prefs.screenshot({path:join(out,'settings-zh-dark.png'),fullPage:true});
  await prefs.locator('#locale').selectOption('en-US');await prefs.locator('#appearance').selectOption('light');await prefs.screenshot({path:join(out,'settings-en-light.png'),fullPage:true});
  await prefs.locator('#aiMode').screenshot({path:join(out,'connection-options-en-light.png')});
  await prefs.setViewportSize({width:360,height:850});assert.equal(await prefs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await prefs.screenshot({path:join(out,'settings-narrow.png'),fullPage:true});await prefs.setViewportSize({width:1360,height:960});
  await prefs.locator('#ai-mode-api').check();await frame.waitForFunction(()=>qaSettings().aiMode==='api');assert.equal(await prefs.locator('#ai-key').isVisible(),true);assert.equal(await prefs.locator('#aiWebsite').isVisible(),false);
  await prefs.reload();await prefs.waitForSelector('#ai-mode-api');assert.equal(await prefs.locator('#ai-mode-api').isChecked(),true);assert.equal(await prefs.locator('#aiMode input:checked').count(),1);
  await prefs.locator('#ai-mode-subscription').check();await frame.waitForFunction(()=>qaSettings().aiMode==='subscription');
  await companion.close();await select();const replacement=context.waitForEvent('page',{timeout:5000});await frame.locator('#ai-selection').click();companion=await replacement;await companion.waitForSelector('#question');assert.equal(context.pages().length,initial+1);
  assert.deepEqual((await page.evaluate(()=>chrome.runtime.sendMessage({type:'AI_STATUS'}))).result.keys,{gemini:false,openai:false,claude:false});
  report.checks.push('subscription needs no keys; normal/OCR-safe selection bridge; adjacent tab fallback and same-reader reuse/provider change/reload; source tokens omitted; context/language; complete long-question copy/open; closed companion recovery; bilingual/narrow settings and API mode retained');
  report.screenshots=out;await writeFile(join(out,'README.md'),'# Subscription AI 3.2.1 QA\n\nAuthored local PDF and localhost prefilled-question pages, not real accounts. No subscription/API request, website reply extraction or system clipboard write. Run `PDF_QA=ai-web` with scripts/test-browser.mjs. Native split availability is version-dependent; unit tests cover optional createSplit and existing-split ownership. Screenshots cover bilingual settings and complete-question fallback.\n');await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
}
