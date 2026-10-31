// Isolated navigation regression. Uses authored local files and the real extension.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { viewerPdf } from '../test/fixtures/pdf-viewer.mjs';
const {chromium}=await import(process.env.PDF_PLAYWRIGHT?pathToFileURL(process.env.PDF_PLAYWRIGHT).href:'playwright');
const pdf=viewerPdf(2),checks=[],errors=[],held=new Set(),fetches=new Map();
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture.test');
 if(req.headers['sec-fetch-dest']==='empty')fetches.set(url.pathname,(fetches.get(url.pathname)||0)+1);
 if(url.pathname==='/links'){
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Navigation fixture</title><p>Plain PDF URL</p><a href="/document.pdf?signature=a%2Bb&k=1#page=2">PDF link</a><a href="/document.pdf?signature=a%2Bb&k=1#page=2" target="_blank" rel="noopener noreferrer">New tab</a>');return;
 }
 if(url.pathname==='/embedded'){
  const source=url.searchParams.has('slow')?'/slow.pdf':'/document.pdf?signature=a%2Bb&k=1#page=2',kind=url.searchParams.get('kind');
  const element=kind==='object'?`<object type="application/pdf" data="${source}"></object>`:kind==='embed'?`<embed type="application/pdf" src="${source}">`:`<iframe src="${source}"></iframe>`;
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Containing page</title><style>iframe,embed,object{width:100%;height:700px}</style><h1>Containing page</h1>'+element);return;
 }
 if(url.pathname==='/html.pdf'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><h1>Ordinary HTML</h1>');return;}
 if(url.pathname==='/redirect'){res.writeHead(302,{Location:'/document.pdf?signature=a%2Bb&k=1#page=2'});res.end();return;}
 if(url.pathname==='/attachment')res.setHeader('Content-Disposition','Attachment; filename="original.pdf"');
 res.setHeader('Content-Type',url.pathname==='/binary.PDF'?'application/octet-stream':url.pathname==='/mime.pdf'?'Application/PDF':'application/pdf');
 if(url.pathname==='/slow.pdf'&&req.headers['sec-fetch-dest']==='empty'){res.flushHeaders();held.add(res);res.on('close',()=>held.delete(res));return;}
 res.end(pdf);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,folder=await mkdtemp(join(tmpdir(),'cosmic-pdf-navigation-')),profile=join(folder,'profile'),ext=resolve('extension');
let context;
async function poll(check){for(let n=0;n<150;n++){if(await check())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out waiting for navigation rules');}
async function launch(){
 context=await chromium.launchPersistentContext(profile,{executablePath:process.env.PDF_CHROME,headless:true,viewport:{width:1100,height:800},args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 await poll(async()=>await worker.evaluate(async()=>(await chrome.declarativeNetRequest.getSessionRules()).filter(r=>r.id<1000).length===3));
 const urls=await worker.evaluate(()=>({canonical:chrome.runtime.getURL('')+'workspaces/pdf-reader/index.html',public:chrome.runtime.getURL('workspaces/pdf-reader/entry.html'),settings:chrome.runtime.getURL('settings/index.html')}));
 assert.notEqual(urls.public,urls.canonical,'public entry uses a session GUID');
 for(const p of context.pages())watch(p);context.on('page',watch);
 return{worker,urls};
}
function watch(page){page.on('pageerror',e=>errors.push(e.message));}
async function navigate(page,url,transitionType='link'){
 const cdp=await context.newCDPSession(page);
 try{const result=await cdp.send('Page.navigate',{url,transitionType});if(result.errorText&&!/ERR_ABORTED/.test(result.errorText))throw Error(result.errorText);}
 finally{await cdp.detach();}
}
async function rendered(page,canonical,source){
 await page.waitForURL(canonical+'?source='+source);
 const host=page.mainFrame(),frame=await(await host.waitForSelector('.pdf-viewer-frame')).contentFrame();
 await frame.waitForFunction(()=>document.querySelector('#count')?.textContent==='2'&&document.querySelector('.page canvas')?.width>0);
 assert.equal((await host.evaluate(()=>chrome.runtime.sendMessage({type:'AI_STATUS'}))).ok,true);
 return frame;
}
function releaseHeld(){for(const response of held)response.end(pdf);held.clear();}
try{
 let {worker,urls}=await launch();
 await worker.evaluate(async()=>{await chrome.storage.local.set({settings:{enabled:true,sampling:1,aiEnabled:false,toolbarHidden:{native:false}}});});
 const source=base+'/document.pdf?signature=a%2Bb&k=1#page=2';
 let page=context.pages()[0]||await context.newPage();
 // Go to… uses a link transition with no referring origin. Do not substitute
 // a renderer click or typed navigation for this regression.
 await navigate(page,source);let frame=await rendered(page,urls.canonical,source);
 assert.equal(await frame.locator('#page').inputValue(),'2');
 checks.push('browser Go to-style link navigation with no referring origin; signed query and initial page retained');
 await page.reload();await rendered(page,urls.canonical,source);
 await page.goto(base+'/links');await page.locator('a').first().click();await rendered(page,urls.canonical,source);
 for(let i=0;i<2;i++){
  await page.goBack();await page.waitForSelector('a');await page.goForward();frame=await rendered(page,urls.canonical,source);
 }
 checks.push('repeated website/reader Back and Forward use stable history entries');
 const before=fetches.get('/document.pdf');
 await page.evaluate(()=>{window.qaOriginalFrame=document.querySelector('iframe');location.hash='page=1';});
 await frame.waitForFunction(()=>document.querySelector('#page').value==='1');
 await page.goBack();await frame.waitForFunction(()=>document.querySelector('#page').value==='2');
 await page.goForward();await frame.waitForFunction(()=>document.querySelector('#page').value==='1');
 await page.evaluate(()=>{location.hash='page=invalid';});
 assert.equal(await frame.locator('#page').inputValue(),'1');
 await page.evaluate(()=>{location.hash='page=99999999';});await frame.waitForFunction(()=>document.querySelector('#page').value==='2');
 await page.evaluate(()=>{location.hash='';});await frame.waitForFunction(()=>document.querySelector('#page').value==='1');
 assert.equal(await page.evaluate(()=>qaOriginalFrame===document.querySelector('iframe')),true);
 assert.equal(fetches.get('/document.pdf'),before,'fragment changes neither refetch nor replace the reader');
 checks.push('live page fragments, bounds, clearing, and hash-history preserve the existing renderer and document bytes');
 await page.goto(base+'/links');
 const newTab=context.waitForEvent('page');await page.locator('a').nth(1).click();const opened=await newTab;await rendered(opened,urls.canonical,source);
 const ownerId=await opened.evaluate(async()=>(await chrome.tabs.getCurrent()).id);
 const duplicated=context.waitForEvent('page');await worker.evaluate(id=>chrome.tabs.duplicate(id),ownerId);const duplicate=await duplicated;await rendered(duplicate,urls.canonical,source);await duplicate.close();await opened.close();
 checks.push('noopener/noreferrer new-tab links and duplicate readers');
 await page.goto(base+'/redirect').catch(e=>{if(!e.message.includes('ERR_ABORTED'))throw e;});await rendered(page,urls.canonical,source);
 checks.push('reload, normal website link, and server redirect');
 for(const kind of ['iframe','embed','object']){
  await page.goto(base+'/embedded?kind='+kind);
  await poll(async()=>page.frames().some(f=>f.url()===urls.canonical+'?source='+source));
  const host=page.frames().find(f=>f.url()===urls.canonical+'?source='+source);
  const sandbox=await(await host.waitForSelector('.pdf-viewer-frame')).contentFrame();
  await sandbox.waitForFunction(()=>document.querySelector('#count')?.textContent==='2');
  assert.equal((await host.evaluate(()=>chrome.runtime.sendMessage({type:'AI_STATUS'}))).ok,true);
  assert.equal(page.url(),base+'/embedded?kind='+kind);
  await sandbox.locator('#native').click();
  await poll(async()=>!page.frames().some(f=>f.url()===urls.canonical+'?source='+source));
  assert.equal(page.url(),base+'/embedded?kind='+kind);
 }
 checks.push('iframe, embed, and object takeover with authenticated hosts and same-frame native return');
 await navigate(page,source,'typed');frame=await rendered(page,urls.canonical,source);
 await frame.locator('#native').click();await page.waitForURL(source);await page.reload();assert.equal(page.url(),source);
 await page.goto(base+'/html.pdf');await page.waitForSelector('h1');assert.equal(page.url(),base+'/html.pdf');
 await poll(async()=>await worker.evaluate(async()=>(await chrome.declarativeNetRequest.getSessionRules()).filter(r=>r.id>=1000).length===0));
 const downloaded=page.waitForEvent('download');await page.goto(base+'/attachment').catch(e=>{if(!/download|ERR_ABORTED/i.test(e.message))throw e;});await(await downloaded).delete();
 checks.push('typed navigation, top-level native return/reload, HTML exception, and attachment download');
 for(const path of ['/mime.pdf','/binary.PDF']){await navigate(page,base+path);await rendered(page,urls.canonical,base+path);}
 await navigate(page,base+'/slow.pdf#page=1');await page.waitForURL(urls.canonical+'?source='+base+'/slow.pdf#page=1');
 await poll(()=>held.size>0);
 await page.evaluate(()=>{location.hash='page=2';});
 assert.ok((await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).some(r=>r.id>=2_000_000));
 releaseHeld();frame=await rendered(page,urls.canonical,base+'/slow.pdf#page=2');await frame.waitForFunction(()=>document.querySelector('#page').value==='2');
 await page.goto(base+'/embedded?slow=1');await poll(()=>held.size>0);
 await page.evaluate(()=>document.querySelector('iframe').remove());
 await poll(async()=>(await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).every(r=>r.id<2_000_000));
 releaseHeld();checks.push('MIME case, uppercase binary PDF suffix, page changes during download, and cleanup of removed embedded readers');
 const file=join(folder,'local.pdf');await writeFile(file,pdf);
 await page.goto(urls.canonical);await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>document.documentElement.dataset.view==='reader');
 assert.equal(page.url(),urls.canonical,'local file history uses canonical extension origin');
 frame=await(await page.waitForSelector('.pdf-viewer-frame')).contentFrame();await frame.waitForFunction(()=>document.querySelector('#count')?.textContent==='2');
 const fileURL=pathToFileURL(file).href;
 assert.equal(await worker.evaluate(()=>chrome.extension.isAllowedFileSchemeAccess()),true);
 await navigate(page,fileURL,'typed');await rendered(page,urls.canonical,fileURL);
 checks.push('file picker and permitted file-URL takeover');
 await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,enabled:false}});});
 await poll(async()=>await worker.evaluate(async()=>(await chrome.declarativeNetRequest.getSessionRules()).filter(r=>r.id<1000).length===0));
 await navigate(page,source,'typed');await page.waitForURL(source);
 await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,enabled:true}});});
 await poll(async()=>await worker.evaluate(async()=>(await chrome.declarativeNetRequest.getSessionRules()).filter(r=>r.id<1000).length===3));
 assert.deepEqual(await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules()),[]);
 const priorEntry=urls.public;
 // Emulate the previous release's persistent rule location before restart.
 await worker.evaluate(async()=>{const rules=(await chrome.declarativeNetRequest.getSessionRules()).filter(r=>r.id<1000);await chrome.declarativeNetRequest.updateDynamicRules({addRules:rules});});
 // Do not restore PDF tabs during startup; their normal reload is covered above.
 await page.goto(urls.settings);await context.close();context=null;
 ({worker,urls}=await launch());
 assert.notEqual(urls.public,priorEntry,'restart replaces the public session ID');
 const rules=await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules());
 assert.equal(rules.find(r=>r.id===2).action.redirect.regexSubstitution,urls.public+'?source=\\0');
 assert.deepEqual(await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules()),[]);
 page=context.pages()[0]||await context.newPage();await navigate(page,source);await rendered(page,urls.canonical,source);
 checks.push('disable/re-enable, browser restart, current-session redirects, and legacy persistent-rule migration');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,checks},null,2));
 const evidence=resolve('test-dist/takeover-context-menu');await mkdir(evidence,{recursive:true});
 await writeFile(join(evidence,'README.md'),'# PDF navigation regression\n\nRun `PDF_PLAYWRIGHT=/path/to/playwright/index.mjs PDF_CHROME=/path/to/chrome node scripts/test-takeover-browser.mjs`. Uses an isolated profile, local authored two-page PDFs, and no private documents. The profile is removed on completion.\n\n`probe.mjs` is the headed native context-menu reproduction. Select the complete plain URL, right-click, and choose Go to. Its interactive commands are `menu`, `status`, and `quit`; it does not retain browser logs.\n\nVerified: native Go to opens the reader at page 2 with signed query parameters intact. Automated coverage also checks repeated website/PDF history traversal, live and delayed page fragments without refetching, new-tab/duplicate opening, MIME variants, removed embedded-reader cleanup, normal links, redirects, embedding, native fallback, local opening, disable/re-enable, restart, and legacy rule migration.\n');
}finally{releaseHeld();if(context)await context.close();await new Promise(r=>server.close(r));await rm(folder,{recursive:true,force:true});}
