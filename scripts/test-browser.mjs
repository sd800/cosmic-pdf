// Isolated integration QA. Requires an external Playwright installation; no runtime dependency.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';
import {viewerPdf,scannedPdf} from '../test/fixtures/pdf-viewer.mjs';
const {chromium}=await import(process.env.PDF_PLAYWRIGHT?pathToFileURL(process.env.PDF_PLAYWRIGHT).href:'playwright');
const folder=await mkdtemp(join(tmpdir(),'cosmic-pdf-qa-')),ext=join(folder,'extension');await cp(resolve('extension'),ext,{recursive:true});
// Expose renderer state in the disposable QA copy only.
const viewerFile=join(ext,'workspaces/pdf-viewer/viewer.js');await writeFile(viewerFile,(await readFile(viewerFile,'utf8')).replace('links.setViewer(viewer);','window.qaViewer=viewer; window.qaSettings=()=>settings; window.qaDarkPaper=darkPaper; window.qaEventBus=eventBus; links.setViewer(viewer);').replace('void workerReady.catch(() => {});', 'void workerReady.then(worker=>{window.qaWorkerReady=worker.port instanceof Worker;}).catch(e=>{window.qaWorkerError=String(e);});'));
// Count bounded sampling reads in this QA copy, never in shipped code.
const guardFile=join(ext,'workspaces/pdf-viewer/dark-paper.js');await writeFile(guardFile,(await readFile(guardFile,'utf8')).replace('context.drawImage(source, 0, 0, size, size);', '(globalThis.qaPaperReads ||= []).push(size); context.drawImage(source, 0, 0, size, size);').replace('    try {\n      canvas ||= makeCanvas();', '    const qaStart=performance.now(); try {\n      canvas ||= makeCanvas();').replace('finally { if (canvas)', 'finally { (globalThis.qaPaperTimings ||= []).push(performance.now()-qaStart); if (canvas)'));
// Delayed recognition in the disposable test copy makes in-flight UI assertions deterministic.
const ocrClient=join(ext,'workspaces/pdf-viewer/ocr-worker-client.js');await writeFile(ocrClient,(await readFile(ocrClient,'utf8')).replace('const image=new Uint8Array','if(globalThis.qaOcrDelay)await new Promise(r=>setTimeout(r,globalThis.qaOcrDelay));const image=new Uint8Array'));
const report={checks:[],errors:[],remoteRequests:[],screenshots:folder};let englishScan,chineseScan,batchScan,blackScan;const slowResponses=new Set();
function releaseSlow(){for(const res of slowResponses)res.end(viewerPdf(6));slowResponses.clear();}
const server=createServer((req,res)=>{
 const path=req.url.split('?')[0];
 if(path==='/html.pdf'){res.setHeader('Content-Type','text/html');res.end('<h1>Not a PDF</h1>');return;}
 if(path==='/links'){res.setHeader('Content-Type','text/html');res.end('<a href="/history.pdf">Read PDF</a>');return;}
 if(path==='/form'){res.setHeader('Content-Type','text/html');res.end('<form method="post" action="/post"><button>Submit</button></form>');return;}
 if(path==='/link-target'){res.setHeader('Content-Type','text/html');res.end('<h1>Link opened</h1>');return;}
 if(path==='/link-capture'){res.setHeader('Content-Type','application/pdf');res.end(viewerPdf(1,[],[base+'/link-target?token=a%2Bb','mailto:a+tag@example.com?subject=Hello%20%3Cb%3E&body=line1%0Aline2','tel:+13125550123;ext=4','sms:+13125550123?body=Hello%20%3Cb%3E','ms-word:ofe|u|https://example.com/report.docx']));return;}
 if(path==='/attachment'){res.setHeader('Content-Disposition','attachment; filename="download.pdf"');}
 res.setHeader('Content-Type',path==='/binary.pdf'?'application/octet-stream':'application/pdf');
 if(path==='/slow'&&req.headers['sec-fetch-dest']!=='document'){res.flushHeaders();slowResponses.add(res);res.on('close',()=>slowResponses.delete(res));return;}
 if(path==='/huge'){res.setHeader('Content-Length',String(90*1024*1024));res.end('%PDF-1.7');return;}
 if(path==='/bad'){res.end('not a PDF');return;}
 if(path==='/designed-paper'){
  const content=Array.from({length:20},(_,i)=>`1 g BT /F1 10 Tf 35 ${785-i*30} Td (A line of small outlined or typeset content, with a colorful heading.) Tj ET\n0 .7 .6 rg 35 ${790-i*30} 150 2 re f`).join('\n');
  const panels='0 .25 .2 rg 35 35 240 100 re f\n0 .6 .5 rg 300 35 250 100 re f\n';
  const dark='0 g 0 0 612 842 re f\n',gray='0.25 g 0 0 612 842 re f\n';
  const photo='0 g 8 8 579 826 re f\n'+content;
  res.end(viewerPdf(6,[dark+content+panels,gray+content+panels,'1 g 0 0 612 842 re f\n'+photo,'0 g 0 0 m 612 0 l 0 842 l h f\n'+photo, '0 0 250 842 re W n\n'+dark+content, '1 g 0 0 612 842 re f\n'+dark+content+panels]));return;
 }
 if(path==='/black-paper'){
  const bed='0.016 g 0 0 612 842 re f\n',writing='1 g BT /F1 12 Tf 65 730 Td (Sparse white writing on black paper.) Tj ET\n';
  const stars=Array.from({length:150},(_,i)=>`${20+(i*137)%555} ${20+(i*233)%800} 1 1 re f`).join('\n');
  res.end(viewerPdf(7,[bed+writing,undefined,'0 g 8 8 579 826 re f\n1 g\n'+stars+'\n',bed+'1 g 275 390 40 40 re f\n', '0.12 g 0 0 612 842 re f\n'+writing, '0.4 g 0 0 612 842 re f\n'+writing.replace('1 g','0 g'), '0.75 g 0 0 612 842 re f\n'+writing.replace('1 g','0 g')]));return;
 }
 if(path==='/ocr-priority'){
  res.end(viewerPdf(2,[
   'BT /F1 24 Tf 60 740 Td (UPPER UNRELATED LINE) Tj ET\nBT /F1 28 Tf 60 680 Td (COSMIC OCR PRIORITY) Tj ET\nBT /F1 24 Tf 60 570 Td (LOWER UNRELATED LINE) Tj ET\nBT /F1 20 Tf 3 Tr 60 630 Td (STALELAYERONLY) Tj ET\n',
   'BT /F1 20 Tf 3 Tr 60 680 Td (FALLBACKORIGINAL) Tj ET\n'
  ]));return;
 }
 if(path==='/pages-128'){res.end(viewerPdf(128));return;}
 if(path==='/broken'){res.end('%PDF-1.7\nbroken');return;}
 res.end(path==='/black-scan'?blackScan:path==='/scan-many'?batchScan:path==='/scan'?englishScan:path==='/chinese'?chineseScan:viewerPdf(6));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const context=await chromium.launchPersistentContext(join(folder,'profile'),{executablePath:process.env.PDF_CHROME,headless:true,viewport:{width:1360,height:960},deviceScaleFactor:2,args:['--force-device-scale-factor=2',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
function observe(page){page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/fake worker|autofocusing|permissions policy|Content Security Policy|cross-origin redirects/i.test(m.text()))report.errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))report.remoteRequests.push(r.url());});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));

  async function checkCopyAll(frame) {
    const allowed = await frame.evaluate(() => ({write:document.featurePolicy.allowsFeature('clipboard-write'),read:document.featurePolicy.allowsFeature('clipboard-read')}));
    assert.equal(allowed.write, true); assert.equal(allowed.read, false);
    await frame.evaluate(() => {
      // Test the real PDF.js extraction path without replacing the OS clipboard.
      const original = Object.getOwnPropertyDescriptor(navigator.clipboard, 'writeText');
      window.qaRestoreCopy = () => { if (original) Object.defineProperty(navigator.clipboard,'writeText',original); else delete navigator.clipboard.writeText; };
      Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{window.qaAllCopied=text;}});
      document.addEventListener('copy',event=>event.preventDefault(),{once:true});
    });
    await frame.locator('.textLayer span').first().click();
    await frame.page().keyboard.press(process.platform==='darwin'?'Meta+a':'Control+a');
    await frame.page().keyboard.press(process.platform==='darwin'?'Meta+c':'Control+c');
    await frame.waitForFunction(() => typeof window.qaAllCopied === 'string');
    assert.match(await frame.evaluate(()=>window.qaAllCopied), /PDF Viewer page 1/);
    await frame.evaluate(()=>{qaRestoreCopy();getSelection().removeAllRanges();});
  }
