import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {AI_PROVIDERS} from '../extension/core/ai.js';
import {prepareAiMock,mockAi} from './qa-ai.mjs';
const ids={gemini:['gemini-4-pro','gemini-4-flash-lite','gemini-3.5-flash-lite'],openai:['gpt-7-pro','gpt-7-luna','gpt-6-luna'],claude:['claude-opus-6','claude-haiku-6','claude-haiku-5-5']};
export const modelMock={mode:'normal',requests:0};
export function handleModelMock(req,res){
 if(!req.url.startsWith('/model-list/'))return false;
 modelMock.requests++;const provider=req.url.split('/')[2].split('?')[0];
 const key=provider==='openai'?req.headers.authorization?.replace('Bearer ',''):req.headers[provider==='gemini'?'x-goog-api-key':'x-api-key'];assert.equal(key,'qa-not-a-real-key-'+provider);assert.equal(req.headers.cookie,undefined);
 if(modelMock.mode==='hold'){res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();return true;}
 if(modelMock.mode==='error'){res.writeHead(403);res.end('private provider detail');return true;}
 const names=modelMock.mode==='no-family'?['new-family-z','new-family-a']:ids[provider];
 const models=names.map((id,index)=>provider==='gemini'?{name:'models/'+id,displayName:index===0?'Gemini Pro <script>unsafe()</script>':id,supportedGenerationMethods:['generateContent']}:{id,display_name:id});
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(provider==='gemini'?{models}:{data:models,has_more:false}));return true;
}
export async function prepareModelMock(ext,base){
 await prepareAiMock(ext,base);
 const file=join(ext,'background/products/ai-model-catalog.js');let source=await readFile(file,'utf8');
 for(const [provider,url]of Object.entries({gemini:'https://generativelanguage.googleapis.com/v1beta/models',openai:'https://api.openai.com/v1/models',claude:'https://api.anthropic.com/v1/models'}))source=source.replace(url,base+'/model-list/'+provider);
 await writeFile(file,source);
 const client=join(ext,'background/products/ai-client.js');await writeFile(client,(await readFile(client,'utf8')).replace('https://generativelanguage.googleapis.com/v1beta/models/',base+'/mock-ai/gemini/'));
}
export async function runModelsQa({context,worker,page,settings,open,report}){
 const prefs=await context.newPage();prefs.on('pageerror',error=>report.errors.push(error.message));await prefs.goto(settings);await prefs.waitForSelector('#aiLanguage');
 await prefs.locator('#locale').selectOption('en-US');await prefs.locator('#sampling').selectOption('1');await prefs.locator('#ai-mode-api').check();
 const picker=id=>prefs.locator('.settings-picker').filter({has:prefs.locator('#'+id)}).locator('button');
 await prefs.waitForFunction(()=>[...document.querySelectorAll('select')].every(select=>select.classList.contains('settings-picker-source')));
 assert.equal(await prefs.locator('#aiModel').inputValue(),AI_PROVIDERS.gemini.id);assert.equal(modelMock.requests,0);
 for(const [provider,config]of Object.entries(AI_PROVIDERS)){
  await picker('aiProvider').click();await prefs.getByRole('option',{name:config.label,exact:true}).click();
  await prefs.waitForFunction(async provider=>(await chrome.storage.local.get('settings')).settings.aiProvider===provider,provider);
  if(provider==='gemini')await prefs.locator('#ai-fetch-models').click();else await prefs.locator('#ai-add').click();
  await prefs.locator('#ai-key').fill('qa-not-a-real-key-'+provider);await prefs.locator('#ai-save').click();await prefs.waitForFunction(()=>document.querySelector('#ai-key-editor').hidden);
  await prefs.locator('#ai-fetch-models').click();await prefs.waitForSelector('.settings-picker-menu');
  const labels=await prefs.getByRole('option').allTextContents();assert.equal(labels.length,3);
  assert.equal(await prefs.locator('#aiModel').inputValue(),config.id,'fetch does not change the default');
  assert.deepEqual(await prefs.locator('#aiModel option').evaluateAll(nodes=>nodes.map(node=>node.value)),ids[provider]);
  assert.match(labels[1],/\(recommended\)/);assert.doesNotMatch(labels[0],/recommended/);
  assert.equal(await prefs.locator('.settings-picker-menu script').count(),0);
  // Use the actual keyboard picker path to choose the next vendor model.
  await prefs.keyboard.press('Home');await prefs.keyboard.press('ArrowDown');await prefs.keyboard.press('Enter');
  await prefs.waitForFunction(async({provider,id})=>(await chrome.storage.local.get('settings')).settings.aiModels[provider]===id,{provider,id:ids[provider][1]});
  await prefs.locator('[data-provider='+provider+'] [data-action=test]').click();await prefs.waitForFunction(p=>document.querySelector('[data-provider='+p+'] .ai-key-result').textContent==='Connection successful.',provider);
  const last=mockAi.calls.at(-1);if(provider!=='gemini')assert.equal(last.input.model,ids[provider][1]);
 }
 report.checks.push('all services retain separate model choices; fetched menus auto-open in vendor order with inline recommendations; tests use selected models');
 // Failure and cancellation retain both saved selection and prior list.
 const before=await prefs.locator('#aiModel').inputValue();modelMock.mode='error';await prefs.locator('#ai-fetch-models').click();await prefs.waitForFunction(()=>document.querySelector('#ai-model-status').dataset.error==='true');assert.equal(await prefs.locator('#aiModel').inputValue(),before);assert.equal(await prefs.locator('#aiModel option').count(),3);assert.equal(await prefs.locator('#ai-model-status').evaluate(node=>node.textContent.includes('private provider')),false);
 modelMock.mode='hold';await prefs.locator('#ai-fetch-models').click();await prefs.waitForFunction(()=>document.querySelector('#ai-fetch-models').textContent==='Stop');await prefs.locator('#ai-fetch-models').click();await prefs.waitForFunction(()=>document.querySelector('#ai-fetch-models').textContent==='Get latest models');
 modelMock.mode='no-family';await prefs.locator('#ai-fetch-models').click();await prefs.waitForSelector('.settings-picker-menu');
 assert.deepEqual(await prefs.locator('#aiModel option').evaluateAll(nodes=>nodes.map(node=>node.value)),['new-family-z','new-family-a',before]);assert.equal(await prefs.locator('#aiModel').inputValue(),before);assert.equal(await prefs.getByRole('option').filter({hasText:'recommended'}).count(),0);await prefs.keyboard.press('Escape');
 report.checks.push('failed/cancelled refresh preserves choices and cached models; missing recommendation families require a user choice without fallback');
 await picker('aiProvider').click();await prefs.getByRole('option',{name:'OpenAI',exact:true}).click();assert.equal(await prefs.locator('#aiModel').inputValue(),ids.openai[1]);
 await picker('aiModel').click();const menu=await prefs.locator('.settings-picker-menu').boundingBox(),button=await picker('aiModel').boundingBox();assert.ok(Math.abs(menu.x-button.x)<=1);assert.ok(Math.abs(menu.width-button.width)<=1);await picker('aiModel').click();assert.equal(await prefs.locator('.settings-picker-menu').count(),0);
 await picker('aiModel').focus();await prefs.keyboard.press('1');assert.equal(await prefs.locator('#version').textContent().then(text=>text.includes('Test mode')),false);await prefs.keyboard.press('Escape');
 await prefs.locator('#aiEnabled').check();
 // A real background explanation route must use the saved nondefault model.
 const frame=await open('/model-explanation');await frame.waitForFunction(()=>window.qaSettings().aiEnabled);await frame.locator('.textLayer span').first().evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));});
 await frame.waitForSelector('#ai-selection:not([hidden])');await frame.locator('#ai-selection').click();await frame.waitForFunction(()=>document.querySelector('#ai-status')?.textContent==='Complete');assert.equal(mockAi.calls.at(-1).input.model,ids.openai[1]);
 report.checks.push('PDF explanation uses the selected provider model; custom pickers align, toggle, and preserve test-mode keyboard isolation');
 const folder=resolve('test-dist/model-selection');await mkdir(folder,{recursive:true});await prefs.bringToFront();await prefs.screenshot({path:join(folder,'settings-light.png'),fullPage:true});await prefs.locator('#appearance').selectOption('dark');await picker('aiModel').click();await prefs.screenshot({path:join(folder,'models-dark.png')});await prefs.keyboard.press('Escape');
 await prefs.locator('#locale').selectOption('zh-CN');await picker('aiModel').click();assert.match((await prefs.getByRole('option').allTextContents())[1],/（推荐）|\(推荐\)/);await prefs.screenshot({path:join(folder,'models-zh.png')});await prefs.keyboard.press('Escape');
 await prefs.setViewportSize({width:560,height:800});await picker('aiModel').click();const narrow=await prefs.locator('.settings-picker-menu').boundingBox();assert.ok(narrow.x>=0&&narrow.x+narrow.width<=560);await prefs.locator('#ai-model-title').click();assert.equal(await prefs.locator('.settings-picker-menu').count(),0);report.checks.push('Chinese menus and narrow layouts remain usable and outside clicks release menu DOM');
 await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,aiProvider:'gemini',aiModels:{...settings.aiModels,gemini:'gemini-2.5-flash-image'}},'ai-model-catalogs':{gemini:{fetchedAt:1,models:[{id:'gemini-2.5-flash-image',label:'Nano Banana'},{id:'gemini-3.5-flash-lite',label:'Gemini 3.5 Flash-Lite'},{id:'veo-3.1-generate-preview',label:'Veo 3.1'}]}}});});
 await prefs.waitForFunction(()=>document.querySelector('#aiProvider').value==='gemini'&&document.querySelector('#aiModel').value==='gemini-2.5-flash-image');
 assert.equal(await picker('aiModel').textContent(),'Nano Banana');await picker('aiModel').click();
 assert.equal(await prefs.getByRole('option').count(),1);assert.match((await prefs.getByRole('option').allTextContents())[0],/Gemini 3\.5 Flash-Lite \(推荐\)/);
 await prefs.getByRole('option').filter({hasText:'Gemini 3.5 Flash-Lite'}).click();
 await prefs.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.aiModels.gemini==='gemini-3.5-flash-lite');report.checks.push('cached media generators are hidden while an excluded saved selection retains its original label and is never substituted');
 await writeFile(join(folder,'README.md'),'# Model selection tests\n\nRun PDF_QA=models with scripts/test-browser.mjs and the browser paths in docs/QA.md. Reusable model-list and generation fixtures are in scripts/qa-models.mjs and qa-ai.mjs. Screenshots cover Settings and model menus. Tests cover vendor ordering, recommendation suffixes, independent choices, encrypted-key setup, generation routing, keyboard controls, themes, localization, cancellation, failure preservation, and unchanged labels for excluded saved selections.\n');
}
