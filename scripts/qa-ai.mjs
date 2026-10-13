// AI browser QA uses fake credentials and a localhost-only streaming service.
// Endpoint replacement happens only in the disposable extension copy.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AI_PROVIDERS } from '../extension/core/ai.js';
import { AI_WEBSITES } from '../extension/core/ai-web.js';
import { scannedPdf } from '../test/fixtures/pdf-viewer.mjs';
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
    if(mockAi.mode==='gemini-invalid'){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{status:'INVALID_ARGUMENT',message:'raw service detail must not appear',details:[{reason:'API_KEY_INVALID'}]}}));return;}
    if(mockAi.mode==='gemini-access'){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{status:'PERMISSION_DENIED',details:[{reason:'API_KEY_HTTP_REFERRER_BLOCKED'}]}}));return;}
    if(req.headers.accept==='application/json'){
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      if(mockAi.mode==='hold'){res.flushHeaders();return;}
      res.end(JSON.stringify(provider==='gemini'?{candidates:[{content:{parts:[{text:'OK'}]},finishReason:'STOP'}]}:provider==='openai'?{output:[{type:'message',content:[{type:'output_text',text:'OK'}]}]}:{content:[{type:'text',text:'OK'}]}));return;
    }
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
    await prefs.locator('#ai-add').click();await prefs.locator('#ai-key-provider').selectOption(provider);await prefs.locator('#ai-key').fill('qa-not-a-real-key-'+provider);await prefs.locator('#ai-save').click();
    await prefs.waitForFunction(()=>document.querySelector('#ai-key-notice').textContent==='Key saved.');
    assert.equal(await prefs.locator('#ai-key').inputValue(),'');
  }
  assert.equal(await prefs.locator('#ai-key-list li').count(),3);assert.equal(await prefs.locator('#ai-remove-all').count(),0);
  for(const provider of Object.keys(AI_PROVIDERS)){
    await prefs.locator('[data-provider='+provider+'] [data-action=test]').click();await prefs.waitForFunction(p=>document.querySelector('[data-provider='+p+'] .ai-key-result').textContent==='Connection successful.',provider);
  }
  assert.equal(await prefs.locator('#ai-key-list').evaluate(n=>n.innerText.includes('qa-not-a-real-key')),false);
  mockAi.mode='gemini-invalid';await prefs.locator('[data-provider=gemini] [data-action=test]').click();await prefs.waitForFunction(()=>document.querySelector('[data-provider=gemini] .ai-key-result').textContent.includes('did not accept'));
  mockAi.mode='gemini-access';await prefs.locator('[data-provider=gemini] [data-action=test]').click();await prefs.waitForFunction(()=>document.querySelector('[data-provider=gemini] .ai-key-result').textContent.startsWith('Access denied'));
  assert.equal(await prefs.locator('#ai-keys').evaluate(n=>n.innerText.includes('raw service detail')),false);mockAi.mode='normal';
  await prefs.locator('[data-provider=gemini] [data-action=replace]').click();assert.equal(await prefs.locator('#ai-key').inputValue(),'');await prefs.locator('#ai-key').fill('unsaved-draft-only');await prefs.locator('#ai-key-cancel').click();assert.equal(await prefs.locator('#ai-key').inputValue(),'');
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
  await prefs.locator('#ai-keys').screenshot({path:join(out,'saved-keys-zh-dark.png')});
  await prefs.locator('#locale').selectOption('en-US');await prefs.locator('#appearance').selectOption('light');
  await prefs.screenshot({path:join(out,'settings-en-light.png'),fullPage:true});
  await prefs.locator('#ai-keys').screenshot({path:join(out,'saved-keys-en-light.png')});
  await prefs.setViewportSize({width:360,height:850});assert.equal(await prefs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await prefs.screenshot({path:join(out,'settings-narrow.png'),fullPage:true});
  await page.setViewportSize({width:560,height:850});await frame.waitForFunction(()=>innerWidth===560&&document.documentElement.scrollWidth<=innerWidth,undefined,{timeout:5000});
  await prefs.setViewportSize({width:1360,height:960});
  // Per-service deletion is explicit; Stop never deletes a saved key.
  prefs.once('dialog',dialog=>dialog.dismiss());await prefs.locator('[data-provider=gemini] [data-action=delete]').click();
  assert.equal(Object.values((await prefs.evaluate(()=>chrome.runtime.sendMessage({type:'AI_STATUS'}))).result.keys).filter(Boolean).length,3);
  mockAi.mode='hold';await prefs.locator('[data-provider=gemini] [data-action=test]').click();
  await prefs.waitForFunction(()=>document.querySelector('[data-provider=gemini] .ai-key-result').textContent==='Testing connection…');
  await prefs.locator('[data-provider=gemini] [data-action=test]').click();await prefs.waitForFunction(()=>document.querySelector('[data-provider=gemini] .ai-key-result').textContent==='Connection test cancelled.');
  for(const provider of Object.keys(AI_PROVIDERS)){prefs.once('dialog',dialog=>dialog.accept());await prefs.locator('[data-provider='+provider+'] [data-action=delete]').click();await prefs.waitForSelector('[data-provider='+provider+']',{state:'detached'});}
  const remaining=await worker.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('cosmic-pdf-api-vault');r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction('keys').objectStore('keys').count();r.onsuccess=()=>{db.close();resolve(r.result);};});});assert.equal(remaining,0,'deleting the final saved key also removes the encryption root');
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('settings'))).settings.aiProvider,'gemini');
  mockAi.mode='normal';await page.reload();await page.waitForSelector('iframe');
  frame=await(await page.waitForSelector('iframe')).contentFrame();await frame.waitForSelector('#ai-settings:not([hidden])');
  assert.match(await frame.locator('#ai-intro').textContent(),/API key/);
  report.checks.push('saved-key rows, separate draft editor, per-service JSON tests/Stop/delete and sanitized Gemini errors; encrypted credentials; native/OCR selection; three mock SSE providers; follow-up/context; neutral toolbar; cancel/off; bilingual themes/narrow layout; no bulk-delete button');
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
  assert.equal(await prefs.locator('#ai-key').isVisible(),false);assert.equal(await prefs.locator('#aiWebsite').isVisible(),true);assert.equal(await prefs.locator('#aiLanguage').isVisible(),true);assert.equal(await prefs.locator('#ai-remove-all').count(),0);
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
  await prefs.locator('#ai-mode-api').check();await frame.waitForFunction(()=>qaSettings().aiMode==='api');assert.equal(await prefs.locator('#ai-add').isVisible(),true);assert.equal(await prefs.locator('#aiWebsite').isVisible(),false);
  await prefs.reload();await prefs.waitForSelector('#ai-mode-api');assert.equal(await prefs.locator('#ai-mode-api').isChecked(),true);assert.equal(await prefs.locator('#aiMode input:checked').count(),1);
  await prefs.locator('#ai-mode-subscription').check();await frame.waitForFunction(()=>qaSettings().aiMode==='subscription');
  await companion.close();await select();const replacement=context.waitForEvent('page',{timeout:5000});await frame.locator('#ai-selection').click();companion=await replacement;await companion.waitForSelector('#question');assert.equal(context.pages().length,initial+1);
  assert.deepEqual((await page.evaluate(()=>chrome.runtime.sendMessage({type:'AI_STATUS'}))).result.keys,{gemini:false,openai:false,claude:false});
  report.checks.push('subscription needs no keys; normal/OCR-safe selection bridge; adjacent tab fallback and same-reader reuse/provider change/reload; source tokens omitted; context/language; complete long-question copy/open; closed companion recovery; bilingual/narrow settings and API mode retained');
  report.screenshots=out;await writeFile(join(out,'README.md'),'# Subscription AI 3.2.1 QA\n\nAuthored local PDF and localhost prefilled-question pages, not real accounts. No subscription/API request, website reply extraction or system clipboard write. Run `PDF_QA=ai-web` with scripts/test-browser.mjs. Native split availability is version-dependent; unit tests cover optional createSplit and existing-split ownership. Screenshots cover bilingual settings and complete-question fallback.\n');await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
}