async function chooseToolbar(root,mode){
 const showFilename=mode==='both'||mode==='filename',showBranding=mode==='both'||mode==='branding';
 await root.locator('#showFilename').setChecked(showFilename);await root.locator('#showBranding').setChecked(showBranding);
 await root.waitForFunction(async({showFilename,showBranding})=>{const s=(await chrome.storage.local.get('settings')).settings;return s.showFilename===showFilename&&s.showBranding===showBranding;},{showFilename,showBranding});
}
async function checkToolbarLayout(page,frame,width,wrap){
 await page.setViewportSize({width,height:960});
 await frame.waitForFunction(({width,wrap})=>innerWidth===width&&(document.documentElement.dataset.toolbarWrap==='true')===wrap,{width,wrap},{timeout:5000});
 const layout=await frame.evaluate(async()=>{
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const header=document.querySelector('header'),nav=header.querySelector('nav').getBoundingClientRect(),actions=header.querySelector('.actions').getBoundingClientRect();
  const controls=[...header.querySelectorAll('button:not(#filename),#page,#count,#scale,#scale-input,.identity,.file')].map(n=>({id:n.id||n.className,b:n.getBoundingClientRect()})).filter(n=>n.b.width&&n.b.height);
  const collisions=[];
  for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
   const a=controls[i],b=controls[j];if(Math.min(a.b.right,b.b.right)-Math.max(a.b.left,b.b.left)>1&&Math.min(a.b.bottom,b.b.bottom)-Math.max(a.b.top,b.b.top)>1)collisions.push(a.id+' / '+b.id);
  }
  return{wrap:document.documentElement.dataset.toolbarWrap==='true',sameRow:Math.abs(nav.top-actions.top)<1,collisions,inside:controls.every(n=>n.b.left>=0&&n.b.right<=innerWidth),height:header.getBoundingClientRect().height};
 });
 assert.equal(layout.wrap,wrap,`unexpected toolbar wrap at ${width}px`);assert.equal(layout.sameRow,!wrap,`toolbar row at ${width}px`);assert.deepEqual(layout.collisions,[],`overlapping toolbar controls at ${width}px`);assert.equal(layout.inside,true,`toolbar exceeds ${width}px`);
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
 const granted=await worker.evaluate(()=>chrome.permissions.getAll());assert.deepEqual(granted.permissions.sort(),['declarativeNetRequestWithHostAccess','storage']);assert.equal(await worker.evaluate(()=>typeof chrome.downloads),'undefined');report.checks.push('fixed minimal API permissions; no downloads API');
 for(let i=0;i<50;i++){if((await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length>=3)break;await delay(100);}
 async function go(url){await page.goto(url).catch(e=>{if(!/net::ERR_ABORTED|Download is starting/.test(e.message))throw e;});}
 async function open(path='/document?token=a%2Bb&sig=x%3D#page=2'){
  await page.bringToFront();await go(base+path);await page.waitForURL(url=>url.href.startsWith(reader+'?source='));const element=await page.waitForSelector('iframe');const frame=await element.contentFrame();await frame.waitForFunction(()=>document.querySelector('.page canvas')?.width>0&&document.querySelector('#count').textContent!=='—');await frame.waitForFunction(()=>window.qaViewer?.getPageView(0)?.renderingState===3);assert.equal(await frame.evaluate(()=>window.qaWorkerReady),true,'PDF parsing uses a real background Worker');return frame;
 }
 async function checkDownload(frame,name,bytes){
  const before=page.url(),tabs=context.pages().length;
  assert.equal(await page.evaluate(()=>typeof chrome.downloads),'undefined');
  const pending=page.waitForEvent('download');await frame.locator('#download').click();const saved=await pending;
  assert.equal(saved.suggestedFilename(),name);assert.equal(await saved.failure(),null);
  assert.deepEqual(await readFile(await saved.path()),Buffer.from(bytes),'download preserves original bytes');
  assert.equal(page.url(),before);assert.equal(context.pages().length,tabs);
  assert.equal(await page.locator('a[download]').count(),0,'temporary download anchor is removed');
  await saved.delete();
 }
 // PDF_QA=ocr-priority runs only the text-layer handover regression.
 if(process.env.PDF_QA==='ocr-priority'){
  await worker.evaluate(()=>chrome.storage.local.set({settings:{ocrLanguages:['eng'],ocrAction:'page'}}));
  const frame=await open('/ocr-priority');
  const native='.page[data-page-number="1"] .textLayer';
  await frame.waitForSelector(native+' span');
  async function findMatches(query){
   return frame.evaluate(query=>{
    const selection=getSelection(),start=document.createRange();start.setStart(document.body,0);start.collapse(true);selection.removeAllRanges();selection.addRange(start);
    const matches=[];
    // window.find uses the browser's rendered-text search, not PDF.js's index.
    while(matches.length<4&&window.find(query,false,false,false)){
     const node=selection.anchorNode,element=node.nodeType===1?node:node.parentElement;
     matches.push(element.closest('.ocr-text-layer')?'ocr':'native');
    }
    selection.removeAllRanges();return matches;
   },query);
  }
  assert.deepEqual(await findMatches('STALELAYERONLY'),['native']);
  await frame.evaluate(()=>{window.qaOcrDelay=250;});
  await frame.locator('#ocr-toggle').click();
  assert.notEqual(await frame.locator(native).evaluate(n=>getComputedStyle(n).display),'none','native text stays available until recognition completes');
  await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='false'&&document.querySelector('.ocr-text-layer span'),{timeout:130000});
  assert.match(await frame.locator('.ocr-text-layer').textContent(),/COSMIC OCR PRIORITY/);
  async function checkLineSelection(rotated=false){
   const row=frame.locator('.ocr-text-line').filter({hasText:'COSMIC OCR PRIORITY'});await row.scrollIntoViewIfNeeded();
   const first=await row.locator('.ocr-text-word').first().boundingBox(),last=await row.locator('.ocr-text-word').last().boundingBox();
   for(const fraction of [.25,.5,.75])for(const reverse of [false,true]){
    const a=rotated?{x:first.x+first.width*fraction,y:first.y+first.height*.8}:{x:first.x+first.width*.2,y:first.y+first.height*fraction};
    const b=rotated?{x:last.x+last.width*fraction,y:last.y+last.height*.2}:{x:last.x+last.width*.8,y:last.y+last.height*fraction};
    const [from,to]=reverse?[b,a]:[a,b];
    await frame.evaluate(()=>getSelection().removeAllRanges());
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();
    const selected=await frame.evaluate(()=>getSelection().toString());
    assert.match(selected,/OCR/,'middle-row mouse selection');assert.doesNotMatch(selected,/UPPER|LOWER|UNRELATED|STALE/,'selection must stay on its row');
   }
  }
  assert.equal(await frame.evaluate(()=>{const layer=document.querySelector('.ocr-text-layer');qaEventBus.dispatch('pagerendered',{pageNumber:1});return layer===document.querySelector('.ocr-text-layer');}),true,'same-geometry redraw must preserve selection nodes');
  await checkLineSelection();
  assert.equal(await frame.locator(native).evaluate(n=>getComputedStyle(n).display),'none');
  assert.deepEqual(await findMatches('COSMIC'),['ocr'],'browser Find must see only one matching layer');
  assert.deepEqual(await findMatches('STALELAYERONLY'),[],'old OCR/native text is excluded from browser Find');
  // Even a visible descendant or a freshly rendered native layer cannot opt back in.
  await frame.locator(native+' span').evaluateAll(nodes=>nodes.forEach(n=>n.style.visibility='visible'));
  assert.deepEqual(await findMatches('STALELAYERONLY'),[]);
  await frame.locator('#rotate').click();await frame.locator('#zoom-in').click();
  await frame.waitForFunction(()=>qaViewer.getPageView(0).renderingState===3&&document.querySelector('.ocr-text-layer span'));
  assert.equal(await frame.locator('.page[data-page-number="1"] .ocr-text-layer').count(),1);
  assert.deepEqual(await findMatches('COSMIC'),['ocr']);
  assert.deepEqual(await findMatches('STALELAYERONLY'),[]);
  await checkLineSelection(true);
  report.checks.push('continuous single-row mouse selection, both directions and varied vertical hit positions, before and after zoom/rotation');
  report.checks.push('manual OCR replaces native text for browser Find; one result after zoom and rotation');
  // A second page with an existing hidden text layer but a blank raster yields no OCR.
  await frame.evaluate(()=>{qaViewer.pagesRotation=0;qaViewer.currentPageNumber=2;});
  await frame.waitForSelector('.page[data-page-number="2"] .textLayer span');
  assert.deepEqual(await findMatches('FALLBACKORIGINAL'),['native'],'unprocessed pages retain their text');
  await frame.locator('#ocr-toggle').click();
  await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='false',{timeout:130000});
  assert.equal(await frame.locator('.page[data-page-number="2"] .ocr-text-layer').count(),0);
  assert.deepEqual(await findMatches('FALLBACKORIGINAL'),['native'],'empty recognition keeps the existing text');
  await frame.locator('#ocr-toggle').click({delay:650});await frame.locator('#ocr-clear').click();await frame.locator('#ocr-close').click();
  await frame.evaluate(()=>{qaViewer.currentPageNumber=1;});await frame.waitForSelector(native+' span');
  assert.equal(await frame.locator('.ocr-text-layer').count(),0);
  assert.deepEqual(await findMatches('STALELAYERONLY'),['native'],'Clear restores native text');
  await frame.evaluate(()=>{window.qaOcrDelay=1000;});await frame.locator('#ocr-toggle').click();
  await frame.locator('#ocr-feedback-cancel').click();
  await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='false');
  assert.deepEqual(await findMatches('STALELAYERONLY'),['native'],'cancellation does not suppress native text');
  report.checks.push('unprocessed pages, empty recognition, Clear and cancellation preserve native text');
 } else {
 // Homepage Settings must add history within the same tab, without starting PDF workers.
 await page.goto(reader);await page.waitForSelector('#settings');assert.equal(await page.locator('iframe').count(),0);
 const tabsBefore=context.pages().length;await page.locator('#settings').click();await page.waitForURL(settings);
 assert.equal(context.pages().length,tabsBefore);assert.equal(await page.locator('.wordmark h1').textContent(),'Cosmic PDF');assert.equal(await page.locator('.wordmark>span').textContent(),'Settings');assert.equal(await page.locator('#toolbarHidden label svg').count(),11);assert.equal(await page.locator('#toolbarHidden .default-hint').first().evaluate(n=>getComputedStyle(n).color!==getComputedStyle(n.parentElement).color),true);assert.equal(await page.locator('#preserveDarkPaper').isChecked(),true);assert.equal(await page.locator('#showFilename').isChecked(),true);assert.equal(await page.locator('#showBranding').isChecked(),false);assert.equal(await page.locator('#ocrAction').inputValue(),'page');assert.equal(await page.locator('#useChromeFind').isChecked(),true);assert.deepEqual(await page.locator('#ocrLanguages input:checked').evaluateAll(nodes=>nodes.map(n=>n.value)),['eng','chi_sim']);await page.locator('#ocrAction').selectOption('panel');await page.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.ocrAction==='panel');await page.goBack();await page.waitForURL(reader);await page.waitForSelector('#open-file');
 await page.goForward();await page.waitForURL(settings);
 const beforeReturn=context.pages().length;await page.locator('#open-reader').click();await page.waitForURL(reader);assert.equal(context.pages().length,beforeReturn);await page.goBack();await page.waitForURL(settings);
 // Hide the complete dark-paper row only for an explicitly Light appearance,
 // without resetting either stored checkbox value, in either interface language.
 for(const locale of ['en-US','zh-CN']){
  await page.locator('#locale').selectOption(locale);await page.waitForFunction(locale=>document.documentElement.lang===locale,locale);
  for(const enabled of [true,false]){
   await page.locator('#preserveDarkPaper').setChecked(enabled);
   await page.waitForFunction(async enabled=>(await chrome.storage.local.get('settings')).settings.preserveDarkPaper===enabled,enabled);
   for(const appearance of ['light','dark','light','auto']){
    await page.locator('#appearance').selectOption(appearance);
    await page.waitForFunction(light=>document.querySelector('#preserveDarkPaper')?.closest('.row').hidden===light,appearance==='light');
    assert.equal(await page.locator('#preserveDarkPaper-title').isVisible(),appearance!=='light');
    assert.equal(await page.locator('#preserveDarkPaper').isVisible(),appearance!=='light');
    assert.equal(await page.locator('#preserveDarkPaper').isChecked(),enabled);
    assert.equal(await page.evaluate(async()=>(await chrome.storage.local.get('settings')).settings.preserveDarkPaper),enabled);
    if(appearance==='light'){
     await page.reload();await page.waitForSelector('#appearance');assert.equal(await page.locator('#preserveDarkPaper').isVisible(),false);
     assert.equal(await page.locator('#preserveDarkPaper').isChecked(),enabled);
    }
   }
  }
 }
 await page.emulateMedia({colorScheme:'light'});assert.equal(await page.locator('#preserveDarkPaper').isVisible(),true,'Auto keeps the preference available even in a light browser');
 await page.locator('#preserveDarkPaper').check();await page.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.preserveDarkPaper===true);
 await page.locator('#locale').selectOption('auto');await page.waitForFunction(()=>document.querySelector('#locale')?.value==='auto'&&document.documentElement.lang==='en-US');
 report.checks.push('dark-paper setting hidden only for explicit Light appearance, restored for Auto/Dark; on/off preference survives transitions and reloads in both languages');
 await page.goBack();await page.waitForSelector('#settings');
 report.checks.push('homepage Settings uses the same tab and restores with Back/Forward');
 for(const scheme of ['light','dark']){
  await page.emulateMedia({colorScheme:scheme});await go(base+'/slow');await page.waitForURL(url=>url.href.startsWith(reader+'?source='));
  assert.equal(await page.locator('#welcome').isVisible(),false);
  const element=await page.waitForSelector('iframe'),warm=await element.contentFrame();
  await warm.waitForFunction(()=>window.qaWorkerReady===true||window.qaWorkerError,null,{polling:50});assert.equal(await warm.evaluate(()=>window.qaWorkerError),undefined);
  assert.equal(await page.locator('#splash').count(),0);assert.equal(await warm.locator('header').isVisible(),true);
  assert.equal(await warm.locator('#progress').isVisible(),true);assert.equal(await warm.locator('#status').textContent(),'');assert.equal(await warm.locator('#scale').inputValue(),'1');
  assert.equal(await warm.locator('#scale-input').isVisible(),true);assert.equal(await warm.locator('#scale-input').isDisabled(),true);assert.equal(await warm.locator('#scale').isVisible(),false);assert.equal(await warm.locator('#sidebar-toggle').evaluate(n=>n.parentElement.id),'leading-actions');assert.equal(await warm.locator('#sidebar-toggle').isDisabled(),true);
  assert.equal(await warm.locator('.identity').isVisible(),false);assert.equal(await warm.locator('.file').isVisible(),true);
  assert.equal(await warm.locator('#print').isDisabled(),true);assert.equal(await warm.locator('#properties').isDisabled(),true);assert.equal(await warm.locator('#filename').isDisabled(),true);assert.equal(await warm.locator('#download').isDisabled(),true);assert.equal(await warm.locator('#next').isDisabled(),true);assert.equal(await warm.locator('#native').isDisabled(),false);
  const geometry=await warm.evaluate(()=>{const h=document.querySelector('header').getBoundingClientRect(),p=document.querySelector('#progress').getBoundingClientRect();return{height:h.height,aligned:Math.abs(h.bottom-p.bottom)<1&&p.height===2};});assert.equal(geometry.aligned,true);
  await warm.locator('#theme').click();await warm.waitForFunction(dark=>document.documentElement.dataset.dark===String(!dark),scheme==='dark');
  await warm.locator('#theme').click();await warm.waitForFunction(dark=>document.documentElement.dataset.dark===String(dark),scheme==='dark');
  await warm.locator('#settings').click();await warm.waitForSelector('#more-actions:popover-open');assert.equal(await warm.locator('[data-action=print]').isDisabled(),true);assert.equal(await warm.locator('[data-action=open-settings]').isDisabled(),false);await warm.locator('[data-action=open-settings]').press('Escape');
  await page.screenshot({path:join(folder,'loading-'+scheme+'.png')});releaseSlow();
  await page.waitForFunction(()=>document.documentElement.dataset.view==='reader');await warm.waitForSelector('.page canvas');assert.equal(await warm.locator('#progress').isVisible(),false);
  assert.equal(await warm.locator('header').evaluate(n=>n.getBoundingClientRect().height),geometry.height);assert.equal(await warm.locator('#download').isDisabled(),false);
 }
 await page.emulateMedia({colorScheme:'light'});report.checks.push('toolbar visible and interactive during slow loading in both themes; parser worker prewarmed; divider progress causes no layout shift; factory toolbar items hidden');
 // Preserve coverage of the optional original two-row layout as well.
 await worker.evaluate(async()=>{const {settings={}}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,showFilename:true,showBranding:true,toolbarHidden:Object.fromEntries(['pages','find','paging','zoom','fit','rotate','fullscreen','ocr','print','properties','native'].map(k=>[k,false]))}});});
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
 await frame.locator('#zoom-in').click();await frame.locator('#zoom-in').click();await frame.waitForFunction(()=>Math.abs(window.qaViewer.currentScale-1.2)<.001);report.checks.push('100% initial scale, 10-point zoom and sandbox isolation');await checkCopyAll(frame);
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
 assert.equal(await frame.locator('#theme-auto').count(),0);
 assert.equal(await frame.locator('#theme').getAttribute('title'),'Switch light/dark mode');
 await page.emulateMedia({colorScheme:'dark'});await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');
 await page.emulateMedia({colorScheme:'light'});await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');
 assert.deepEqual(await frame.locator('#viewport').evaluate(n=>[getComputedStyle(n).overscrollBehaviorX,getComputedStyle(n).overscrollBehaviorY]),['auto','contain']);
 assert.equal(await frame.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true,cancelable:true}))),true);
 await frame.locator('#scale').selectOption('3');await frame.locator('#viewport').hover();await page.mouse.wheel(350,0);await frame.waitForFunction(()=>document.querySelector('#viewport').scrollLeft>0);
 await frame.locator('#scale').selectOption('1');await frame.waitForFunction(()=>qaViewer.currentScale===1);report.checks.push('single default/opposite theme control, native history shortcuts and horizontal PDF scrolling');
 await page.screenshot({path:join(folder,'reader-dark.png')});report.checks.push('dark appearance and paper boundary');
 assert.deepEqual(await frame.locator('#primary-actions > button').evaluateAll(nodes=>nodes.map(n=>n.id)),['theme','print','properties','settings','native','download']);
 assert.equal(await frame.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.endsWith('/properties.js'))),false,'properties module is not part of first-page loading');
 await frame.evaluate(()=>{window.qaMetadataCalls=0;const doc=qaViewer.pdfDocument,read=doc.getMetadata.bind(doc);doc.getMetadata=()=>{qaMetadataCalls++;return read();};});
 await frame.locator('#properties').click();await frame.waitForSelector('#properties-dialog[open]');await frame.waitForFunction(()=>document.querySelector('[data-property=author]').textContent==='Cosmic PDF tests');
 assert.equal(await frame.locator('#properties-title').textContent(),'Document properties');assert.equal(await frame.locator('[data-property=documentTitle]').textContent(),'QA <b>metadata</b>');assert.equal(await frame.locator('#properties-list b').count(),0);
 assert.equal(await frame.locator('[data-property=pdfVersion]').textContent(),'1.7');assert.equal(await frame.locator('[data-property=pageCount]').textContent(),'6');assert.equal(await frame.locator('[data-property=fastWebView]').textContent(),'No');assert.equal(await frame.locator('[data-property=keywords]').textContent(),'—');
 assert.match(await frame.locator('[data-property=fileSize]').textContent(),/KB$/);assert.match(await frame.locator('[data-property=created]').textContent(),/2026/);assert.match(await frame.locator('[data-property=pageSize]').textContent(),/8.5 × 11.69 in/);
 await page.screenshot({path:join(folder,'properties-dark-en.png')});await frame.locator('#properties-close').click();await frame.locator('#properties').click();await frame.waitForFunction(()=>!document.querySelector('#properties-status').textContent);assert.equal(await frame.evaluate(()=>qaMetadataCalls),1);await frame.locator('#properties-close').press('Escape');
 await frame.locator('#filename').click();await frame.waitForSelector('#properties-dialog[open]');await frame.waitForFunction(()=>!document.querySelector('#properties-status').textContent);assert.equal(await frame.evaluate(()=>qaMetadataCalls),1);await frame.locator('#properties-close').press('Escape');assert.equal(await frame.evaluate(()=>document.activeElement.id),'filename');await frame.locator('#filename').press('Enter');await frame.waitForSelector('#properties-dialog[open]');await frame.locator('#properties-close').click();
 // Overflowing metadata dialogs open at the top, including after a bottom-scrolled close.
 await page.setViewportSize({width:760,height:400});
 for(let i=0;i<2;i++){
  await frame.locator('#filename').click();await frame.waitForFunction(()=>!document.querySelector('#properties-status').textContent);
  assert.deepEqual(await frame.locator('#properties-dialog').evaluate(n=>({overflow:n.scrollHeight>n.clientHeight,top:n.scrollTop,left:n.scrollLeft,focus:document.activeElement.id})),{overflow:true,top:0,left:0,focus:'properties-title'});
  await frame.locator('#properties-dialog').evaluate(n=>{n.scrollTop=n.scrollHeight;});await frame.locator('#properties-close').click();
  assert.equal(await frame.evaluate(()=>document.activeElement.id),'filename');
 }
 await page.setViewportSize({width:1360,height:960});
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');await frame.locator('#properties').click();await frame.waitForFunction(()=>!document.querySelector('#properties-status').textContent);await page.screenshot({path:join(folder,'properties-light-en.png')});await frame.locator('#properties-close').click();await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');
 report.checks.push('properties action order, on-demand module/metadata, safe selectable text, correct PDF fields and cached reopening');
 await frame.locator('#search-toggle').click();assert.equal(await frame.locator('#browser-find-hint').count(),0);assert.equal(await frame.locator('#query').isVisible(),true);
 const findShortcut=modifier=>document.querySelector('#viewport').dispatchEvent(new KeyboardEvent('keydown',{key:'f',[modifier]:true,bubbles:true,cancelable:true}));
 for(const modifier of ['metaKey','ctrlKey'])assert.equal(await frame.evaluate(findShortcut,modifier),true);assert.equal(await frame.locator('#findbar').isVisible(),false);
 await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,useChromeFind:false}});});await frame.waitForFunction(()=>!qaSettings().useChromeFind);
 for(const modifier of ['metaKey','ctrlKey'])assert.equal(await frame.evaluate(findShortcut,modifier),false);assert.equal(await frame.locator('#browser-find-hint').count(),0);await frame.locator('#query').fill('Searchable');await frame.waitForFunction(()=>document.querySelector('#matches').textContent.includes('/ 6'));await frame.locator('#find-close').click();report.checks.push('browser Find shortcuts pass through by default; reader Find retains complete-PDF text search');
 await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,useChromeFind:true}});});await frame.waitForFunction(()=>qaSettings().useChromeFind);
 await frame.locator('#search-toggle').click();await frame.locator('#query').fill('Searchable');await frame.waitForFunction(()=>document.querySelector('#matches').textContent.includes('/ 6'));
 for(const dark of [true,false]){if(await frame.evaluate(()=>document.documentElement.dataset.dark==='true')!==dark){await frame.locator('#theme').click();await frame.waitForFunction(d=>document.documentElement.dataset.dark===String(d),dark);}await frame.waitForSelector('.textLayer .highlight.selected');assert.equal(await frame.locator('.textLayer .highlight.selected').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(255, 152, 0, 0.65)');await page.screenshot({path:join(folder,'find-orange-'+(dark?'dark':'light')+'.png')});}
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');await frame.locator('#find-close').click();report.checks.push('toolbar Find always searches internally with orange matches in both themes, even when Chrome shortcuts are enabled');
 await frame.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);await frame.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);report.checks.push('fullscreen through trusted host');
 await frame.locator('#print').click();await frame.waitForSelector('#print-dialog[open]');await frame.locator('#print-dialog button[value=cancel]').click();report.checks.push('bounded print-range dialog');

 await checkDownload(frame,'document.pdf',viewerPdf(6));report.checks.push('remote PDF original-byte download without downloads permission or navigation');

 await frame.locator('#native').click();await page.waitForURL(base+'/document?token=a%2Bb&sig=x%3D#page=2');assert.ok((await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).length===1);await page.reload();await delay(200);assert.ok(page.url().startsWith(base));report.checks.push('native return and reload without recapture');
 const other=await context.newPage();observe(other);await other.goto(base+'/document?token=a%2Bb&sig=x%3D').catch(()=>{});await other.waitForURL(url=>url.href.startsWith(reader));await other.close();report.checks.push('native exemption limited to one tab');
 await go(base+'/html.pdf');await page.waitForSelector('h1');assert.equal(page.url(),base+'/html.pdf');await delay(100);assert.equal((await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).length,0);report.checks.push('HTML exception and exemption cleanup');
 const attachment=page.waitForEvent('download');await go(base+'/attachment');await (await attachment).cancel();report.checks.push('attachment stays a download');
 await go(base+'/form');await page.locator('button').click();await delay(500);assert.equal(page.url(),base+'/post');report.checks.push('POST is not replayed/intercepted');
 frame=await open('/binary.pdf');report.checks.push('binary MIME with PDF filename');
 let prefs=await context.newPage();observe(prefs);await prefs.goto(settings);await prefs.locator('#locale').selectOption('zh-CN');await prefs.waitForFunction(()=>document.documentElement.lang==='zh-CN');await prefs.locator('#sampling').selectOption('1');await prefs.locator('#gap').selectOption('24');await chooseLanguages(prefs,'#ocrLanguages',['eng','chi_tra']);await prefs.locator('#appearance').selectOption('dark');await prefs.waitForFunction(async()=>{const s=(await chrome.storage.local.get('settings')).settings;return s?.sampling===1&&s?.appearance==='dark'&&s?.gap===24&&s?.ocrLanguages?.join('+')==='eng+chi_tra';});
 assert.equal(await frame.evaluate(()=>qaViewer.getPageView(0).getRenderPixelRatio()),4,'existing reader sampling snapshot');await prefs.screenshot({path:join(folder,'settings-zh.png'),fullPage:true});report.checks.push('localized settings and immutable open-reader sampling');
 frame=await open('/new');assert.equal(await frame.evaluate(()=>qaViewer.getPageView(0).getRenderPixelRatio()),1);assert.equal(await frame.evaluate(()=>document.documentElement.dataset.dark),'true');assert.equal(await frame.locator('#viewport').evaluate(n=>n.scrollTop),0);report.checks.push('new-reader preferences');
 await frame.locator('#properties').click();await frame.waitForFunction(()=>!document.querySelector('#properties-status').textContent);assert.equal(await frame.locator('#properties-title').textContent(),'文档信息');
 await frame.evaluate(()=>window.qaLocaleDoc=qaViewer.pdfDocument);
 assert.match(await frame.locator('[data-property=created]').textContent(),/2026 年 1 月 2 日 12:34:56 \(UTC\)/);
 assert.deepEqual(await frame.locator('#properties-dialog').evaluate(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,font:getComputedStyle(n).fontSize})),{width:560,height:560,font:'15px'});assert.equal(await frame.locator('#properties-list').evaluate(n=>getComputedStyle(n).fontSize),'15px');
 for(const [format,date]of [['ymd','2026-01-02'],['ymd-slash','2026/01/02'],['dmy','02/01/2026'],['mdy','01/02/2026']]){await prefs.locator('#propertyDateFormat').selectOption(format);await frame.waitForFunction(value=>document.querySelector('[data-property=created]').textContent===value,date+' 12:34:56 (UTC)');}
 const languageHome=await context.newPage();observe(languageHome);await languageHome.goto(reader);
 await prefs.locator('#locale').selectOption('en-US');await frame.waitForFunction(()=>document.querySelector('#properties-title').textContent==='Document properties');await languageHome.waitForFunction(()=>document.querySelector('#open-file').textContent==='Open a PDF');assert.equal(await prefs.locator('#title').textContent(),'Settings');assert.equal(await frame.locator('#ocr-toggle').getAttribute('title'),'Text recognition');assert.equal(await frame.evaluate(()=>qaViewer.pdfDocument===qaLocaleDoc),true);
 await prefs.locator('#propertyDateFormat').selectOption('auto');await frame.waitForFunction(()=>document.querySelector('[data-property=created]').textContent==='Jan 2, 2026, 12:34:56 PM (UTC)');
 await prefs.locator('#locale').selectOption('zh-CN');await frame.waitForFunction(()=>document.querySelector('#properties-title').textContent==='文档信息');await frame.waitForFunction(()=>document.querySelector('[data-property=created]').textContent==='2026 年 1 月 2 日 12:34:56 (UTC)');await languageHome.waitForFunction(()=>document.querySelector('#open-file').textContent==='打开 PDF 文件');assert.equal(await prefs.locator('#title').textContent(),'设置');await languageHome.close();await page.bringToFront();
 await frame.locator('#properties-list').click();assert.equal(await frame.locator('#properties-dialog').evaluate(n=>n.open),true);await page.mouse.click(8,8);await frame.waitForFunction(()=>!document.querySelector('#properties-dialog').open);await frame.locator('#properties').click();await frame.waitForFunction(()=>!document.querySelector('#properties-status').textContent);
 report.checks.push('live date formats, explicit time zones, spaced Chinese dates, properties dialog outside dismissal; live reader localization without reparse');
