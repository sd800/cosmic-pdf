// AI browser QA uses fake credentials and a localhost-only streaming service.
// Endpoint replacement happens only in the disposable extension copy.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AI_PROVIDERS } from '../extension/core/ai.js';
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
  const out=resolve('test-dist/ai-3.1.1');await mkdir(out,{recursive:true});
  const prefs=await context.newPage();await prefs.goto(settings);
  await prefs.waitForSelector('#aiLanguage');
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
  await writeFile(join(out,'README.md'),'# AI 3.1.1 QA\n\nAuthored local PDF plus fake API keys and localhost SSE responses. No real AI requests or private documents. Run `PDF_QA=ai` with `scripts/test-browser.mjs`. Screenshots cover the new settings and explanation pane; no credentials are included.\n');
  report.screenshots=out;await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
}
