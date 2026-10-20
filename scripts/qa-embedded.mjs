// Focused synthetic checks; only the disposable profile is controlled.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { scannedPdf, viewerPdf } from '../test/fixtures/pdf-viewer.mjs';

export function embeddedResponse(req,res,scan){
  const url=new URL(req.url,'http://fixture.test');
  if(url.pathname==='/embed-page'){
    const kind=url.searchParams.get('kind')||'iframe',src='/embed-document?token=a%2Bb&k=1#page=1';
    const element=kind==='embed'?`<embed type="application/pdf" src="${src}">`:kind==='object'?`<object type="application/pdf" data="${src}"></object>`:`<iframe src="${src}" allow="fullscreen; clipboard-write"></iframe>`;
    res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Containing website</title><style>body{margin:0}iframe,embed,object{display:block;width:100%;height:800px;border:0}</style><h1>Website stays here</h1>${element}`);return true;
  }
  if(url.pathname==='/embed-html.pdf'){res.setHeader('Content-Type','text/html');res.end('<h1>HTML response</h1>');return true;}
  if(['/embed-document','/auto-scan'].includes(url.pathname)){
    res.setHeader('Content-Type','application/pdf');res.end(url.pathname==='/auto-scan'?scan:viewerPdf(2));return true;
  }
  return false;
}

export async function runEmbeddedQa({context,worker,page,reader,settings,base,folder,report,setScan,open}){
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  await worker.evaluate(async()=>{
    const {settings={}}=await chrome.storage.local.get('settings');
    await chrome.storage.local.set({settings:{...settings,aiEnabled:false,automaticOcr:false,sampling:1,ocrLanguages:['eng'],toolbarHidden:{native:false,ocr:false},locale:'en-US'}});
  });
  async function embedded(kind){
    await page.goto(base+'/embed-page?kind='+kind);
    await page.waitForFunction(()=>document.title==='Containing website');
    let host;
    for(let n=0;n<50;n++){host=page.frames().find(f=>f.url().startsWith(reader+'?source='));if(host)break;await wait(50);}
    assert.ok(host,kind+' is taken over');
    const sandbox=await(await host.waitForSelector('.pdf-viewer-frame')).contentFrame();
    await sandbox.waitForFunction(()=>document.querySelector('#count').textContent==='2'&&document.querySelector('.page canvas')?.width>0);
    assert.equal(host.url().slice((reader+'?source=').length),base+'/embed-document?token=a%2Bb&k=1#page=1');
    assert.equal(await sandbox.evaluate(()=>typeof chrome?.runtime),'undefined');
    assert.equal((await host.evaluate(()=>chrome.runtime.sendMessage({type:'AI_STATUS'}))).ok,true,'embedded host retains its authorized AI bridge');
    return {host,sandbox};
  }
  for(const kind of ['iframe','embed','object']){
    const {sandbox}=await embedded(kind);
    const before=page.url();await sandbox.locator('#native').click();
    await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Website stays here');
    for(let n=0;n<50&&page.frames().some(f=>f.url().startsWith(reader+'?source='));n++)await wait(50);
    assert.equal(page.frames().some(f=>f.url().startsWith(reader+'?source=')),false,kind+' switches only its own frame to Chrome');
    assert.equal(page.url(),before);
    const native=await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules());
    assert.ok(native.some(rule=>JSON.stringify(rule.condition.resourceTypes)===JSON.stringify(['sub_frame','object'])));
  }
  report.checks.push('iframe/embed/object PDF takeover, signed URLs and same-frame Chrome fallback; parent website unchanged');

  // A direct external parent cannot initialize the now web-accessible sandbox.
  await page.goto(base+'/links');
  const sandboxUrl=reader.replace('pdf-reader/index.html','pdf-viewer/viewer.html');
  await page.evaluate(url=>{const frame=document.createElement('iframe');frame.id='foreign-sandbox';frame.src=url;document.body.append(frame);},sandboxUrl);
  const foreign=await(await page.waitForSelector('#foreign-sandbox')).contentFrame();
  await foreign.waitForLoadState();
  await page.evaluate(()=>{const channel=new MessageChannel();document.getElementById('foreign-sandbox').contentWindow.postMessage({type:'CP_PDF_INIT',locale:'zh-CN',settings:{}},'*',[channel.port2]);});
  await wait(200);assert.equal(await foreign.evaluate(()=>document.documentElement.lang),'en-US');
  assert.equal(await foreign.evaluate(()=>globalThis.qaWorkerReady),undefined);
  report.checks.push('foreign webpage cannot initialize the opaque rendering sandbox');

  // Preserve the existing HTML and attachment/POST boundaries through MIME gating.
  await page.goto(base+'/embed-html.pdf');assert.equal(page.url(),base+'/embed-html.pdf');
  const remote=await open('/embed-document');await remote.locator('#native').click();
  await page.waitForURL(base+'/embed-document');await page.reload();assert.equal(page.url(),base+'/embed-document');
  report.checks.push('top-level native return/reload and non-PDF HTML exceptions preserved');

  const local=folder+'/downloaded-document.PDF';await writeFile(local,viewerPdf(2));
  const fileAccess=await worker.evaluate(()=>chrome.extension.isAllowedFileSchemeAccess());
  assert.equal(fileAccess,true,'isolated unpacked extension has file access for this test');
  const localUrl=pathToFileURL(local).href;
  await page.goto(localUrl).catch(error=>{if(!error.message.includes('ERR_ABORTED'))throw error;});
  await page.waitForURL(url=>url.href.startsWith(reader+'?source=file:'));
  const localSandbox=await(await page.waitForSelector('.pdf-viewer-frame')).contentFrame();
  await localSandbox.waitForFunction(()=>document.querySelector('#count').textContent==='2');
  await localSandbox.locator('#native').click();await page.waitForURL(localUrl);await page.reload();assert.equal(page.url(),localUrl);
  report.checks.push('local/downloaded .PDF file URL takeover with Chrome file access, and native fallback');

  // Reuse a local generated image-only PDF; the engine and all OCR models stay local.
  await page.goto(settings);
  const jpeg=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1200;
    const g=canvas.getContext('2d');g.fillStyle='white';g.fillRect(0,0,900,1200);g.fillStyle='black';g.font='56px sans-serif';
    g.fillText('COSMIC LOCAL OCR',65,180);g.fillText('CURRENT PAGE 12345',65,300);
    return Array.from(new Uint8Array(await(await new Promise(r=>canvas.toBlob(r,'image/jpeg',.97))).arrayBuffer()));
  });
  const scan=scannedPdf(Buffer.from(jpeg),900,1200,3);setScan(scan);await writeFile(folder+'/current-page-scan.pdf',scan);
  const frame=await open('/auto-scan');await wait(700);
  assert.equal(await frame.evaluate(()=>globalThis.qaOcrStarts||0),0,'AI off and independent opt-in off does not recognize');
  const settingsTab=await context.newPage();await settingsTab.goto(settings);
  assert.equal(await settingsTab.locator('#automaticOcr').isChecked(),false);
  await settingsTab.locator('#automaticOcr').locator('..').screenshot({path:folder+'/automatic-ocr-en.png'});
  await frame.evaluate(()=>{window.qaOriginalPdf=window.qaViewer.pdfDocument;});
  await settingsTab.locator('#automaticOcr').check();await page.bringToFront();
  await frame.waitForFunction(()=>document.querySelector('[data-page-number="1"] .ocr-text-layer')?.textContent.includes('COSMIC'),{},{timeout:30000});
  await frame.waitForFunction(()=>document.getElementById('ocr-start').disabled===false);
  assert.equal(await frame.evaluate(()=>window.qaSettings().aiEnabled),false);
  assert.equal(await frame.evaluate(()=>window.qaViewer.pdfDocument===window.qaOriginalPdf),true,'OCR preference does not reparse the PDF');
  assert.equal(await frame.locator('.ocr-text-layer').count(),1,'only current page is recognized');
  assert.equal(await frame.evaluate(()=>globalThis.qaOcrStarts),1);
  await settingsTab.locator('#automaticOcr').uncheck();await page.bringToFront();
  await frame.waitForFunction(()=>window.qaSettings().automaticOcr===false);
  await frame.evaluate(()=>{window.qaViewer.currentPageNumber=2;});await wait(800);
  assert.equal(await frame.evaluate(()=>globalThis.qaOcrStarts),1,'off prevents subsequent automatic pages');
  await frame.locator('#ocr-toggle').click();
  await frame.waitForFunction(()=>document.querySelector('[data-page-number="2"] .ocr-text-layer')?.textContent.includes('COSMIC'),{},{timeout:30000});
  await frame.waitForFunction(()=>document.getElementById('ocr-start').disabled===false);
  await frame.evaluate(()=>{globalThis.qaOcrDelay=1500;window.qaViewer.currentPageNumber=3;});
  await settingsTab.locator('#automaticOcr').check();await page.bringToFront();
  await frame.waitForFunction(()=>globalThis.qaOcrStarts===3);
  await settingsTab.locator('#automaticOcr').uncheck();await page.bringToFront();
  await frame.waitForFunction(()=>document.getElementById('ocr-start').disabled===false);
  assert.equal(await frame.locator('[data-page-number="3"] .ocr-text-layer').count(),0);
  await settingsTab.bringToFront();await settingsTab.locator('#locale').selectOption('zh-CN');
  await settingsTab.waitForFunction(()=>document.getElementById('automaticOcr-title').textContent==='自动文字识别');
  assert.equal(await settingsTab.locator('#automaticOcr').isChecked(),false);
  await settingsTab.locator('#automaticOcr').locator('..').screenshot({path:folder+'/automatic-ocr-zh.png'});
  report.checks.push('independent OCR works with AI off, recognizes only current page, updates live without reparse, cancels in-flight automatic work and preserves manual OCR; bilingual Settings');
  await settingsTab.close();
}