assert.match(await frame.locator('[data-property=pageSize]').textContent(),/215.9 × 297.04 mm/);
 await page.setViewportSize({width:360,height:850});await frame.waitForFunction(()=>document.documentElement.dataset.toolbarWrap==='true');assert.equal(await frame.evaluate(()=>document.querySelector('header .file').getBoundingClientRect().top>=document.querySelector('header .actions').getBoundingClientRect().bottom),true);assert.equal(await frame.locator('#properties-dialog').evaluate(n=>n.getBoundingClientRect().width<=innerWidth&&n.scrollWidth<=n.clientWidth),true);await page.screenshot({path:join(folder,'properties-dark-zh-narrow.png')});await frame.locator('#properties-close').click();await page.setViewportSize({width:1360,height:960});
 report.checks.push('localized document properties reflow within a narrow viewport');
 // Toolbar preferences update the existing reader without reparsing the PDF.
 await frame.evaluate(()=>window.qaOriginalDocument=qaViewer.pdfDocument);
 await chooseToolbar(prefs,'branding');
 await frame.waitForFunction(()=>document.querySelector('.file').hidden);assert.equal(await frame.locator('.identity').isVisible(),true);
 assert.equal(await frame.evaluate(()=>qaViewer.pdfDocument===window.qaOriginalDocument),true);
 frame=await open('/branding');assert.equal(await frame.locator('.file').isVisible(),false);assert.equal(await frame.locator('.identity').isVisible(),true);
 assert.equal(await frame.locator('#appearance-actions').count(),0);assert.equal(await frame.locator('#primary-actions > button').first().getAttribute('id'),'theme');
 const compactHeight=await frame.locator('header').evaluate(n=>n.getBoundingClientRect().height);assert.ok(compactHeight<60);
 await checkToolbarLayout(page,frame,1101,false);await checkToolbarLayout(page,frame,720,true);await page.setViewportSize({width:1360,height:960});
 await chooseToolbar(prefs,'filename');
 await frame.waitForFunction(()=>document.querySelector('.identity').hidden);
 frame=await open('/An exceptionally long PDF filename that must fit without overlapping other toolbar controls.pdf');
 assert.equal(await frame.locator('.identity').isVisible(),false);assert.equal(await frame.locator('#filename').isVisible(),true);
 const filenameBox=await frame.locator('.file').boundingBox();assert.ok(filenameBox.width<=320);assert.ok(filenameBox.x>50);assert.ok(filenameBox.x-(await frame.locator('#sidebar-toggle').boundingBox()).x>=46);
 assert.deepEqual(await frame.locator('#filename').evaluate(n=>{const s=getComputedStyle(n);return [s.textOverflow,s.fontWeight,s.fontSize];}),['ellipsis','400','15px']);
 const filenameInset=await frame.locator('#filename').evaluate(n=>n.parentElement.getBoundingClientRect().width-n.getBoundingClientRect().width);assert.ok(filenameInset>=12&&filenameInset<=24,`filename display inset: ${filenameInset}px`);
 await page.screenshot({path:join(folder,'toolbar-filename.png')});await page.setViewportSize({width:360,height:850});await page.screenshot({path:join(folder,'toolbar-filename-narrow.png')});
 const narrowFilename=await frame.evaluate(()=>{const file=document.querySelector('.file'),a=file.getBoundingClientRect(),b=document.querySelector('.actions').getBoundingClientRect();return {file:a.toJSON(),actions:b.toJSON(),overflow:document.documentElement.scrollWidth,viewport:innerWidth,style:getComputedStyle(file).cssText,text:document.querySelector('#filename').textContent};});assert.ok(narrowFilename.file.right<=narrowFilename.actions.left&&narrowFilename.overflow<=narrowFilename.viewport,JSON.stringify(narrowFilename));
 await page.setViewportSize({width:1360,height:960});await prefs.reload();await prefs.waitForSelector('#showFilename');assert.equal(await prefs.locator('#showFilename').isChecked(),true);assert.equal(await prefs.locator('#showBranding').isChecked(),false);
 await frame.evaluate(()=>window.qaBeforeHideBoth=qaViewer.pdfDocument);
 await chooseToolbar(prefs,'none');await frame.waitForFunction(()=>document.querySelector('.identity').hidden&&document.querySelector('.file').hidden);
 assert.equal(await frame.locator('#appearance-actions').count(),0);assert.equal(await frame.evaluate(()=>qaViewer.pdfDocument===window.qaBeforeHideBoth),true);
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
 assert.equal(await frame.locator('header').evaluate(n=>getComputedStyle(n).paddingTop),'6px');assert.equal(await frame.locator('#appearance-actions').count(),0);
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');
 report.checks.push('persisted toolbar checkboxes, all four combinations, live preference updates, compact layouts, long filenames and explicit theme defaults');
 assert.deepEqual(await frame.locator('#ocr-languages input:checked').evaluateAll(nodes=>nodes.map(n=>n.value)),['eng','chi_tra']);
 const defaultChecks=await prefs.locator('#ocrLanguages input:checked').evaluateAll(nodes=>nodes.map(n=>n.value));await prefs.reload();await prefs.waitForSelector('#ocrLanguages input');assert.deepEqual(await prefs.locator('#ocrLanguages input:checked').evaluateAll(nodes=>nodes.map(n=>n.value)),defaultChecks);
 await chooseLanguages(prefs,'#ocrLanguages',['chi_sim','chi_tra']);await prefs.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.ocrLanguages.join('+')==='chi_sim+chi_tra');
 assert.deepEqual(await frame.locator('#ocr-languages input:checked').evaluateAll(nodes=>nodes.map(n=>n.value)),['eng','chi_tra'],'open reader keeps original choices');
 report.checks.push('OCR checkbox persistence, arbitrary combinations and reader snapshot');
 // Scans are authored here. Real recognition runs in the production sandbox.
 const makeScan=async(lines,count=1)=>{const jpeg=await page.evaluate(async lines=>{const c=document.createElement('canvas');c.width=1000;c.height=1400;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,1000,1400);g.fillStyle='black';g.font='58px "PingFang SC",sans-serif';lines.forEach((line,i)=>g.fillText(line,60,160+i*130));return Array.from(new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/jpeg',.98))).arrayBuffer()));},lines);return scannedPdf(Buffer.from(jpeg),1000,1400,count);};
 englishScan=await makeScan(['COSMIC PDF READER','LOCAL OCR 12345']);batchScan=await makeScan(['COSMIC PDF READER','LOCAL OCR 12345'],12);chineseScan=await makeScan(['中文文字识别 测试','繁體中文 閱讀文件','COSMIC PDF 2026']);
 frame=await open('/scan');await frame.locator('#ocr-toggle').click();await chooseLanguages(frame,'#ocr-languages',['eng']);
 assert.equal(await frame.locator('#ocr-languages input[value=eng]').getAttribute('aria-disabled'),'true');
 await frame.locator('#ocr-languages input[value=eng]').focus();await frame.locator('#ocr-languages input[value=eng]').press('Space');assert.equal(await frame.locator('#ocr-languages input[value=eng]').isChecked(),true,'retain final language');
 // Track this recognition run, not stale CDP handles from earlier navigations.
 const ocrWorkers=new Set(),trackOcrWorker=w=>{ocrWorkers.add(w);w.once('close',()=>ocrWorkers.delete(w));};page.on('worker',trackOcrWorker);
 const start=performance.now();await frame.locator('#ocr-start').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled,{timeout:130000});assert.match((await frame.locator('.ocr-text-layer').allTextContents()).join(''),/COSMIC PDF READER/);assert.ok(await frame.locator('.ocr-text-layer span').count()>2);assert.equal(await frame.locator('#ocr-result,#ocr-result-page,#ocr-copy').count(),0);
 // Intercept the real Copy event in QA only, without touching the OS clipboard.
 await frame.evaluate(()=>{const layer=document.querySelector('.ocr-text-layer'),range=document.createRange();range.selectNodeContents(layer);getSelection().removeAllRanges();getSelection().addRange(range);document.addEventListener('copy',event=>{event.preventDefault();window.qaCopied=getSelection().toString();},{once:true,capture:true});});await page.keyboard.press('Meta+c');await frame.waitForFunction(()=>window.qaCopied?.includes('12345'));await frame.evaluate(()=>getSelection().removeAllRanges());report.ocrMs=Math.round(performance.now()-start);
 const words=await frame.locator('.ocr-text-layer span').count();await frame.locator('#rotate').click();await frame.waitForFunction(()=>qaViewer.pagesRotation===270);await frame.waitForSelector('.ocr-text-layer span');assert.equal(await frame.locator('.ocr-text-layer span').count(),words);await frame.locator('#zoom-in').click();await delay(300);assert.ok(await frame.locator('.ocr-text-layer span').count()>2);await page.screenshot({path:join(folder,'ocr-dark.png')});report.checks.push('local OCR, native selection/copy and zoom/rotation overlay without a separate transcript');
 await frame.locator('#ocr-start').click();await frame.locator('#ocr-cancel').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled);assert.equal(await frame.locator('#ocr-cancel').isVisible(),false);report.checks.push('immediate OCR cancellation');
 for(let i=0;i<30&&ocrWorkers.size;i++)await delay(50);assert.equal(ocrWorkers.size,0,'new OCR workers released after completion/cancellation');page.off('worker',trackOcrWorker);report.checks.push('OCR worker teardown');

 frame=await open('/chinese');await frame.locator('#ocr-toggle').click();await chooseLanguages(frame,'#ocr-languages',['eng','chi_sim']);await frame.locator('#ocr-start').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled,{timeout:130000});const simplified=(await frame.locator('.ocr-text-layer').allTextContents()).join('');assert.match(simplified,/中文/);assert.match(simplified,/COSMIC/);await chooseLanguages(frame,'#ocr-languages',['eng','chi_tra']);await frame.locator('#ocr-start').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled,{timeout:130000});const traditional=(await frame.locator('.ocr-text-layer').allTextContents()).join('');assert.match(traditional,/中文/);report.checks.push('Simplified/Traditional Chinese and mixed English recognition');
 await chooseLanguages(frame,'#ocr-languages',['chi_sim','chi_tra']);await frame.locator('#ocr-start').click();await frame.waitForFunction(()=>!document.querySelector('#ocr-start').disabled,{timeout:130000});assert.match((await frame.locator('.ocr-text-layer').allTextContents()).join(''),/中文/);assert.equal(await frame.locator('.ocr-text-layer span').first().evaluate(n=>getComputedStyle(n).letterSpacing),'normal','UI tracking does not affect recognized word positions');report.checks.push('combined Chinese recognition without English selected');
 await page.screenshot({path:join(folder,'ocr-zh.png')});
 // Direct OCR and long press share the same bounded worker and page overlays.
 await chooseLanguages(prefs,'#ocrLanguages',['eng']);await prefs.locator('#ocrAction').selectOption('page');await frame.waitForFunction(()=>qaSettings().ocrAction==='page');
 await frame.locator('#ocr-clear').click();await frame.locator('#ocr-close').click();
 await frame.locator('#ocr-toggle').click({delay:650});assert.equal(await frame.locator('#ocr-panel').isVisible(),true);assert.equal(await frame.locator('#ocr-toggle').getAttribute('aria-busy'),'false');await frame.locator('#ocr-close').click();
 await frame.locator('#ocr-toggle').dispatchEvent('pointerdown',{button:0,isPrimary:true,pointerId:2,clientX:10,clientY:10});await frame.locator('#ocr-toggle').dispatchEvent('pointercancel',{pointerId:2});await delay(600);assert.equal(await frame.locator('#ocr-panel').isVisible(),false);
 frame=await open('/scan');await frame.locator('#ocr-toggle').click();assert.equal(await frame.locator('#ocr-panel').isVisible(),false);await frame.waitForFunction(()=>document.querySelector('.ocr-text-layer span')&&document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='false');assert.match((await frame.locator('.ocr-text-layer').allTextContents()).join(''),/COSMIC PDF READER/);
 await prefs.locator('#ocrAction').selectOption('next5');await frame.waitForFunction(()=>qaSettings().ocrAction==='next5');frame=await open('/scan-many');await frame.evaluate(()=>{window.qaOcrDelay=400;qaViewer.currentPageNumber=2;});await frame.waitForSelector('.page[data-page-number="2"] canvas');
 await frame.locator('#ocr-toggle').click();await frame.waitForFunction(()=>!!document.querySelector('.page[data-page-number="2"] .ocr-text-layer span')&&document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='true');assert.equal(await frame.locator('#ocr-to').inputValue(),'7');assert.equal(await frame.locator('#ocr-panel').isVisible(),false);assert.equal(await frame.locator('#ocr-feedback').isVisible(),true);
 await frame.locator('#ocr-toggle').click({delay:650});assert.equal(await frame.locator('#ocr-panel').isVisible(),true);await frame.locator('#ocr-close').click();assert.equal(await frame.locator('#ocr-toggle').getAttribute('aria-busy'),'true');
 await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='false',null,{timeout:130000});await frame.evaluate(()=>qaViewer.currentPageNumber=7);await frame.waitForSelector('.page[data-page-number="7"] .ocr-text-layer span');await frame.evaluate(()=>qaViewer.currentPageNumber=8);await frame.waitForSelector('.page[data-page-number="8"] canvas');assert.equal(await frame.locator('.page[data-page-number="8"] .ocr-text-layer').count(),0);
 await prefs.locator('#ocrAction').selectOption('next10');await frame.waitForFunction(()=>qaSettings().ocrAction==='next10');await frame.evaluate(()=>qaViewer.currentPageNumber=3);await frame.waitForSelector('.page[data-page-number="3"] canvas');await frame.locator('#ocr-toggle').click();assert.equal(await frame.locator('#ocr-to').inputValue(),'12');
 await prefs.locator('#locale').selectOption('en-US');await frame.waitForFunction(()=>document.documentElement.lang==='en-US');assert.equal(await frame.locator('#ocr-languages input[value=eng]').evaluate(n=>n.nextElementSibling.textContent),'English');
 await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='false',null,{timeout:130000});await frame.evaluate(()=>qaViewer.currentPageNumber=12);await frame.waitForSelector('.page[data-page-number="12"] .ocr-text-layer span');
 await prefs.locator('#hide-ocr').check();await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').hidden);await frame.locator('#settings').click();await frame.locator('[data-action=ocr-toggle]').click({delay:650});assert.equal(await frame.locator('#ocr-panel').isVisible(),true);assert.equal(await frame.locator('#ocr-toggle').getAttribute('aria-busy'),'false');
 await frame.locator('#ocr-clear').click();await frame.locator('#ocr-close').click();await frame.locator('#settings').click();await frame.locator('[data-action=ocr-toggle]').click();await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='true');await frame.locator('#ocr-feedback-cancel').click();await frame.waitForFunction(()=>document.querySelector('#ocr-toggle').getAttribute('aria-busy')==='false');
 await prefs.locator('#hide-ocr').uncheck();await prefs.locator('#ocrAction').selectOption('panel');await frame.waitForFunction(()=>qaSettings().ocrAction==='panel'&&!document.querySelector('#ocr-toggle').hidden);await frame.locator('#ocr-toggle').click();assert.equal(await frame.locator('#ocr-panel').isVisible(),true);await frame.locator('#ocr-close').click();
 report.checks.push('direct current/next-five/next-ten OCR, incremental overlays before batch completion, EOF clipping, cancellation, and long press in toolbar/menu without a duplicate run');

 await prefs.locator('#sampling').selectOption('6');await prefs.locator('#sharpening').check();await prefs.locator('#locale').selectOption('en-US');await prefs.waitForFunction(async()=>{const s=(await chrome.storage.local.get('settings')).settings;return s?.sampling===6&&s?.locale==='en-US'&&s?.sharpening;});
 frame=await open('/detail');await frame.waitForFunction(()=>qaViewer.getPageView(0).detailView?.renderingState===3);const view=await frame.evaluate(()=>{const v=qaViewer.getPageView(0),c=v.detailView.canvas;return {ratio:c.width/c.getBoundingClientRect().width,pixels:c.width*c.height,base:v.canvas.width*v.canvas.height};});assert.ok(view.ratio>5.9);assert.ok(view.pixels<=36*1024*1024);assert.ok(view.base<=4*1024*1024);await frame.locator('#scale').selectOption('3');await frame.waitForFunction(()=>qaViewer.currentScale===3&&qaViewer.getPageView(0).detailView?.renderingState===3);report.checks.push('6× sampling, high zoom and canvas budgets');
 await prefs.bringToFront();await prefs.screenshot({path:join(folder,'settings-en.png'),fullPage:true});
 async function checkDefaultLabels(zh){
  const expected={ocrAction:'page',appearance:'auto',sampling:'4',zoom:'1',gap:'16',darkStrength:'0.96',ocrQuality:'2',ocrLayout:'3'},suffix=zh?'（默认）':' (default)';
  for(const [key,value]of Object.entries(expected)){
   const marked=await prefs.locator('#'+key+' option').evaluateAll((options,suffix)=>options.filter(o=>o.textContent.endsWith(suffix)).map(o=>o.value),suffix);
   assert.deepEqual(marked,[value]);
  }
  assert.equal(await prefs.locator('#propertyDateFormat option[value=auto]').textContent(),zh?'语言默认格式':'Language default');
  assert.equal(await prefs.locator('#propertyDateFormat option').evaluateAll((nodes,suffix)=>nodes.some(n=>n.textContent.endsWith(suffix)),suffix),false);
  const savedViewport=prefs.viewportSize();
  for(const width of [1100,681,680,360,320]){
   await prefs.setViewportSize({width,height:900});
   const layout=await prefs.evaluate(()=>{
    const select=document.querySelector('#propertyDateFormat'),reference=document.querySelector('#sampling'),box=select.getBoundingClientRect(),ref=reference.getBoundingClientRect(),style=getComputedStyle(select),ctx=document.createElement('canvas').getContext('2d');ctx.font=style.font;
    const longest=Math.max(...[...select.options].map(o=>ctx.measureText(o.textContent).width+o.textContent.length*(parseFloat(style.letterSpacing)||0)));
    const withinCard=[select,document.querySelector('#ocrAction')].every(node=>{const b=node.getBoundingClientRect(),r=node.closest('.row').getBoundingClientRect();return b.left>=r.left&&b.right<=r.right;});
    return {sameWidth:Math.abs(box.width-ref.width)<1,aligned:Math.abs(box.right-ref.right)<1,withinCard,labelsFit:longest<=box.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-26};
   });
   assert.deepEqual(layout,{sameWidth:true,aligned:true,withinCard:true,labelsFit:true},`Settings select geometry: ${zh?'Chinese':'English'} at ${width}px`);
  }
  await prefs.setViewportSize(savedViewport);
  const hiddenSuffix=zh?'（默认隐藏）':' (hidden by default)';
  assert.deepEqual(await prefs.locator('#toolbarHidden label').evaluateAll((nodes,suffix)=>nodes.filter(n=>n.textContent.endsWith(suffix)).map(n=>n.querySelector('input').id),hiddenSuffix),['hide-find','hide-paging','hide-fit','hide-print','hide-properties','hide-native']);
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
 const local=join(folder,'local.pdf');await writeFile(local,viewerPdf(2));await page.locator('#file').setInputFiles(local);await page.waitForURL(reader);const lf=await(await page.waitForSelector('iframe')).contentFrame();await lf.waitForSelector('.page canvas');await checkDownload(lf,'local.pdf',viewerPdf(2));report.checks.push('local PDF original-byte download without downloads permission');const popup=context.waitForEvent('page');await lf.locator('#native').click();const nativeLocal=await popup;await nativeLocal.waitForLoadState();assert.ok(nativeLocal.url().startsWith('blob:chrome-extension://'));await nativeLocal.close();report.checks.push('local file picker and native blob fallback');
 // Clear QA-only explicit overrides before testing shared factory defaults.
 await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,toolbarHidden:{}}});});
 await prefs.reload();await prefs.waitForFunction(()=>document.querySelector('#hide-native')?.checked);
 // Configure overflow through the actual Settings controls, then exercise the existing commands.
 await prefs.setViewportSize({width:1100,height:900});await page.setViewportSize({width:1360,height:960});await chooseToolbar(prefs,'none');
 frame=await open('/overflow');await frame.evaluate(()=>window.qaOverflowDoc=qaViewer.pdfDocument);
 assert.equal(await frame.locator('#settings').getAttribute('aria-haspopup'),'menu');assert.equal(await frame.locator('#sidebar-toggle').evaluate(n=>n.getBoundingClientRect().left<25),true);
 for(const mode of ['both','filename','branding','none']){
  await chooseToolbar(prefs,mode);await frame.waitForFunction(mode=>document.documentElement.dataset.toolbar===mode,mode);
  assert.deepEqual(await prefs.locator('#toolbarHidden input:checked').evaluateAll(nodes=>nodes.map(n=>n.id)),['hide-find','hide-paging','hide-fit','hide-print','hide-properties','hide-native']);
  assert.equal(await frame.locator('#native').isVisible(),false);
  assert.equal(await frame.locator('#sidebar-toggle').evaluate(n=>n.parentElement.id),'leading-actions');
  await frame.waitForFunction(()=>{const p=document.querySelector('#sidebar-toggle').getBoundingClientRect(),nav=document.querySelector('nav').getBoundingClientRect();return Math.abs(p.top-nav.top)<1;});
  assert.equal(await frame.locator('#theme').getAttribute('title'),'切换浅色／深色模式');
  assert.equal(await frame.locator('#sidebar-toggle').evaluate(n=>n.getBoundingClientRect().left<25),true);
  assert.equal(await frame.locator('#theme-auto').count(),0);
  if(mode==='filename'||mode==='both'){await frame.locator('#filename').click();await frame.waitForSelector('#properties-dialog[open]');await frame.locator('#properties-close').click();}
  if(mode==='filename'||mode==='branding'){
   const layout=await frame.evaluate(mode=>{const page=document.querySelector('#sidebar-toggle').getBoundingClientRect(),content=document.querySelector(mode==='filename'?'.file':'.identity').getBoundingClientRect(),nav=document.querySelector('nav').getBoundingClientRect();return {gap:content.left-page.right,end:content.right,nav:nav.left};},mode);
   assert.ok(layout.gap>=11&&layout.end<=layout.nav,JSON.stringify(layout));
  }
  await page.screenshot({path:join(folder,'default-hidden-'+mode+'.png')});
 }
 assert.equal(await frame.evaluate(()=>qaViewer.pdfDocument===qaOverflowDoc),true);
 for(let i=0;i<3;i++){
  await frame.locator('#settings').click();assert.equal(await frame.locator('#more-actions').isVisible(),true);
  await frame.locator('#settings').click();assert.equal(await frame.locator('#more-actions').isVisible(),false);
  assert.equal(await frame.locator('#settings').getAttribute('aria-expanded'),'false');
 }
 await frame.locator('#settings').focus();await frame.locator('#settings').press('Enter');assert.equal(await frame.locator('#more-actions').isVisible(),true);
 await frame.locator('#settings').focus();await frame.locator('#settings').press('Enter');assert.equal(await frame.locator('#more-actions').isVisible(),false);

 assert.deepEqual(await prefs.locator('#toolbarHidden input:checked').evaluateAll(nodes=>nodes.map(n=>n.id)),['hide-find','hide-paging','hide-fit','hide-print','hide-properties','hide-native']);
 for(const width of [1101,900,760])await checkToolbarLayout(page,frame,width,false);await page.screenshot({path:join(folder,'toolbar-compact-760.png')});await checkToolbarLayout(page,frame,360,true);await checkToolbarLayout(page,frame,900,false);
 async function menuAction(id){await frame.locator('#settings').click();await frame.locator('#more-actions [data-action='+id+']').click();}
 await frame.locator('#settings').click();assert.deepEqual(await frame.locator('#more-actions button').evaluateAll(nodes=>nodes.map(n=>n.dataset.action)),['search-toggle','previous','next','fit-width','fit-page','print','properties','native','open-settings']);assert.equal(await frame.locator('#more-actions button svg').count(),9);assert.equal(await frame.locator('[data-action=search-toggle] span').textContent(),'查找');
 async function checkMenuWidth(){const width=await frame.locator('#more-actions').evaluate(menu=>{const labels=[...menu.querySelectorAll('button span')].map(span=>{const r=document.createRange();r.selectNodeContents(span);return r.getBoundingClientRect().width;});return {actual:menu.getBoundingClientRect().width,expected:Math.max(...labels)+66};});assert.ok(Math.abs(width.actual-width.expected)<2,JSON.stringify(width));return width.actual;}
 const zhMenuWidth=await checkMenuWidth();await prefs.locator('#locale').selectOption('en-US');await frame.waitForFunction(()=>document.querySelector('[data-action=search-toggle] span').textContent==='Find');assert.equal(await frame.locator('[data-action=properties] span').textContent(),'Properties');assert.equal(await frame.locator('[data-action=native] span').textContent(),'Chrome reader');assert.equal(await frame.locator('#properties').getAttribute('title'),'Document properties');assert.equal(await frame.locator('#search-toggle').getAttribute('title'),'Find');assert.equal(await prefs.locator('#hide-find ~ span:last-child').textContent(),'Find (hidden by default)');const enMenuWidth=await checkMenuWidth();assert.notEqual(zhMenuWidth,enMenuWidth);await checkDefaultLabels(false);
 await page.screenshot({path:join(folder,'more-actions-compact.png')});await frame.locator('#viewport').click({position:{x:10,y:30}});assert.equal(await frame.locator('#more-actions').isVisible(),false);
 for(const [value,expected]of [['125',1.25],['75%',.75],['bad',.75],['900',5],['1',.25],['100',1]]){await frame.locator('#scale-input').fill(value);await frame.locator('#scale-input').press('Enter');await frame.waitForFunction(n=>Math.abs(qaViewer.currentScale-n)<.001,expected);}
 await frame.locator('#scale-input').fill('150');await frame.locator('#scale-input').press('Escape');assert.equal(await frame.locator('#scale-input').inputValue(),'100%');assert.ok((await frame.locator('#scale-input').boundingBox()).width<100);
 await menuAction('fit-width');await frame.waitForFunction(()=>qaViewer.currentScaleValue==='page-width');await menuAction('fit-page');await frame.waitForFunction(()=>qaViewer.currentScaleValue==='page-fit');await frame.locator('#scale-input').fill('100');await frame.locator('#scale-input').press('Enter');
 await menuAction('search-toggle');await frame.waitForSelector('#findbar:not([hidden])');assert.equal(await frame.locator('#query').isVisible(),true);await frame.locator('#find-close').click();await prefs.locator('#useChromeFind').uncheck();await frame.waitForFunction(()=>!qaSettings().useChromeFind);await menuAction('search-toggle');assert.equal(await frame.locator('#query').isVisible(),true);await prefs.locator('#useChromeFind').check();await frame.waitForFunction(()=>qaSettings().useChromeFind);assert.equal(await frame.locator('#query').isVisible(),true);await frame.locator('#find-close').click();await menuAction('print');await frame.waitForSelector('#print-dialog[open]');await frame.locator('#print-dialog button[value=cancel]').click();await menuAction('properties');await frame.waitForSelector('#properties-dialog[open]');await frame.locator('#properties-close').click();
 const actionKeys=['pages','find','paging','zoom','fit','rotate','fullscreen','ocr','print','properties','native'];
 for(const key of actionKeys)await prefs.locator('#hide-'+key).check();
 await prefs.waitForFunction(async keys=>{const h=(await chrome.storage.local.get('settings')).settings.toolbarHidden;return keys.every(k=>h[k]);},actionKeys);
 await frame.waitForFunction(()=>document.querySelector('#sidebar-toggle').hidden&&document.querySelector('#native').hidden);
 await checkToolbarLayout(page,frame,360,false);await checkToolbarLayout(page,frame,900,false);
 assert.equal(await frame.evaluate(()=>qaViewer.pdfDocument===qaOverflowDoc),true);await frame.locator('#settings').click();assert.equal(await frame.locator('#more-actions button').count(),15);assert.equal(await frame.locator('#more-actions button svg').count(),15);assert.equal(await frame.locator('[data-action=previous]').isDisabled(),true);await frame.locator('#more-actions').press('Escape');
 await menuAction('next');await frame.waitForFunction(()=>qaViewer.currentPageNumber===2);await menuAction('previous');await frame.waitForFunction(()=>qaViewer.currentPageNumber===1);await menuAction('zoom-in');await frame.waitForFunction(()=>Math.abs(qaViewer.currentScale-1.1)<.001);await menuAction('zoom-out');await frame.waitForFunction(()=>qaViewer.currentScale===1);await menuAction('rotate');await frame.waitForFunction(()=>qaViewer.pagesRotation===270);
 await menuAction('fullscreen');await page.waitForFunction(()=>!!document.fullscreenElement);await menuAction('fullscreen');await page.waitForFunction(()=>!document.fullscreenElement);await menuAction('sidebar-toggle');assert.equal(await frame.locator('#sidebar').isVisible(),true);await menuAction('ocr-toggle');assert.equal(await frame.locator('#ocr-panel').isVisible(),true);await frame.locator('#ocr-close').click();
 await frame.locator('#settings').focus();await frame.locator('#settings').press('ArrowDown');await frame.waitForSelector('#more-actions:popover-open');await frame.locator('#more-actions').press('End');assert.equal(await frame.evaluate(()=>document.activeElement.dataset.action),'open-settings');await frame.locator('#more-actions').press('Escape');assert.equal(await frame.evaluate(()=>document.activeElement.id),'settings');
 await page.setViewportSize({width:360,height:850});await frame.locator('#settings').click();assert.equal(await frame.locator('#more-actions').evaluate(n=>{const b=n.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}),true);await page.screenshot({path:join(folder,'more-actions-all-narrow.png')});await frame.locator('#more-actions').press('Escape');await page.setViewportSize({width:1360,height:960});
 const spacer=await context.newPage();await spacer.goto('about:blank');await page.bringToFront();
 const oldSettingsClosed=prefs.waitForEvent('close');const settingsPopup=context.waitForEvent('page');await menuAction('open-settings');const adjacent=await settingsPopup;await adjacent.waitForURL(settings);const sourceTab=await page.evaluate(()=>chrome.tabs.getCurrent()),settingsTab=await adjacent.evaluate(()=>chrome.tabs.getCurrent());assert.equal(settingsTab.index,sourceTab.index+1);assert.equal(settingsTab.windowId,sourceTab.windowId);await oldSettingsClosed;assert.equal(page.isClosed(),false);prefs=adjacent;observe(prefs);
 await menuAction('native');await page.waitForURL(base+'/overflow');report.checks.push('content-sized localized More actions, concise menu labels and factory-hidden markers; all overflow actions keep icons and behavior, numeric zoom validation, keyboard/outside dismissal, live settings, and adjacent Settings tab');
 // With no hidden actions, the same button goes straight to Settings again.
 for(const key of actionKeys)await prefs.locator('#hide-'+key).uncheck();await prefs.waitForFunction(async keys=>{const h=(await chrome.storage.local.get('settings')).settings.toolbarHidden;return keys.every(k=>h[k]===false);},actionKeys);
 frame=await open('/all-visible');assert.equal(await frame.locator('#settings').getAttribute('aria-haspopup'),null);assert.equal(await frame.locator('#scale').isVisible(),true);assert.equal(await frame.locator('#scale-input').isVisible(),false);
 await checkToolbarLayout(page,frame,1101,false);await checkToolbarLayout(page,frame,760,true);await checkToolbarLayout(page,frame,1101,false);
 for(const mode of ['filename','branding']){await chooseToolbar(prefs,mode);await frame.waitForFunction(mode=>document.documentElement.dataset.toolbar===mode,mode);await checkToolbarLayout(page,frame,1101,false);await checkToolbarLayout(page,frame,760,true);await checkToolbarLayout(page,frame,1101,false);}
 report.checks.push('content-measured single-row toolbar for each compact mode, hidden/visible groups, narrow fallback, and resize recovery without overlaps');
 const priorSettingsClosed=prefs.waitForEvent('close');const directPopup=context.waitForEvent('page');await frame.locator('#settings').click();const direct=await directPopup;await direct.waitForURL(settings);assert.equal((await direct.evaluate(()=>chrome.tabs.getCurrent())).index,(await page.evaluate(()=>chrome.tabs.getCurrent())).index+1);await priorSettingsClosed;prefs=direct;observe(prefs);await spacer.close();await prefs.reload();await prefs.waitForSelector('#toolbarHidden');assert.equal(await prefs.locator('#toolbarHidden input:checked').count(),0);
 report.checks.push('explicit all-visible settings persist and restore direct adjacent Settings navigation');
 // Direct URL/duplicate tabs and a different window keep only the newest Settings tab.
 const beforeDuplicate=prefs.waitForEvent('close'),duplicated=context.waitForEvent('page');
 const duplicateTab=await worker.evaluate(async()=>{const contexts=await chrome.runtime.getContexts({contextTypes:['TAB']});const tab=contexts.find(t=>t.documentUrl===chrome.runtime.getURL('settings/index.html'));return chrome.tabs.duplicate(tab.tabId);});
 prefs=await duplicated;observe(prefs);await beforeDuplicate;await prefs.waitForSelector('#locale');await prefs.reload();await prefs.waitForSelector('#locale');
 const beforeWindow=prefs.waitForEvent('close'),windowPage=context.waitForEvent('page');
 await worker.evaluate(()=>chrome.windows.create({url:chrome.runtime.getURL('settings/index.html')+'#appearance',focused:false}));
 prefs=await windowPage;observe(prefs);await beforeWindow;await prefs.waitForSelector('#locale');
 const singleSettings=await worker.evaluate(async()=>{const url=chrome.runtime.getURL('settings/index.html');return(await chrome.runtime.getContexts({contextTypes:['TAB']})).filter(t=>t.documentUrl?.startsWith(url)).length;});assert.equal(singleSettings,1);assert.equal(page.isClosed(),false);
 // Two rapid creations cannot let delayed cleanup close the newest tab.
 const rapidIds=await worker.evaluate(async()=>{const url=chrome.runtime.getURL('settings/index.html');const a=await chrome.tabs.create({url,active:false});const b=await chrome.tabs.create({url,active:false});return[a.id,b.id];});
 await worker.evaluate(async ids=>{for(let i=0;i<100;i++){const contexts=await chrome.runtime.getContexts({contextTypes:['TAB']}),settings=contexts.filter(t=>t.documentUrl?.includes('/settings/index.html'));if(settings.length===1&&settings[0].tabId===ids[1])return;await new Promise(r=>setTimeout(r,25));}throw Error('Settings cleanup did not converge');},rapidIds);
 prefs=context.pages().find(p=>!p.isClosed()&&p.url()===settings);assert.ok(prefs);await prefs.waitForSelector('#locale');
 report.checks.push('newest Settings replaces previous across reader/home/direct/duplicate/window entry points; rapid opens converge, reload is stable and PDF tabs survive');
 // The rare black-paper exception uses completed full pages, never dark photos inside white paper.
 await prefs.locator('#appearance').selectOption('dark');await prefs.locator('#sampling').selectOption('4');
 await prefs.waitForFunction(async()=>{const s=(await chrome.storage.local.get('settings')).settings;return s.appearance==='dark'&&s.sampling===4;});
 frame=await open('/designed-paper');
 for(let n=1;n<=6;n++){
  await frame.evaluate(n=>{qaViewer.currentPageNumber=n;},n);await frame.waitForFunction(n=>qaViewer.getPageView(n-1).renderingState===3,n);
  assert.equal(await frame.evaluate(n=>qaDarkPaper.get(n),n),n<=2?2:1,'designed paper structural evidence, page '+n);
 }
 report.checks.push('cached full-paper fill permits dense/colorful black and gray layouts; white-first, triangular and clipped fills cannot bypass conservative pixels');
 frame=await open('/black-paper');assert.equal(await frame.evaluate(()=>qaDarkPaper.get(7)),0,'distant pages are not analyzed eagerly');
 const pageFilter=async n=>frame.locator(`.page[data-page-number="${n}"] .canvasWrapper`).evaluate(n=>getComputedStyle(n).filter);
 for(let n=1;n<=7;n++){
  await frame.evaluate(n=>{qaViewer.currentPageNumber=n;},n);
  await frame.waitForFunction(n=>qaViewer.getPageView(n-1).renderingState===3&&qaViewer.getPageView(n-1).div.hasAttribute('data-dark-checked'),n);
  assert.equal(await frame.evaluate(n=>qaDarkPaper.get(n),n),[1,5,6].includes(n)?2:1,`paper verdict for page ${n}`);
  assert.equal((await pageFilter(n))==='none',[1,5,6].includes(n));
 }
 const readCount=await frame.evaluate(()=>qaPaperReads.length);
 assert.ok(readCount<=14,'white/light-gray/white-margin pages stop at preflight');
 await frame.evaluate(()=>{qaViewer.currentPageNumber=1;});await frame.waitForFunction(()=>qaViewer.getPageView(0).renderingState===3);
 await frame.locator('#sidebar-toggle').click();await frame.waitForSelector('.thumbnail[data-page="1"] canvas');
 assert.equal(await frame.locator('.thumbnail[data-page="1"] canvas').evaluate(n=>getComputedStyle(n).filter),'none');
 await page.screenshot({path:join(folder,'black-paper.png')});
 await frame.locator('#rotate').click();await frame.waitForFunction(()=>qaViewer.pagesRotation===270&&qaViewer.getPageView(0).renderingState===3);
 await frame.evaluate(()=>{qaViewer.currentScaleValue='3';});await frame.waitForFunction(()=>qaViewer.getPageView(0).detailView?.renderingState===3);
 assert.equal(await pageFilter(1),'none');assert.equal(await frame.evaluate(()=>qaPaperReads.length),readCount);
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='false');assert.equal(await pageFilter(1),'none');
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');assert.equal(await pageFilter(1),'none');assert.equal(await frame.evaluate(()=>qaPaperReads.length),readCount);
 // The default-on switch updates existing pages without reparsing or resampling cached decisions.
 await frame.evaluate(()=>window.qaPaperDocument=qaViewer.pdfDocument);
 await prefs.locator('#preserveDarkPaper').uncheck();await frame.waitForFunction(()=>document.documentElement.dataset.preserveDarkPaper==='false');
 assert.ok((await pageFilter(1)).includes('invert'));assert.ok((await frame.locator('.thumbnail[data-page="1"] canvas').evaluate(n=>getComputedStyle(n).filter)).includes('invert'));
 await prefs.locator('#preserveDarkPaper').check();await frame.waitForFunction(()=>document.documentElement.dataset.preserveDarkPaper==='true');
 assert.equal(await pageFilter(1),'none');assert.equal(await frame.evaluate(()=>qaPaperReads.length),readCount);assert.equal(await frame.evaluate(()=>qaViewer.pdfDocument===qaPaperDocument),true);
 report.paperTimingsMs=await frame.evaluate(()=>qaPaperTimings);
 await prefs.locator('#preserveDarkPaper').uncheck();await prefs.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.preserveDarkPaper===false);
 frame=await open('/black-paper');assert.equal(await frame.evaluate(()=>globalThis.qaPaperReads),undefined);assert.ok((await pageFilter(1)).includes('invert'));assert.equal(await frame.locator('.page .canvasWrapper').first().evaluate(n=>getComputedStyle(n).visibility),'visible');
 await prefs.locator('#preserveDarkPaper').check();await frame.waitForFunction(()=>qaDarkPaper.get(1)===2);assert.equal(await pageFilter(1),'none');
 await prefs.locator('#locale').selectOption('zh-CN');await prefs.waitForFunction(()=>document.documentElement.lang==='zh-CN');assert.equal(await prefs.locator('#preserveDarkPaper-title').textContent(),'保留深色纸张原色');
 await prefs.waitForFunction(()=>document.querySelector('#saved').textContent==='已保存');await prefs.locator('#preserveDarkPaper').scrollIntoViewIfNeeded();await prefs.screenshot({path:join(folder,'black-paper-settings-zh.png')});
 await prefs.locator('#locale').selectOption('en-US');await prefs.waitForFunction(()=>document.documentElement.lang==='en-US');assert.equal(await prefs.locator('#preserveDarkPaper-title').textContent(),'Preserve dark-paper colors');
 await prefs.waitForFunction(()=>document.querySelector('#saved').textContent==='Saved');await prefs.screenshot({path:join(folder,'black-paper-settings-en.png')});
 // A compressed image-only scan must qualify without invoking the OCR engine.
 const blackJpeg=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1000;c.height=1400;const g=c.getContext('2d');g.fillStyle='#040404';g.fillRect(0,0,c.width,c.height);g.fillStyle='white';g.font='22px sans-serif';g.fillText('White writing on black paper',100,200);return Array.from(new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/jpeg',.9))).arrayBuffer()));});
 blackScan=scannedPdf(Buffer.from(blackJpeg),1000,1400);
 for(const strength of ['0.85','0.9','0.96','1']){
  await prefs.locator('#darkStrength').selectOption(strength);await prefs.waitForFunction(async value=>(await chrome.storage.local.get('settings')).settings.darkStrength===Number(value),strength);
  frame=await open('/black-scan');assert.equal(await frame.evaluate(()=>qaDarkPaper.get(1)),2,'image-only black paper at strength '+strength);assert.equal(await pageFilter(1),'none');
 }
 await page.screenshot({path:join(folder,'black-paper-scan.png')});
 // A new light reader does no sampling until dark mode; failure never leaves its canvas hidden.
 await prefs.locator('#appearance').selectOption('light');await prefs.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.appearance==='light');
 frame=await open('/black-paper');assert.equal(await frame.evaluate(()=>globalThis.qaPaperReads?.length).catch(()=>undefined),undefined);
 await frame.evaluate(()=>{const original=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(){throw Error('QA blocked pixels');};window.qaRestorePixels=()=>CanvasRenderingContext2D.prototype.getImageData=original;});
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');assert.equal(await frame.evaluate(()=>qaDarkPaper.get(1)),1);assert.ok((await pageFilter(1)).includes('invert'));
 assert.equal(await frame.locator('.page .canvasWrapper').first().evaluate(n=>getComputedStyle(n).visibility),'visible');await frame.evaluate(()=>qaRestorePixels());
 report.checks.push('strict black-paper exception; white-paper starfield, white inset, ordinary white and light-gray pages rejected; dark-gray paper with white/black writing preserved; thumbnails/detail zoom/rotation/theme reuse decisions; no light-mode/disabled reads; default-on bilingual setting syncs live without reparsing; read failure retains normal inversion');
 // Link capture stays sandboxed and lazy, with no external action before a choice.
 await prefs.locator('#links').check();await prefs.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.links===true);
 frame=await open('/link-capture');await frame.waitForSelector('.pdf-links a');
 assert.equal(await frame.locator('.pdf-links a').count(),6);assert.equal(await frame.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.endsWith('/capture.js'))),false);
 await frame.evaluate(()=>document.addEventListener('copy',event=>{event.preventDefault();window.qaCopiedLink=document.activeElement.value;},true));
 const linkTests=[['mailto:', 'To: a+tag@example.com'],['tel:','+13125550123;ext=4'],['sms:','Hello <b>']];
 for(const [prefix,expected]of linkTests){
  const originalTabs=context.pages().length;
  const anchor=frame.locator(`.pdf-links a[title^="${prefix}"]`);
  if(prefix==='tel:')await anchor.click({button:'middle'});else await anchor.click();
  await frame.waitForSelector('.link-capture[open]');assert.equal(context.pages().length,originalTabs);
  assert.equal(await frame.locator('.link-capture b').count(),0);assert.equal(await frame.locator('.link-open').count(),0,'protocol capture is copy-only');
  await frame.locator('.link-primary').click();assert.ok((await frame.evaluate(()=>qaCopiedLink)).includes(expected));
  await frame.locator('.link-capture').press('Escape');await frame.waitForFunction(()=>!document.querySelector('.link-capture'));
 }
 const appLink=frame.locator('.pdf-links a[title^="ms-word:"]');
 assert.equal(await appLink.getAttribute('href'),'#');const appTabs=context.pages().length;
 await appLink.click({button:'middle'});await frame.waitForSelector('.link-capture[open]');
 assert.equal(context.pages().length,appTabs);assert.equal(await frame.locator('.link-open').textContent(),'Open application');
 assert.equal(await frame.locator('.link-open').getAttribute('href'),'ms-word:ofe|u|https://example.com/report.docx');
 // Observe the second trusted action without launching any installed application.
 await frame.locator('.link-open').evaluate(node=>node.addEventListener('click',event=>{event.preventDefault();window.qaAppConfirmed=event.isTrusted;},{once:true}));
 await frame.locator('.link-open').click();assert.equal(await frame.evaluate(()=>qaAppConfirmed),true);
 await frame.locator('.link-capture').press('Escape');await frame.waitForFunction(()=>!document.querySelector('.link-capture'));
 const web=frame.locator('.pdf-links a[title*="/link-target"]'),originalTabs=context.pages().length;await web.click({modifiers:['Meta']});await frame.waitForSelector('.link-capture[open]');assert.equal(context.pages().length,originalTabs);
 assert.equal(await frame.locator('.link-open').getAttribute('rel'),'noopener noreferrer');
 await prefs.locator('#locale').selectOption('zh-CN');await frame.waitForFunction(()=>document.querySelector('.link-heading strong').textContent==='外部链接');await page.setViewportSize({width:360,height:850});
 assert.equal(await frame.locator('.link-capture').evaluate(n=>n.getBoundingClientRect().width<=innerWidth&&n.scrollWidth<=n.clientWidth),true);await frame.locator('.link-capture').evaluate(async n=>{await Promise.all(n.getAnimations().map(a=>a.finished));});await page.screenshot({path:join(folder,'link-capture-zh-narrow.png')});
 await prefs.locator('#locale').selectOption('en-US');await frame.waitForFunction(()=>document.querySelector('.link-heading strong').textContent==='External link');
 const external=context.waitForEvent('page');await frame.locator('.link-open').click();const destination=await external;await destination.waitForURL(base+'/link-target?token=a%2Bb');assert.equal(await destination.evaluate(()=>opener===null),true);await destination.close();await page.bringToFront();await frame.locator('.link-capture').press('Escape');await frame.waitForFunction(()=>!document.querySelector('.link-capture'));
 await page.setViewportSize({width:1360,height:960});await frame.locator('#theme').click();await web.click();await frame.waitForSelector('.link-capture[open]');await frame.locator('.link-capture').evaluate(async n=>{await Promise.all(n.getAnimations().map(a=>a.finished));});await page.screenshot({path:join(folder,'link-capture-dark.png')});await page.mouse.click(4,100);await frame.waitForFunction(()=>!document.querySelector('.link-capture'));
 // External outlines use the same capture path, while destinations remain direct.
 await frame.locator('#sidebar-toggle').click();await frame.locator('#show-outline').click();await frame.waitForSelector('#outline button[data-external-link]');
 assert.equal(await frame.locator('#outline button[data-external-link]').count(),5);
 const outlineWeb=frame.locator('#outline button[data-external-link*="/link-target"]');await outlineWeb.click();await frame.waitForSelector('.link-capture[open]');assert.equal(context.pages().length,originalTabs);
 // Capture is independent, persisted, and immediately changes an open reader.
 assert.equal(await prefs.locator('#captureLinks').isChecked(),true);
 await prefs.locator('#captureLinks').uncheck();await frame.waitForFunction(()=>!qaSettings().captureLinks&&!document.querySelector('.link-capture'));
 assert.ok((await web.getAttribute('href')).startsWith(base+'/link-target'));
 for(const prefix of ['mailto:','tel:','sms:']){
  const protocol=frame.locator(`.pdf-links a[title^="${prefix}"]`);assert.equal(await protocol.getAttribute('href'),'#');await protocol.click();await frame.waitForSelector('.link-capture[open]');assert.equal(await frame.locator('.link-open').count(),0);assert.equal(await frame.locator('.link-primary').isEnabled(),true);await frame.locator('.link-capture').press('Escape');await frame.waitForFunction(()=>!document.querySelector('.link-capture'));
 }
 const directTab=context.waitForEvent('page');await web.click();const directPage=await directTab;await directPage.waitForURL(base+'/link-target?token=a%2Bb');assert.equal(await directPage.evaluate(()=>opener===null),true);await directPage.close();await page.bringToFront();
 const directOutline=context.waitForEvent('page');await outlineWeb.click();const outlinePage=await directOutline;await outlinePage.waitForURL(base+'/link-target?token=a%2Bb');assert.equal(await outlinePage.evaluate(()=>opener===null),true);await outlinePage.close();await page.bringToFront();
 await prefs.reload();await prefs.waitForSelector('#captureLinks');assert.equal(await prefs.locator('#captureLinks').isChecked(),false);
 await appLink.click();await frame.waitForSelector('.link-capture[open]');assert.equal(await frame.locator('.link-open').count(),1);await frame.locator('.link-capture').press('Escape');await frame.waitForFunction(()=>!document.querySelector('.link-capture'));
 await prefs.locator('#captureLinks').check();await frame.waitForFunction(()=>qaSettings().captureLinks);assert.equal(await web.getAttribute('href'),'#');
 await outlineWeb.focus();await outlineWeb.press('Enter');await frame.waitForSelector('.link-capture[open]');await frame.locator('.link-capture').press('Escape');await frame.waitForFunction(()=>!document.querySelector('.link-capture'));
 await frame.locator('#outline button').first().click();assert.equal(await frame.locator('.link-capture').count(),0);
 await prefs.locator('#links').uncheck();await prefs.waitForFunction(async()=>(await chrome.storage.local.get('settings')).settings.links===false);frame=await open('/link-capture');assert.equal(await frame.locator('.pdf-links a').count(),0);assert.equal(await frame.locator('.link-capture').count(),0);
 await frame.locator('#sidebar-toggle').click();await frame.locator('#show-outline').click();await frame.waitForSelector('#outline button[data-external-link]');assert.equal(await frame.locator('#outline button[data-external-link]:disabled').count(),5);assert.equal(await frame.locator('#outline button').first().isEnabled(),true);await prefs.locator('#links').check();
 report.checks.push('lazy sandboxed web-link capture and copy-only mail/tel/SMS; safe decoded copy without system clipboard writes, middle/modifier clicks, explicit noopener navigation, live/persisted separate capture toggle, outline links/internal destinations, locale/theme/narrow layout and disabled-link gating');
  async function checkRenderFeedback(frame) {
    await frame.waitForFunction(()=>document.querySelector('#progress').hidden);
    const before=await frame.evaluate(async()=>{
      const viewer=window.qaViewer||window.qaPdfViewer,number=viewer.pagesCount;
      const page=await viewer.pdfDocument.getPage(number),original=page.render;
      window.qaProgressNumber=number;window.qaRestoreRender=()=>{page.render=original;};
      page.render=function(...args){
        const task=original.apply(this,args),gate=new Promise(resolve=>{window.qaReleaseRender=resolve;});
        const promise=task.promise.then(()=>gate);
        return new Proxy(task,{get(target,key){if(key==='promise')return promise;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      };
      const y=document.querySelector('#workspace').getBoundingClientRect().top;
      viewer.currentPageNumber=number;
      return {y,hidden:document.querySelector('#progress').hidden};
    });
    assert.equal(before.hidden,true,'no immediate progress flash on navigation');
    await frame.waitForFunction(()=>typeof qaReleaseRender==='function'&&!document.querySelector('#progress').hidden);
    const waiting=await frame.evaluate(()=>{
      const viewer=window.qaViewer||window.qaPdfViewer,style=getComputedStyle(viewer.getPageView(qaProgressNumber-1).div,'::after');
      return{display:style.display,content:style.content,background:style.backgroundImage,y:document.querySelector('#workspace').getBoundingClientRect().top,
        line:document.querySelector('#progress').getBoundingClientRect().top,header:document.querySelector('header').getBoundingClientRect().bottom,status:document.querySelector('#status').textContent};
    });
    assert.equal(waiting.display,'none');assert.equal(waiting.content,'none');assert.equal(waiting.background,'none');
    assert.equal(waiting.y,before.y,'progress never moves the document');assert.ok(Math.abs(waiting.line-waiting.header)<=2,'progress sits on the toolbar divider');assert.equal(waiting.status,'');
    await frame.evaluate(()=>{qaRestoreRender();qaReleaseRender();});
    await frame.waitForFunction(()=>document.querySelector('#progress').hidden);
    await frame.evaluate(()=>{const viewer=window.qaViewer||window.qaPdfViewer;viewer.currentPageNumber=1;});
    await frame.waitForFunction(()=>document.querySelector('#progress').hidden&&(window.qaViewer||window.qaPdfViewer).getPageView(0).renderingState===3);
    // Offscreen pending state must not participate in visible-page feedback.
    assert.equal(await frame.evaluate(async()=>{
      const viewer=window.qaViewer||window.qaPdfViewer,offscreen=viewer.getPageView(qaProgressNumber-1),state=offscreen.renderingState;
      offscreen.renderingState=1;viewer.update();await new Promise(resolve=>setTimeout(resolve,260));const hidden=document.querySelector('#progress').hidden;offscreen.renderingState=state;return hidden;
    }),true);
  }
 frame=await open('/render-progress');await checkRenderFeedback(frame);report.checks.push('toolbar-divider feedback only for delayed visible rendering; no page loading icons, background feedback or layout shift');
 await go(base+'/bad');await page.waitForFunction(()=>!!document.querySelector('#message')?.textContent&&document.documentElement.dataset.view==='home'&&!document.querySelector('iframe'));await page.waitForSelector('#native');assert.ok(await page.locator('#native').isVisible());report.checks.push('invalid PDF fallback');
 await go(base+'/broken');await page.waitForFunction(()=>!!document.querySelector('#message')?.textContent&&!document.querySelector('iframe'));report.checks.push('parse failure removes shell and releases worker');
 await page.goto(reader);await page.waitForFunction(()=>document.querySelector('#intro').textContent.length>0);await page.screenshot({path:join(folder,'opening.png')});
 await prefs.locator('#enabled').uncheck();await prefs.waitForFunction(async()=>!(await chrome.storage.local.get('settings')).settings.enabled);for(let i=0;i<50;i++){if((await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length===0)break;await delay(100);}assert.equal((await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length,0);report.checks.push('automatic opening master switch');
 }
 assert.deepEqual(report.remoteRequests,[],'OCR/renderer never makes external network requests');assert.deepEqual(report.errors,[],'no application/CSP errors');report.checks.push('no remote document resources or console errors');
 console.log(JSON.stringify(report,null,2));await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));
} catch(error){console.error(JSON.stringify(report,null,2));throw error;}finally{releaseSlow();await context.close();await new Promise(r=>server.close(r));}
