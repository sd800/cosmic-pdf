// Isolated integration QA. Requires an external Playwright installation; no runtime dependency.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';
import {viewerPdf,scannedPdf} from '../test/fixtures/pdf-viewer.mjs';
const {chromium}=await import(process.env.PDF_PLAYWRIGHT?pathToFileURL(process.env.PDF_PLAYWRIGHT).href:'playwright');
const folder=await mkdtemp(join(tmpdir(),'cosmic-pdf-qa-')),ext=join(folder,'extension');await cp(resolve('extension'),ext,{recursive:true});
// Expose renderer state in the disposable QA copy only.
const viewerFile=join(ext,'workspaces/pdf-viewer/viewer.js');await writeFile(viewerFile,(await readFile(viewerFile,'utf8')).replace('links.setViewer(viewer);','window.qaViewer=viewer; links.setViewer(viewer);'));
const report={checks:[],errors:[],remoteRequests:[],screenshots:folder};let englishScan,chineseScan;
const server=createServer((req,res)=>{
 const path=req.url.split('?')[0];
 if(path==='/html.pdf'){res.setHeader('Content-Type','text/html');res.end('<h1>Not a PDF</h1>');return;}
 if(path==='/form'){res.setHeader('Content-Type','text/html');res.end('<form method="post" action="/post"><button>Submit</button></form>');return;}
 if(path==='/attachment'){res.setHeader('Content-Disposition','attachment; filename="download.pdf"');}
 res.setHeader('Content-Type',path==='/binary.pdf'?'application/octet-stream':'application/pdf');
 if(path==='/huge'){res.setHeader('Content-Length',String(90*1024*1024));res.end('%PDF-1.7');return;}
 if(path==='/bad'){res.end('not a PDF');return;}
 res.end(path==='/scan'?englishScan:path==='/chinese'?chineseScan:viewerPdf(6));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const context=await chromium.launchPersistentContext(join(folder,'profile'),{executablePath:process.env.PDF_CHROME,headless:true,viewport:{width:1360,height:960},deviceScaleFactor:2,args:['--force-device-scale-factor=2',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
function observe(page){page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))report.remoteRequests.push(r.url());});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
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
  await page.bringToFront();await go(base+path);await page.waitForURL(url=>url.href.startsWith(reader+'?source='));const element=await page.waitForSelector('iframe');const frame=await element.contentFrame();await frame.waitForFunction(()=>document.querySelector('.page canvas')?.width>0&&document.querySelector('#count').textContent!=='/ —');await frame.waitForFunction(()=>window.qaViewer?.getPageView(0)?.renderingState===3);return frame;
 }
 let frame=await open();assert.equal(page.url(),reader+'?source='+base+'/document?token=a%2Bb&sig=x%3D#page=2');report.checks.push('MIME takeover and signed URL preservation');
 assert.equal(await frame.locator('#page').inputValue(),'1');assert.equal(await frame.locator('#scale').inputValue(),'1');assert.equal(await frame.locator('#viewport').evaluate(n=>n.scrollTop),0);
 assert.equal(await frame.evaluate(()=>typeof chrome==='undefined'||!chrome.runtime),true);assert.equal(await frame.evaluate(()=>globalThis.PDF_ATTACK),undefined);
 await frame.locator('#zoom-in').click();await frame.locator('#zoom-in').click();await frame.waitForFunction(()=>Math.abs(window.qaViewer.currentScale-1.2)<.001);report.checks.push('100% initial scale, 10-point zoom and sandbox isolation');
 await frame.locator('#theme').click();await frame.waitForFunction(()=>document.documentElement.dataset.dark==='true');assert.ok((await frame.locator('.canvasWrapper').first().evaluate(n=>getComputedStyle(n).filter)).includes('invert(0.96)'));
 await page.screenshot({path:join(folder,'reader-dark.png')});report.checks.push('dark appearance and paper boundary');
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
 const measureReadability=()=>{
  const font=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
  const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const lum=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  const body=getComputedStyle(document.body),desc=getComputedStyle(document.querySelector('.row p'));const a=lum(rgb(body.backgroundColor)),b=lum(rgb(desc.color));
  return {label:font('.row h3'),description:font('.row p'),language:font('.language-options label'),contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
 };const readability=await prefs.evaluate(measureReadability);assert.ok(readability.label>=15&&readability.description>=14&&readability.language>=15);assert.ok(readability.contrast>=4.5);report.checks.push('readable type sizes and secondary-text contrast in both themes');
 await prefs.locator('#appearance').selectOption('light');await prefs.waitForFunction(()=>document.documentElement.dataset.dark==='false');assert.ok((await prefs.evaluate(measureReadability)).contrast>=4.5);await prefs.screenshot({path:join(folder,'settings-light.png'),fullPage:true});await prefs.setViewportSize({width:360,height:850});assert.equal(await prefs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await prefs.screenshot({path:join(folder,'settings-narrow.png'),fullPage:true});await prefs.locator('#locale').selectOption('zh-CN');await prefs.waitForFunction(()=>document.documentElement.lang==='zh-CN');assert.equal(await prefs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await prefs.screenshot({path:join(folder,'settings-zh-narrow.png'),fullPage:true});await page.bringToFront();await page.setViewportSize({width:560,height:850});await page.screenshot({path:join(folder,'reader-narrow.png')});report.checks.push('English settings and narrow layout');
 const local=join(folder,'local.pdf');await writeFile(local,viewerPdf(2));await page.locator('#file').setInputFiles(local);await page.waitForURL(reader);const lf=await(await page.waitForSelector('iframe')).contentFrame();await lf.waitForSelector('.page canvas');const popup=context.waitForEvent('page');await lf.locator('#native').click();const nativeLocal=await popup;await nativeLocal.waitForLoadState();assert.ok(nativeLocal.url().startsWith('blob:chrome-extension://'));await nativeLocal.close();report.checks.push('local file picker and native blob fallback');
 await go(base+'/bad');await page.waitForFunction(()=>!!document.querySelector('#message')?.textContent&&document.querySelector('#loading')?.hidden===true);await page.waitForSelector('#native');assert.ok(await page.locator('#native').isVisible());report.checks.push('invalid PDF fallback');
 await page.goto(reader);await page.waitForFunction(()=>document.querySelector('#intro').textContent.length>0);await page.screenshot({path:join(folder,'opening.png')});
 await prefs.locator('#enabled').uncheck();await prefs.waitForFunction(async()=>!(await chrome.storage.local.get('settings')).settings.enabled);for(let i=0;i<50;i++){if((await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length===0)break;await delay(100);}assert.equal((await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length,0);report.checks.push('automatic opening master switch');
 assert.deepEqual(report.remoteRequests,[],'OCR/renderer never makes external network requests');assert.deepEqual(report.errors,[],'no application/CSP errors');report.checks.push('no remote document resources or console errors');
 console.log(JSON.stringify(report,null,2));await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2));
} catch(error){console.error(JSON.stringify(report,null,2));throw error;}finally{await context.close();await new Promise(r=>server.close(r));}
