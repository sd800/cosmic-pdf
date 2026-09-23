// Isolated integration QA. Requires an external Playwright installation; no runtime dependency.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';
import {viewerPdf,scannedPdf} from '../test/fixtures/pdf-viewer.mjs';
const {chromium}=await import(process.env.PDF_PLAYWRIGHT?pathToFileURL(process.env.PDF_PLAYWRIGHT).href:'playwright');
const folder=await mkdtemp(join(tmpdir(),'cosmic-pdf-qa-')),ext=join(folder,'extension');await cp(resolve('extension'),ext,{recursive:true});
// Expose renderer state in the disposable QA copy only.
const viewerFile=join(ext,'workspaces/pdf-viewer/viewer.js');await writeFile(viewerFile,(await readFile(viewerFile,'utf8')).replace('links.setViewer(viewer);','window.qaViewer=viewer; links.setViewer(viewer);').replace('void workerReady.catch(() => {});', 'void workerReady.then(()=>{window.qaWorkerReady=true;}).catch(e=>{window.qaWorkerError=String(e);});'));
const report={checks:[],errors:[],remoteRequests:[],screenshots:folder};let englishScan,chineseScan;const slowResponses=new Set();
function releaseSlow(){for(const res of slowResponses)res.end(viewerPdf(6));slowResponses.clear();}
const server=createServer((req,res)=>{
 const path=req.url.split('?')[0];
 if(path==='/html.pdf'){res.setHeader('Content-Type','text/html');res.end('<h1>Not a PDF</h1>');return;}
 if(path==='/links'){res.setHeader('Content-Type','text/html');res.end('<a href="/history.pdf">Read PDF</a>');return;}
 if(path==='/form'){res.setHeader('Content-Type','text/html');res.end('<form method="post" action="/post"><button>Submit</button></form>');return;}
 if(path==='/attachment'){res.setHeader('Content-Disposition','attachment; filename="download.pdf"');}
 res.setHeader('Content-Type',path==='/binary.pdf'?'application/octet-stream':'application/pdf');
 if(path==='/slow'&&req.headers['sec-fetch-dest']!=='document'){res.flushHeaders();slowResponses.add(res);res.on('close',()=>slowResponses.delete(res));return;}
 if(path==='/huge'){res.setHeader('Content-Length',String(90*1024*1024));res.end('%PDF-1.7');return;}
 if(path==='/bad'){res.end('not a PDF');return;}
 if(path==='/pages-128'){res.end(viewerPdf(128));return;}
 if(path==='/broken'){res.end('%PDF-1.7\nbroken');return;}
 res.end(path==='/scan'?englishScan:path==='/chinese'?chineseScan:viewerPdf(6));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const context=await chromium.launchPersistentContext(join(folder,'profile'),{executablePath:process.env.PDF_CHROME,headless:true,viewport:{width:1360,height:960},deviceScaleFactor:2,args:['--force-device-scale-factor=2',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
function observe(page){page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))report.remoteRequests.push(r.url());});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function chooseToolbar(root,mode){
 const showFilename=mode==='both'||mode==='filename',showBranding=mode==='both'||mode==='branding';
 await root.locator('#showFilename').setChecked(showFilename);await root.locator('#showBranding').setChecked(showBranding);
 await root.waitForFunction(async({showFilename,showBranding})=>{const s=(await chrome.storage.local.get('settings')).settings;return s.showFilename===showFilename&&s.showBranding===showBranding;},{showFilename,showBranding});
}
async function chooseLanguages(root,group,values){
 const inputs=root.locator(group+' input[type=checkbox]');
 // Add first, then clear, so changing the only selection never empties a group.
 for(const value of values)await root.locator(group+' input[value='+value+']').check();
 for(const value of ['eng','chi_sim','chi_tra'])if(!values.includes(value))await root.locator(group+' input[value='+value+']').uncheck();
 assert.deepEqual(await inputs.evaluateAll(nodes=>nodes.filter(n=>n.checked).map(n=>n.value)),['eng','chi_sim','chi_tra'].filter(v=>values.includes(v)));
}

try{
 const page=await context.newPage();observe(page);await page.goto('chrome://extensions');const id=await page.evaluate(()=>document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-item-list').shadowRoot.querySelector('extensions-item')?.id);assert.ok(id,'extension installed');
 const origin=`chrome-extension://${id}/`,reader=origin+'workspaces/pdf-reader/index.html',settings=origin+'settings/index.html';
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 for(let i=0;i<50;i++){if((await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length>=3)break;await delay(100);}
 async function go(url){await page.goto(url).catch(e=>{if(!/net::ERR_ABORTED|Download is starting/.test(e.message))throw e;});}
 async function open(path='/document?token=a%2Bb&sig=x%3D#page=2'){
  await page.bringToFront();await go(base+path);await page.waitForURL(url=>url.href.startsWith(reader+'?source='));const element=await page.waitForSelector('iframe');const frame=await element.contentFrame();await frame.waitForFunction(()=>document.querySelector('.page canvas')?.width>0&&document.querySelector('#count').textContent!=='—');await frame.waitForFunction(()=>window.qaViewer?.getPageView(0)?.renderingState===3);return frame;
 }
 // Homepage Settings must add history within the same tab, without starting PDF workers.
 await page.goto(reader);await page.waitForSelector('#settings');assert.equal(await page.locator('iframe').count(),0);
 const tabsBefore=context.pages().length;await page.locator('#settings').click();await page.waitForURL(settings);
 assert.equal(context.pages().length,tabsBefore);assert.equal(await page.locator('#showFilename').isChecked(),false);assert.equal(await page.locator('#showBranding').isChecked(),false);await page.goBack();await page.waitForURL(reader);await page.waitForSelector('#open-file');
 await page.goForward();await page.waitForURL(settings);await page.goBack();await page.waitForSelector('#settings');
 report.checks.push('homepage Settings uses the same tab and restores with Back/Forward');
 for(const scheme of ['light','dark']){
  await page.emulateMedia({colorScheme:scheme});await go(base+'/slow');await page.waitForURL(url=>url.href.startsWith(reader+'?source='));
  assert.equal(await page.locator('#welcome').isVisible(),false);
  const element=await page.waitForSelector('iframe'),warm=await element.contentFrame();
  await warm.waitForFunction(()=>window.qaWorkerReady===true||window.qaWorkerError,null,{polling:50});assert.equal(await warm.evaluate(()=>window.qaWorkerError),undefined);
  assert.equal(await page.locator('#splash').count(),0);assert.equal(await warm.locator('header').isVisible(),true);
  assert.equal(await warm.locator('#progress').isVisible(),true);assert.equal(await warm.locator('#status').textContent(),'');assert.equal(await warm.locator('#scale').inputValue(),'1');
  assert.equal(await warm.locator('.identity').isVisible(),false);assert.equal(await warm.locator('.file').isVisible(),false);
  assert.equal(await warm.locator('#print').isDisabled(),true);assert.equal(await warm.locator('#properties').isDisabled(),true);assert.equal(await warm.locator('#download').isDisabled(),true);assert.equal(await warm.locator('#next').isDisabled(),true);assert.equal(await warm.locator('#native').isDisabled(),false);
  const geometry=await warm.evaluate(()=>{const h=document.querySelector('header').getBoundingClientRect(),p=document.querySelector('#progress').getBoundingClientRect();return{height:h.height,aligned:Math.abs(h.bottom-p.bottom)<1&&p.height===2};});assert.equal(geometry.aligned,true);
  await warm.locator('#theme').click();await warm.waitForFunction(dark=>document.documentElement.dataset.dark===String(!dark),scheme==='dark');
  await warm.locator('#theme').click();await warm.waitForFunction(dark=>document.documentElement.dataset.dark===String(dark),scheme==='dark');
  await page.screenshot({path:join(folder,'loading-'+scheme+'.png')});releaseSlow();
  await page.waitForFunction(()=>document.documentElement.dataset.view==='reader');await warm.waitForSelector('.page canvas');assert.equal(await warm.locator('#progress').isVisible(),false);
  assert.equal(await warm.locator('header').evaluate(n=>n.getBoundingClientRect().height),geometry.height);assert.equal(await warm.locator('#download').isDisabled(),false);
 }
 await page.emulateMedia({colorScheme:'light'});report.checks.push('toolbar visible and interactive during slow loading in both themes; parser worker prewarmed; divider progress causes no layout shift; factory toolbar items hidden');
 // Preserve coverage of the optional original two-row layout as well.
 await worker.evaluate(async()=>{const {settings={}}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,showFilename:true,showBranding:true}});});
 await go(base+'/links');await page.locator('a').click();await page.waitForURL(url=>url.href.startsWith(reader+'?source='));await page.waitForFunction(()=>document.documentElement.dataset.view==='reader');
 await page.goBack();await page.waitForURL(base+'/links');await page.goForward();await page.waitForURL(url=>url.href.startsWith(reader+'?source='));await page.waitForFunction(()=>document.documentElement.dataset.view==='reader');
 report.checks.push('website PDF link preserves Back/Forward history and restores the reader');
 let frame=await open('/pages-128');
 const symmetric=()=>{const p=document.querySelector('#page').getBoundingClientRect(),n=document.querySelector('#count').getBoundingClientRect(),s=document.querySelector('.page-separator').getBoundingClientRect();return Math.abs(p.width-n.width)<.1&&Math.abs((s.left-p.right)-(n.left-s.right))<.1;};
 assert.equal(await frame.evaluate(symmetric),true);const originalCountBox=await frame.locator('#count').boundingBox();await frame.locator('#page').fill('128');await frame.locator('#page').press('Enter');await frame.waitForFunction(()=>qaViewer.currentPageNumber===128);assert.equal(await frame.evaluate(symmetric),true);assert.deepEqual(await frame.locator('#count').boundingBox(),originalCountBox);
 report.checks.push('symmetric fixed-width current/total page counts across page-number changes');
 frame=await open();assert.equal(page.url(),reader+'?source='+base+'/document?token=a%2Bb&sig=x%3D#page=2');report.checks.push('MIME takeover and signed URL preservation');
 assert.equal(await frame.locator('#page').inputValue(),'1');assert.equal(await frame.locator('#scale').inputValue(),'1');assert.equal(await frame.locator('#viewport').evaluate(n=>n.scrollTop),0);
 assert.equal(await frame.evaluate(()=>typeof chrome==='undefined'||!chrome.runtime),true);assert.equal(await frame.evaluate(()=>globalThis.PDF_ATTACK),undefined);
 await frame.locator('#zoom-in').click();await frame.locator('#zoom-in').click();await frame.waitForFunction(()=>Math.abs(window.qaViewer.currentScale-1.2)<.001);report.checks.push('100% initial scale, 10-point zoom and sandbox isolation');
 for(const [scale,lower,upper]of [[1.2,'1','1.25'],[.25,'page-fit','0.5'],[4.5,'4','5']]){
  const orderBefore=await frame.locator('#scale option').evaluateAll(nodes=>nodes.map(n=>n.value));
  await frame.evaluate(scale=>{qaViewer.currentScaleValue=String(scale);},scale);
  assert.deepEqual(await frame.locator('#scale option').evaluateAll(nodes=>nodes.map(n=>n.value)),orderBefore,'zoom leaves option order untouched until the menu is opened');
  await frame.locator('#scale').click();await frame.locator('#scale').press('Escape');
  const neighbors=await frame.locator('#custom-scale').evaluate(n=>[n.previousElementSibling?.value,n.nextElementSibling?.value]);assert.deepEqual(neighbors,[lower,upper]);assert.equal(await frame.locator('#scale').inputValue(),'custom');
 }
 await frame.locator('#scale').selectOption('1');assert.equal(await frame.locator('#custom-scale').getAttribute('hidden'),'');await frame.evaluate(()=>{qaViewer.currentScaleValue='1.1';});await frame.locator('#scale').focus();await frame.locator('#scale').press('Space');await frame.locator('#scale').press('Escape');assert.deepEqual(await frame.locator('#custom-scale').evaluate(n=>[n.previousElementSibling?.value,n.nextElementSibling?.value]),['1','1.25']);await frame.locator('#scale').selectOption('1');
 report.checks.push('custom zoom locates between neighboring presets only when opened by pointer/keyboard, with no stale entry at a preset');
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');assert.ok((await frame.locator('.canvasWrapper').first().evaluate(n=>getComputedStyle(n).filter)).includes('invert(0.96)'));
 assert.equal(await frame.locator('#theme-auto').isVisible(),true);
 await page.emulateMedia({colorScheme:'dark'});assert.equal(await frame.evaluate(()=>document.documentElement.dataset.dark),'true');
 await frame.locator('#theme-auto').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');
 await page.emulateMedia({colorScheme:'light'});await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');
 assert.deepEqual(await frame.locator('#viewport').evaluate(n=>[getComputedStyle(n).overscrollBehaviorX,getComputedStyle(n).overscrollBehaviorY]),['auto','contain']);
 assert.equal(await frame.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true,cancelable:true}))),true);
 await frame.locator('#scale').selectOption('3');await frame.locator('#viewport').hover();await page.mouse.wheel(350,0);await frame.waitForFunction(()=>document.querySelector('#viewport').scrollLeft>0);
 await frame.locator('#scale').selectOption('1');await frame.waitForFunction(()=>qaViewer.currentScale===1);report.checks.push('single default/opposite theme control, native history shortcuts and horizontal PDF scrolling');
 await page.screenshot({path:join(folder,'reader-dark.png')});report.checks.push('dark appearance and paper boundary');
 assert.deepEqual(await frame.locator('#primary-actions > button').evaluateAll(nodes=>nodes.map(n=>n.id)),['print','properties','settings','native','download']);
 assert.equal(await frame.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.endsWith('/properties.js'))),false,'properties module is not part of first-page loading');
 await frame.evaluate(()=>{window.qaMetadataCalls=0;const doc=qaViewer.pdfDocument,read=doc.getMetadata.bind(doc);doc.getMetadata=()=>{qaMetadataCalls++;return read();};});
 await frame.locator('#properties').click();await frame.waitForSelector('#properties-dialog[open]');await frame.waitForFunction(()=>document.querySelector('[data-property=author]').textContent==='Cosmic PDF tests');
 assert.equal(await frame.locator('#properties-title').textContent(),'Document properties');assert.equal(await frame.locator('[data-property=documentTitle]').textContent(),'QA <b>metadata</b>');assert.equal(await frame.locator('#properties-list b').count(),0);
 assert.equal(await frame.locator('[data-property=pdfVersion]').textContent(),'1.7');assert.equal(await frame.locator('[data-property=pageCount]').textContent(),'6');assert.equal(await frame.locator('[data-property=fastWebView]').textContent(),'No');assert.equal(await frame.locator('[data-property=keywords]').textContent(),'—');
 assert.match(await frame.locator('[data-property=fileSize]').textContent(),/KB$/);assert.match(await frame.locator('[data-property=created]').textContent(),/2026/);assert.match(await frame.locator('[data-property=pageSize]').textContent(),/8.5 × 11.69 in/);
 await page.screenshot({path:join(folder,'properties-dark-en.png')});await frame.locator('#properties-close').click();await frame.locator('#properties').click();await frame.waitForFunction(()=>!document.querySelector('#properties-status').textContent);assert.equal(await frame.evaluate(()=>qaMetadataCalls),1);await frame.locator('#properties-close').press('Escape');
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');await frame.locator('#properties').click();await frame.waitForFunction(()=>!document.querySelector('#properties-status').textContent);await page.screenshot({path:join(folder,'properties-light-en.png')});await frame.locator('#properties-close').click();await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');
 report.checks.push('properties action order, on-demand module/metadata, safe selectable text, correct PDF fields and cached reopening');
 await frame.locator('#search-toggle').click();await frame.locator('#query').fill('Searchable');await frame.waitForFunction(()=>document.querySelector('#matches').textContent.includes('/ 6'));await frame.locator('#find-close').click();report.checks.push('native text search');
 await frame.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);await frame.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);report.checks.push('fullscreen through trusted host');
 await frame.locator('#print').click();await frame.waitForSelector('#print-dialog[open]');await frame.locator('#print-dialog button[value=cancel]').click();report.checks.push('bounded print-range dialog');

 await frame.locator('#native').click();await page.waitForURL(base+'/document?token=a%2Bb&sig=x%3D#page=2');assert.ok((await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).length===1);await page.reload();await delay(200);assert.ok(page.url().startsWith(base));report.checks.push('native return and reload without recapture');
 const other=await context.newPage();observe(other);await other.goto(base+'/document?token=a%2Bb&sig=x%3D').catch(()=>{});await other.waitForURL(url=>url.href.startsWith(reader));await other.close();report.checks.push('native exemption limited to one tab');
 await go(base+'/html.pdf');await page.waitForSelector('h1');assert.equal(page.url(),base+'/html.pdf');await delay(100);assert.equal((await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).length,0);report.checks.push('HTML exception and exemption cleanup');
 const attachment=page.waitForEvent('download');await go(base+'/attachment');await (await attachment).cancel();report.checks.push('attachment stays a download');
 await go(base+'/form');await page.locator('button').click();await delay(500);assert.equal(page.url(),base+'/post');report.checks.push('POST is not replayed/intercepted');
 frame=await open('/binary.pdf');report.checks.push('binary MIME with PDF filename');
 const prefs=await context.newPage();observe(prefs);await prefs.goto(settings);await prefs.locator('#locale').selectOption('zh-CN');await prefs.waitForFunction(()=>document.documentElement.lang==='zh-CN');await prefs.locator('#sampling').selectOption('1');await prefs.locator('#gap').selectOption('24');await chooseLanguages(prefs,'#ocrLanguages',['eng','chi_tra']);await prefs.locator('#appearance').selectOption('dark');await prefs.waitForFunction(async()=>{const s=(await chrome.storage.local.get('settings')).settings;return s?.sampling===1&&s?.appearance==='dark'&&s?.gap===24&&s?.ocrLanguages?.join('+')==='eng+chi_tra';});
 assert.equal(await frame.evaluate(()=>qaViewer.getPageView(0).getRenderPixelRatio()),4,'existing reader sampling snapshot');await prefs.screenshot({path:join(folder,'settings-zh.png'),fullPage:true});report.checks.push('localized settings and immutable open-reader sampling');
 frame=await open('/new');assert.equal(await frame.evaluate(()=>qaViewer.getPageView(0).getRenderPixelRatio()),1);assert.equal(await frame.evaluate(()=>document.documentElement.dataset.dark),'true');assert.equal(await frame.locator('#viewport').evaluate(n=>n.scrollTop),0);report.checks.push('new-reader preferences');
 await frame.locator('#properties').click();await frame.waitForFunction(()=>!document.querySelector('#properties-status').textContent);assert.equal(await frame.locator('#properties-title').textContent(),'文档信息');assert.match(await frame.locator('[data-property=pageSize]').textContent(),/215.9 × 297.04 mm/);
 await page.setViewportSize({width:360,height:850});assert.equal(await frame.evaluate(()=>document.querySelector('header .file').getBoundingClientRect().right<=document.querySelector('header .actions').getBoundingClientRect().left),true);assert.equal(await frame.locator('#properties-dialog').evaluate(n=>n.getBoundingClientRect().width<=innerWidth&&n.scrollWidth<=n.clientWidth),true);await page.screenshot({path:join(folder,'properties-dark-zh-narrow.png')});await frame.locator('#properties-close').click();await page.setViewportSize({width:1360,height:960});
 report.checks.push('localized document properties reflow within a narrow viewport');
 // Toolbar preferences update the existing reader without reparsing the PDF.
 await frame.evaluate(()=>window.qaOriginalDocument=qaViewer.pdfDocument);
 await chooseToolbar(prefs,'branding');
 await frame.waitForFunction(()=>document.querySelector('.file').hidden);assert.equal(await frame.locator('.identity').isVisible(),true);
 assert.equal(await frame.evaluate(()=>qaViewer.pdfDocument===window.qaOriginalDocument),true);
 frame=await open('/branding');assert.equal(await frame.locator('.file').isVisible(),false);assert.equal(await frame.locator('.identity').isVisible(),true);
 assert.equal(await frame.locator('#appearance-actions').isVisible(),false);assert.equal(await frame.locator('#primary-actions > button').first().getAttribute('id'),'theme');
 const compactHeight=await frame.locator('header').evaluate(n=>n.getBoundingClientRect().height);assert.ok(compactHeight<60);
 await chooseToolbar(prefs,'filename');
 await frame.waitForFunction(()=>document.querySelector('.identity').hidden);
 frame=await open('/An exceptionally long PDF filename that must fit without overlapping other toolbar controls.pdf');
 assert.equal(await frame.locator('.identity').isVisible(),false);assert.equal(await frame.locator('#filename').isVisible(),true);
 const filenameBox=await frame.locator('.file').boundingBox();assert.ok(filenameBox.width<=320);assert.ok(filenameBox.x<25);
 assert.equal(await frame.locator('#filename').evaluate(n=>getComputedStyle(n).textOverflow),'ellipsis');
 await page.screenshot({path:join(folder,'toolbar-filename.png')});await page.setViewportSize({width:360,height:850});await page.screenshot({path:join(folder,'toolbar-filename-narrow.png')});
 assert.ok(await frame.evaluate(()=>{const a=document.querySelector('.file').getBoundingClientRect(),b=document.querySelector('.actions').getBoundingClientRect();return a.right<=b.left&&document.documentElement.scrollWidth<=innerWidth;}));
 await page.setViewportSize({width:1360,height:960});await prefs.reload();await prefs.waitForSelector('#showFilename');assert.equal(await prefs.locator('#showFilename').isChecked(),true);assert.equal(await prefs.locator('#showBranding').isChecked(),false);
 await frame.evaluate(()=>window.qaBeforeHideBoth=qaViewer.pdfDocument);
 await chooseToolbar(prefs,'none');await frame.waitForFunction(()=>document.querySelector('.identity').hidden&&document.querySelector('.file').hidden);
 assert.equal(await frame.locator('#appearance-actions').isVisible(),false);assert.equal(await frame.evaluate(()=>qaViewer.pdfDocument===window.qaBeforeHideBoth),true);
 for(const width of [1101,1180,1201,1360]){
  await page.setViewportSize({width,height:960});
  assert.equal(await frame.evaluate(()=>{const nav=document.querySelector('header nav'),last=nav.lastElementChild.getBoundingClientRect(),actions=document.querySelector('.actions').getBoundingClientRect();return last.right<=actions.left||last.top>=actions.bottom;}),true,`toolbar groups overlap at ${width}px`);
 }
 await page.screenshot({path:join(folder,'toolbar-hidden.png')});await chooseToolbar(prefs,'filename');
 for(const appearance of ['light','dark']){
  await prefs.locator('#appearance').selectOption(appearance);await prefs.waitForFunction(async a=>(await chrome.storage.local.get('settings')).settings.appearance===a,appearance);
  frame=await open('/theme-'+appearance);assert.equal(await frame.evaluate(()=>document.documentElement.dataset.dark),String(appearance==='dark'));
  await frame.locator('#theme').click();await frame.waitForFunction(dark=>document.documentElement.dataset.dark===String(!dark),appearance==='dark');
  await frame.locator('#theme').click();await frame.waitForFunction(dark=>document.documentElement.dataset.dark===String(dark),appearance==='dark');
 }
 await prefs.locator('#appearance').selectOption('auto');await prefs.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.appearance==='auto');
 frame=await open('/compact-auto');await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');
 await page.emulateMedia({colorScheme:'dark'});await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');await page.emulateMedia({colorScheme:'light'});await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');
 await prefs.locator('#appearance').selectOption('dark');await prefs.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.appearance==='dark');
 await chooseToolbar(prefs,'both');
 frame=await open('/both');assert.equal(await frame.locator('.identity').isVisible(),true);assert.equal(await frame.locator('.file').isVisible(),true);
 assert.equal(await frame.locator('header').evaluate(n=>getComputedStyle(n).paddingTop),'6px');assert.equal(await frame.locator('#appearance-actions').isVisible(),true);
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');await frame.locator('#theme-auto').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');
 report.checks.push('persisted toolbar checkboxes, all four combinations, live preference updates, compact layouts, long filenames and explicit theme defaults');
 assert.deepEqual(await frame.locator('#ocr-languages input:checked').evaluateAll(nodes=>nodes.map(n=>n.value)),['eng','chi_tra']);
 const defaultChecks=await prefs.locator('#ocrLanguages input:checked').evaluateAll(nodes=>nodes.map(n=>n.value));await prefs.reload();await prefs.waitForSelector('#ocrLanguages input');assert.deepEqual(await prefs.locator('#ocrLanguages input:checked').evaluateAll(nodes=>nodes.map(n=>n.value)),defaultChecks);
 await chooseLanguages(prefs,'#ocrLanguages',['chi_sim','chi_tra']);await prefs.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.ocrLanguages.join('+')==='chi_sim+chi_tra');
 assert.deepEqual(await frame.locator('#ocr-languages input:checked').evaluateAll(nodes=>nodes.map(n=>n.value)),['eng','chi_tra'],'open reader keeps original choices');
 report.checks.push('OCR checkbox persistence, arbitrary combinations and reader snapshot');
 // Scans are authored here. Real recognition runs in the production sandbox.
 const makeScan=async(lines)=>{const jpeg=await page.evaluate(async lines=>{const c=document.createElement('canvas');c.width=1000;c.height=1400;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,1000,1400);g.fillStyle='black';g.font='58px "PingFang SC",sans-serif';lines.forEach((line,i)=>g.fillText(line,60,160+i*130));return Array.from(new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/jpeg',.98))).arrayBuffer()));},lines);return scannedPdf(Buffer.from(jpeg),1000,1400);};
 englishScan=await makeScan(['COSMIC PDF READER','LOCAL OCR 12345']);chineseScan=await makeScan(['中文文字识别 测试','繁體中文 閱讀文件','COSMIC PDF 2026']);
 frame=await open('/scan');await frame.locator('#ocr-toggle').click();await chooseLanguages(frame,'#ocr-languages',['eng']);
 assert.equal(await frame.locator('#ocr-languages input[value=eng]').getAttribute('aria-disabled'),'true');
 await frame.locator('#ocr-languages input[value=eng]').focus();await frame.locator('#ocr-languages input[value=eng]').press('Space');assert.equal(await frame.locator('#ocr-languages input[value=eng]').isChecked(),true,'retain final language');
 // Intercept copy only in this QA host; do not write to the user's OS clipboard.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.qaCopied=value;}}}));
 const start=performance.now();await frame.locator('#ocr-start').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled,{timeout:130000});assert.match(await frame.locator('#ocr-result').inputValue(),/COSMIC PDF READER/);assert.ok(await frame.locator('.ocr-text-layer span').count()>2);await frame.locator('#ocr-copy').click();await page.waitForFunction(()=>window.qaCopied?.includes('12345'));report.ocrMs=Math.round(performance.now()-start);
 const words=await frame.locator('.ocr-text-layer span').count();await frame.locator('#rotate').click();await frame.waitForFunction(()=>qaViewer.pagesRotation===270);await frame.waitForSelector('.ocr-text-layer span');assert.equal(await frame.locator('.ocr-text-layer span').count(),words);await frame.locator('#zoom-in').click();await delay(300);assert.ok(await frame.locator('.ocr-text-layer span').count()>2);await page.screenshot({path:join(folder,'ocr-dark.png')});report.checks.push('local OCR, copy bridge and zoom/rotation overlay');
 await frame.locator('#ocr-start').click();await frame.locator('#ocr-cancel').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled);assert.equal(await frame.locator('#ocr-cancel').isVisible(),false);report.checks.push('immediate OCR cancellation');
 for(let i=0;i<30&&page.workers().length>1;i++)await delay(50);assert.ok(page.workers().length<=1,'OCR worker released after completion/cancellation');report.checks.push('OCR worker teardown');

 frame=await open('/chinese');await frame.locator('#ocr-toggle').click();await chooseLanguages(frame,'#ocr-languages',['eng','chi_sim']);await frame.locator('#ocr-start').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled,{timeout:130000});const simplified=await frame.locator('#ocr-result').inputValue();assert.match(simplified,/中文/);assert.match(simplified,/COSMIC/);await chooseLanguages(frame,'#ocr-languages',['eng','chi_tra']);await frame.locator('#ocr-start').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled,{timeout:130000});const traditional=await frame.locator('#ocr-result').inputValue();assert.match(traditional,/中文/);report.checks.push('Simplified/Traditional Chinese and mixed English recognition');
 await chooseLanguages(frame,'#ocr-languages',['chi_sim','chi_tra']);await frame.locator('#ocr-start').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled,{timeout:130000});assert.match(await frame.locator('#ocr-result').inputValue(),/中文/);assert.equal(await frame.locator('.ocr-text-layer span').first().evaluate(n=>getComputedStyle(n).letterSpacing),'normal','UI tracking does not affect recognized word positions');report.checks.push('combined Chinese recognition without English selected');
 await page.screenshot({path:join(folder,'ocr-zh.png')});
 await prefs.locator('#sampling').selectOption('6');await prefs.locator('#sharpening').check();await prefs.locator('#locale').selectOption('en-US');await prefs.waitForFunction(async()=>{const s=(await chrome.storage.local.get('settings')).settings;return s?.sampling===6&&s?.locale==='en-US'&&s?.sharpening;});
 frame=await open('/detail');await frame.waitForFunction(()=>qaViewer.getPageView(0).detailView?.renderingState===3);const view=await frame.evaluate(()=>{const v=qaViewer.getPageView(0),c=v.detailView.canvas;return {ratio:c.width/c.getBoundingClientRect().width,pixels:c.width*c.height,base:v.canvas.width*v.canvas.height};});assert.ok(view.ratio>5.9);assert.ok(view.pixels<=36*1024*1024);assert.ok(view.base<=4*1024*1024);await frame.locator('#scale').selectOption('3');await frame.waitForFunction(()=>qaViewer.currentScale===3&&qaViewer.getPageView(0).detailView?.renderingState===3);report.checks.push('6× sampling, high zoom and canvas budgets');
 await prefs.bringToFront();await prefs.screenshot({path:join(folder,'settings-en.png'),fullPage:true});
 async function checkDefaultLabels(zh){
  const expected={appearance:'auto',sampling:'4',zoom:'1',gap:'16',darkStrength:'0.96',ocrQuality:'2',ocrLayout:'3'},suffix=zh?'（默认）':' (default)';
  for(const [key,value]of Object.entries(expected)){
   const marked=await prefs.locator('#'+key+' option').evaluateAll((options,suffix)=>options.filter(o=>o.textContent.endsWith(suffix)).map(o=>o.value),suffix);
   assert.deepEqual(marked,[value]);
  }
  for(const key of ['locale'])assert.equal(await prefs.locator('#'+key+' option').evaluateAll((options,suffix)=>options.some(o=>o.textContent.endsWith(suffix)),suffix),false);
 }
 await checkDefaultLabels(false);
 const measureReadability=()=>{
  const font=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
  const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const lum=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  const body=getComputedStyle(document.body),desc=getComputedStyle(document.querySelector('.row p'));const a=lum(rgb(body.backgroundColor)),b=lum(rgb(desc.color));
  return {label:font('.row h3'),description:font('.row p'),language:font('.language-options label'),contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
 };const readability=await prefs.evaluate(measureReadability);assert.ok(readability.label>=15&&readability.description>=14&&readability.language>=15);assert.ok(readability.contrast>=4.5);report.checks.push('readable type sizes and secondary-text contrast in both themes');
 await prefs.locator('#appearance').selectOption('light');await prefs.waitForFunction(()=>document.documentElement.dataset.dark==='false');assert.ok((await prefs.evaluate(measureReadability)).contrast>=4.5);await prefs.screenshot({path:join(folder,'settings-light.png'),fullPage:true});await prefs.setViewportSize({width:360,height:850});assert.equal(await prefs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await prefs.screenshot({path:join(folder,'settings-narrow.png'),fullPage:true});await prefs.locator('#locale').selectOption('zh-CN');await prefs.waitForFunction(()=>document.documentElement.lang==='zh-CN');assert.equal(await prefs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await prefs.screenshot({path:join(folder,'settings-zh-narrow.png'),fullPage:true});await checkDefaultLabels(true);report.checks.push('factory default labels in both languages, including Appearance');await page.bringToFront();await page.setViewportSize({width:560,height:850});await page.screenshot({path:join(folder,'reader-narrow.png')});report.checks.push('English settings and narrow layout');
 const local=join(folder,'local.pdf');await writeFile(local,viewerPdf(2));await page.locator('#file').setInputFiles(local);await page.waitForURL(reader);const lf=await(await page.waitForSelector('iframe')).contentFrame();await lf.waitForSelector('.page canvas');const popup=context.waitForEvent('page');await lf.locator('#native').click();const nativeLocal=await popup;await nativeLocal.waitForLoadState();assert.ok(nativeLocal.url().startsWith('blob:chrome-extension://'));await nativeLocal.close();report.checks.push('local file picker and native blob fallback');
 await go(base+'/bad');await page.waitForFunction(()=>!!document.querySelector('#message')?.textContent&&document.documentElement.dataset.view==='home'&&!document.querySelector('iframe'));await page.waitForSelector('#native');assert.ok(await page.locator('#native').isVisible());report.checks.push('invalid PDF fallback');
 await go(base+'/broken');await page.waitForFunction(()=>!!document.querySelector('#message')?.textContent&&!document.querySelector('iframe'));report.checks.push('parse failure removes shell and releases worker');
 await page.goto(reader);await page.waitForFunction(()=>document.querySelector('#intro').textContent.length>0);await page.screenshot({path:join(folder,'opening.png')});
 await prefs.locator('#enabled').uncheck();await prefs.waitForFunction(async()=>!(await chrome.storage.local.get('settings')).settings.enabled);for(let i=0;i<50;i++){if((await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length===0)break;await delay(100);}assert.equal((await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length,0);report.checks.push('automatic opening master switch');
 assert.deepEqual(report.remoteRequests,[],'OCR/renderer never makes external network requests');assert.deepEqual(report.errors,[],'no application/CSP errors');report.checks.push('no remote document resources or console errors');
 console.log(JSON.stringify(report,null,2));await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));
} catch(error){console.error(JSON.stringify(report,null,2));throw error;}finally{releaseSlow();await context.close();await new Promise(r=>server.close(r));}