// Focus/selection and OCR-context QA uses local authored data and a real local
// OCR worker. The visible peer iframe tests focus loss without hiding the PDF;
// it does not claim to be Chrome's version-dependent native split interface.
export async function runSelectionQa({context,worker,page,open,report,base,setScan}){
 const {version}=JSON.parse(await readFile('extension/manifest.json','utf8')),out=resolve('test-dist/selection-'+version);await mkdir(out,{recursive:true});
 await worker.evaluate(()=>chrome.storage.local.set({settings:{locale:'en-US',sampling:1,aiEnabled:false,aiMode:'subscription',aiIncludeContext:true,ocrLanguages:['eng'],ocrQuality:1.5}}));
 let frame=await open('/selection');await frame.waitForSelector('.textLayer span');
 async function select(selector='.textLayer span'){
  await page.bringToFront();await frame.locator(selector).first().click();
  await frame.locator(selector).first().evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);});
  await frame.waitForFunction(()=>!!getSelection().toString());
 }
 await select();await frame.locator('#viewport').click({position:{x:5,y:120}});assert.equal(await frame.evaluate(()=>getSelection().isCollapsed),true,'blank margin clears selection even with AI off');
 await select();await frame.locator('#theme').click();assert.equal(await frame.evaluate(()=>getSelection().isCollapsed),true,'toolbar click clears reading selection');
 await select();await frame.locator('.textLayer span').first().click({button:'right'});assert.notEqual(await frame.evaluate(()=>getSelection().toString()),'','right-click leaves text available to Copy');await page.keyboard.press('Escape');
 // A second live frame receives focus while the PDF remains visible.
 await select();await page.evaluate(()=>{const p=document.createElement('iframe');p.id='qa-peer';p.src=URL.createObjectURL(new Blob(['<!doctype html><textarea id="question" rows="8"></textarea>'],{type:'text/html'}));p.style.cssText='position:fixed;right:0;top:150px;width:250px;height:340px;z-index:10;background:white';document.body.append(p);});
 const peer=await(await page.waitForSelector('#qa-peer')).contentFrame();await peer.waitForSelector('#question');await peer.locator('#question').click();
 await frame.waitForFunction(()=>getSelection().isCollapsed);assert.equal(await frame.evaluate(()=>document.hidden),false,'visible focus loss does not rely on visibilitychange');await page.evaluate(()=>{const p=document.querySelector('#qa-peer');URL.revokeObjectURL(p.src);p.remove();});
 await worker.evaluate(()=>chrome.storage.local.set({settings:{locale:'en-US',sampling:1,aiEnabled:true,aiMode:'subscription',aiIncludeContext:true,ocrLanguages:['eng'],ocrQuality:1.5}}));
 await frame.waitForFunction(()=>qaSettings().aiEnabled);
 // Authored OCR rows on a page that also has native text: OCR must own both
 // selection and context, with no native fallback or merged neighboring rows.
 await frame.evaluate(async()=>{
  const {createOcrTextLayer}=await import('./ocr-text-layer.js'),view=qaViewer.getPageView(0);
  const words=['BEFORE_OCR_ONLY','SELECTED_OCR_ONLY','AFTER_OCR_ONLY'].map((text,line)=>({text,separator:'',line,topLeft:[60,770-line*40],topRight:[260,770-line*40],bottomLeft:[60,750-line*40]}));
  view.div.append(createOcrTextLayer({rotation:0,words},view.viewport));
 });
 await select('.ocr-text-line:nth-child(2) .ocr-text-glyphs');await frame.waitForSelector('#ai-selection:not([hidden])');
 const created=context.waitForEvent('page');await frame.locator('#ai-selection').click();const companion=await created;await companion.waitForSelector('#question');
 const prompt=await companion.locator('#question').inputValue(),data=JSON.parse(prompt.split('document_data JSON:\n')[1]);
 assert.equal(data.selected_text,'SELECTED_OCR_ONLY');assert.match(data.nearby_context,/BEFORE_OCR_ONLY/);assert.match(data.nearby_context,/AFTER_OCR_ONLY/);assert.doesNotMatch(data.nearby_context,/Small text|PDF Viewer page|Searchable needle/);
 await frame.waitForFunction(()=>getSelection().isCollapsed);assert.equal(await frame.locator('#ai-selection').isVisible(),false,'handoff focus loss clears the UI but preserves the captured question');
 await companion.close();await page.bringToFront();await page.screenshot({path:join(out,'ocr-context-selection.png')});
 // Cross-page selection must not include the hidden native layer of page two.
 await frame.evaluate(()=>{qaViewer.currentPageNumber=2;});await frame.waitForSelector('.page[data-page-number="2"] .textLayer span');
 const text=await frame.evaluate(async()=>{
  const {createOcrTextLayer}=await import('./ocr-text-layer.js'),{pdfSelection}=await import('./ai-reader.js'),view=qaViewer.getPageView(1);
  view.div.append(createOcrTextLayer({rotation:0,words:[{text:'SECOND_OCR_ONLY',separator:'',line:0,topLeft:[60,760],topRight:[260,760],bottomLeft:[60,740]}]},view.viewport));
  const a=document.querySelector('.page[data-page-number="1"] .ocr-text-line:nth-child(2) .ocr-text-glyphs').firstChild,b=view.div.querySelector('.ocr-text-glyphs').firstChild,r=document.createRange();r.setStart(a,0);r.setEnd(b,b.length);getSelection().removeAllRanges();getSelection().addRange(r);
  return pdfSelection(getSelection(),document.querySelector('#pages')).text;
 });
 assert.match(text,/SELECTED_OCR_ONLY/);assert.match(text,/SECOND_OCR_ONLY/);assert.doesNotMatch(text,/Small text|PDF Viewer page|Searchable needle/);
 // Reusable two-page image-only PDF, with no private file or OCR API service.
 let bytes;try{bytes=await readFile(join(out,'scan.pdf'));}catch{
  const jpeg=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1000;c.height=1400;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,c.width,c.height);g.fillStyle='black';g.font='58px sans-serif';['BEFORE LOCAL OCR','SELECTED LOCAL OCR','AFTER LOCAL OCR'].forEach((t,i)=>g.fillText(t,60,160+i*130));return Array.from(new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/jpeg',.98))).arrayBuffer()));});bytes=scannedPdf(Buffer.from(jpeg),1000,1400,2);await writeFile(join(out,'scan.pdf'),bytes);
 }setScan(bytes);
 await worker.evaluate(async()=>{const s=(await chrome.storage.local.get('settings')).settings;await chrome.storage.local.set({settings:{...s,aiEnabled:false}});});
 frame=await open('/scan');await frame.waitForSelector('.textLayer');await new Promise(r=>setTimeout(r,650));assert.equal(await frame.evaluate(()=>globalThis.qaOcrStarts||0),0,'AI off never starts automatic OCR');
 await worker.evaluate(async()=>{const s=(await chrome.storage.local.get('settings')).settings;await chrome.storage.local.set({settings:{...s,aiEnabled:true}});});
 await frame.waitForFunction(()=>document.querySelector('.ocr-text-layer')?.textContent.includes('LOCAL OCR')&&document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='false',undefined,{timeout:130000});
 assert.equal(await frame.evaluate(()=>qaOcrStarts),1);assert.equal(await frame.locator('.page[data-page-number="2"] .ocr-text-layer').count(),0,'no whole-document recognition');
 await page.screenshot({path:join(out,'automatic-current-page.png')});
 await frame.evaluate(()=>{window.qaOcrDelay=3000;qaViewer.currentPageNumber=2;});
 await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='true',undefined,{timeout:5000});
 await worker.evaluate(async()=>{const s=(await chrome.storage.local.get('settings')).settings;await chrome.storage.local.set({settings:{...s,aiEnabled:false}});});
 await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='false');assert.equal(await frame.locator('.page[data-page-number="2"] .ocr-text-layer').count(),0,'switch-off cancels only unfinished automatic OCR');
 report.checks.push('reading selection clears on blank/toolbar clicks and visible peer focus; right-click Copy and AI handoff preserve intended data; OCR selection/context excludes native duplicates including cross-page ranges; real local current-page automatic OCR only with AI enabled and switch-off cancellation');
 report.screenshots=out;await writeFile(join(out,'README.md'),'# Selection and OCR context QA '+version+'\n\nRun PDF_QA=selection with scripts/test-browser.mjs in an isolated profile. scan.pdf is a reusable authored two-page scan. Screenshots show OCR priority and current-page auto recognition. The local peer iframe keeps the PDF visible while focus moves, testing the focus boundary needed for split panes; native Chrome split UI itself is not claimed verified. No real AI account, private document or system clipboard write.\n');await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
}
