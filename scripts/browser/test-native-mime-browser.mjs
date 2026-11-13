import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {cp,mkdtemp,mkdir,realpath,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {viewerPdf} from '../../test/fixtures/pdf-viewer.mjs';
const {chromium}=await import(pathToFileURL(process.env.PDF_PLAYWRIGHT).href);
const bytes=viewerPdf(3),counts=new Map(),folder=resolve('test-dist/mime-handler');await mkdir(folder,{recursive:true});
const fixture=join(folder,'sample.pdf');if(!await readFile(fixture).then(b=>b.equals(Buffer.from(bytes))).catch(()=>false))await writeFile(fixture,bytes);
const server=createServer((req,res)=>{
 if(req.url==='/embed'){res.setHeader('Content-Type','text/html');res.end('<iframe width="950" height="700" src="/embedded.pdf"></iframe>');return;}
 if(req.url==='/form'){res.setHeader('Content-Type','text/html');res.end('<form method="post" action="/post.pdf"><button>Open PDF</button></form>');return;}
 if(!req.url.includes('.pdf')){res.writeHead(204);res.end();return;}
 counts.set(req.url,(counts.get(req.url)||0)+1);
 if(['/once.pdf','/native-reload.pdf'].includes(req.url)&&counts.get(req.url)>1){res.writeHead(403);res.end();return;}
 if(req.url==='/post.pdf'&&req.method!=='POST'){res.writeHead(405);res.end();return;}
 res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="Native stream.pdf"');res.end(bytes);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,profile=await mkdtemp(join(tmpdir(),'cpdf-native-'));let context;
async function frame(page,path){for(let i=0;i<100;i++){const f=page.frames().find(f=>f.url().includes(path));if(f)return f;await page.waitForTimeout(75);}throw Error('Missing '+path+' in '+page.frames().map(f=>f.url()).join(', '));}
async function renderedViewer(page){const view=await frame(page,'/pdf-viewer/viewer.html');await view.waitForFunction(()=>document.querySelector('#count')?.textContent==='3'&&document.querySelector('.page canvas')?.width>0);return view;}
async function reader(page){return {host:await frame(page,'/pdf-reader/mime.html'),view:await renderedViewer(page)};}
function launch(ext=resolve('extension'), userDataDir=profile){
 return chromium.launchPersistentContext(userDataDir,{headless:true,viewport:{width:1200,height:900},executablePath:process.env.PDF_CHROME,
  args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
}
async function checkColdOpen(file, url){
 const ext=resolve('extension'), portFile=join(profile,'DevToolsActivePort');
 await rm(portFile,{force:true});
 const chromeProcess=spawn(process.env.PDF_CHROME,['--headless=new','--no-first-run','--disable-background-networking',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,file],{stdio:'ignore'});
 const exited=new Promise(resolve=>{chromeProcess.once('exit',resolve);chromeProcess.once('error',resolve);});
 let browser;
 try{
  let port;
  for(let attempt=0;attempt<80&&!port&&chromeProcess.exitCode===null;attempt++){
   port=await readFile(portFile,'utf8').then(text=>Number(text.split('\n')[0])).catch(()=>null);
   if(!port)await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(port,'cold-start Chrome exposes its temporary DevTools endpoint');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{noDefaults:true});
  const context=browser.contexts()[0];
  for(let attempt=0;attempt<80;attempt++){
   const opened=context.pages().find(page=>page.url()===url);
   if(opened){await renderedViewer(opened);return;}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.fail('Chrome did not open the startup file. Tabs: '+context.pages().map(page=>page.url()).join(', '));
 }finally{
  await browser?.close();
  if(chromeProcess.exitCode===null)chromeProcess.kill('SIGTERM');
  await exited;
 }
}
try{
 context=await launch();
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');assert.equal(await worker.evaluate(()=>typeof chrome.mimeHandler),'object');
 await context.route('https://pdf-blob.test/**',route=>route.fulfill({contentType:'text/html',body:
  route.request().url().endsWith('/sandbox')
   ? '<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" src="/source"></iframe>'
   : '<a id="open" target="_blank">Open PDF</a>'}));
 for(const opaque of [false,true]){
  const creator=await context.newPage();
  await creator.goto('https://pdf-blob.test/'+(opaque?'sandbox':'source'));
  const source=opaque?await frame(creator,'pdf-blob.test/source'):creator;
  const address=await source.locator('#open').evaluate((link,bytes)=>{
   link.href=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}))+'#page=2';
   return link.href;
  },[...bytes]);
  assert.ok(address.startsWith(opaque?'blob:null/':'blob:https://pdf-blob.test/'));
  const opened=context.waitForEvent('page');await source.locator('#open').click();const tab=await opened;
  const blobReader=await reader(tab);
  assert.equal(tab.url(),address);
  assert.equal(await blobReader.view.locator('#page').inputValue(),'2');
  await source.evaluate(url=>URL.revokeObjectURL(url.split('#')[0]),address);
  const download=tab.waitForEvent('download');
  await blobReader.view.locator('#download').click();
  assert.deepEqual(await readFile(await (await download).path()),Buffer.from(bytes));
  await blobReader.view.locator('#settings').click();
  await blobReader.view.locator('#more-actions [data-action="native"]').click();
  await frame(tab,'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/');
  assert.equal(tab.url(),address,'the in-memory native handoff retains the original Blob address');
  assert.match(await blobReader.host.locator('#reader iframe').getAttribute('src'),/#cosmic-pdf-native&page=2$/);
  await tab.close();await creator.close();
 }
 const p=await context.newPage();await p.goto(base+'/once.pdf#page=2',{waitUntil:'domcontentloaded'});let result=await reader(p);
 assert.equal(p.url(),base+'/once.pdf#page=2');assert.equal(counts.get('/once.pdf'),1);assert.equal(await result.view.locator('#page').inputValue(),'2');
 assert.equal((await result.host.evaluate(()=>chrome.runtime.sendMessage({type:'AI_STATUS'}))).ok,true,'native MIME child retains authenticated AI access');
 await worker.evaluate(async url=>{const [tab]=await chrome.tabs.query({url:url.split('#')[0]+'*'});await chrome.tabs.update(tab.id,{url:url.split('#')[0]+'#page=3'});},p.url());
 await result.view.waitForFunction(()=>document.querySelector('#page').value==='3');assert.equal(counts.get('/once.pdf'),1);
 async function overlayFilter(create = false) {
  return worker.evaluate(async ({url,create})=>{
   const [tab]=await chrome.tabs.query({url:url.split('#')[0]+'*'});
   const [frame]=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},args:[create],func:create=>{
    const root=chrome.dom.openOrClosedShadowRoot(document.body);
    if(create){
     const overlay=document.createElement('div');overlay.className='darkreader--pdf-overlay';
     Object.assign(overlay.style,{position:'fixed',inset:'56px 0 0',pointerEvents:'none',backdropFilter:'invert(1) contrast(.9)'});
     root.append(overlay);
    }
    return getComputedStyle(root.querySelector('.darkreader--pdf-overlay')).backdropFilter;
   }});
   return frame.result;
  },{url:p.url(),create});
 }
 assert.equal(await overlayFilter(true),'none','the browser PDF overlay cannot recolor the Cosmic reader');
 await p.screenshot({path:join(folder,'native-reader.png')});
 const printOpened=context.waitForEvent('page');
 await result.view.locator('#print').evaluate(button=>button.click());
 const printed=await printOpened;await printed.waitForLoadState('domcontentloaded');await frame(printed,'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/');
 assert.ok(printed.url().startsWith('blob:chrome-extension://'));assert.equal(printed.frames().some(f=>f.url().includes('/pdf-viewer/viewer.html')),false,'system printing uses Chrome rather than the Cosmic renderer');await printed.close();
 await result.host.locator('#native').evaluate(button=>button.click());
 await p.waitForTimeout(800);
 assert.equal(p.url(),base+'/once.pdf#page=3','Chrome reader retains the original address');
 assert.equal(counts.get('/once.pdf'),1,'native handoff uses the RAM copy');
 assert.ok(p.frames().some(f=>f.url().startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/')),'the built-in Chrome reader is shown inside the original-address stream host');
 assert.match(await overlayFilter(),/invert/,'native handoff restores the browser PDF overlay');
 const reload=await context.newPage();await reload.goto(base+'/native-choice.pdf');const reloadReader=await reader(reload);
 await reloadReader.host.locator('#native').evaluate(button=>button.click());await reload.waitForTimeout(400);await reload.reload();
 await frame(reload,'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/');assert.equal(reload.url(),base+'/native-choice.pdf');
 const post=await context.newPage();await post.goto(base+'/form');await post.getByText('Open PDF').click();await reader(post);assert.equal(post.url(),base+'/post.pdf');assert.equal(counts.get('/post.pdf'),1);
 const embedded=await context.newPage();await embedded.goto(base+'/embed');const em=await reader(embedded);assert.equal(embedded.url(),base+'/embed');assert.equal(counts.get('/embedded.pdf'),1);
 assert.equal(await em.view.locator('#viewport').count(),1);
 const encodedFile=join(profile,'Lecture 7 中文 #1.PDF');await writeFile(encodedFile,bytes);
 const encodedUrl=pathToFileURL(encodedFile).href;
 const local=await context.newPage();await local.goto(encodedUrl+'#page=2');let localReader=await reader(local);
 assert.equal(local.url(),encodedUrl+'#page=2');assert.equal(await localReader.view.locator('#page').inputValue(),'2');
 assert.match(await localReader.host.title(),/^Lecture 7 中文 #1\.PDF/);
 await local.reload();localReader=await reader(local);assert.equal(await localReader.view.locator('#page').inputValue(),'2');
 const pickedEvent=context.waitForEvent('page');await localReader.host.locator('#file').setInputFiles(fixture);const picked=await pickedEvent;
 const pickedReader=await reader(picked);assert.ok(picked.url().startsWith('blob:chrome-extension://'));assert.match(await pickedReader.host.title(),/sample.pdf/);
 await worker.evaluate(async()=>{const api=chrome.mimeHandler;await chrome.storage.local.set({settings:{enabled:false}});for(let i=0;i<80;i++){if((await api.getMimeHandlerOptions('application/pdf')).enabled===false)return;await new Promise(r=>setTimeout(r,25));}throw Error('Native handler did not turn off');});
 const off=await context.newPage();await off.goto(base+'/off.pdf',{waitUntil:'domcontentloaded'});await off.waitForTimeout(300);assert.equal(off.frames().some(f=>f.url().includes('/pdf-reader/mime.html')),false);
 await worker.evaluate(async()=>{const api=chrome.mimeHandler;await chrome.storage.local.set({settings:{enabled:true}});for(let i=0;i<80;i++){if((await api.getMimeHandlerOptions('application/pdf')).enabled===true)return;await new Promise(r=>setTimeout(r,25));}throw Error('Native handler did not turn on');});
 await context.close();context=null;
 // Launch Chrome with a local path, as an OS open-file action does on startup.
 await checkColdOpen(encodedFile,pathToFileURL(await realpath(encodedFile)).href);
 // Reproduce the packaged resource failure in an isolated extension copy.
 const blockedExtension=join(profile,'blocked-extension');await cp(resolve('extension'),blockedExtension,{recursive:true});
 const manifestPath=join(blockedExtension,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 manifest.web_accessible_resources=manifest.web_accessible_resources.filter(group=>!group.resources.includes('workspaces/pdf-viewer/viewer.html'));
 await writeFile(manifestPath,JSON.stringify(manifest));
 context=await launch(blockedExtension,join(profile,'blocked-profile'));
 const blocked=await context.newPage();await blocked.goto(encodedUrl);const blockedHost=await frame(blocked,'/pdf-reader/mime.html');
 await blockedHost.locator('#message').waitFor({state:'visible',timeout:15000});
 assert.ok(await blockedHost.locator('#message').textContent());
 await blockedHost.locator('#native').click();await frame(blocked,'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/');
 assert.equal(blocked.url(),encodedUrl,'Chrome fallback preserves the local path even if the renderer did not load');
 await writeFile(join(folder,'README.md'),'# Native PDF URL checks\n\nRun scripts/browser/test-native-mime-browser.mjs with PDF_PLAYWRIGHT and PDF_CHROME pointing to installed tools. sample.pdf is a three-page synthetic file. The check covers original URLs and page fragments, Blob URLs from HTTPS and sandboxed pages (including saving and switching readers after revocation), one-use responses, POST, embeds, local files, cold startup with a local path, renderer startup failure and Chrome fallback, authenticated AI status, PDF overlays, system printing, and the master switch. The local path includes spaces, Unicode, and a literal hash. native-reader.png shows the current reader. probe-extension/ and probe.mjs are a minimal native-stream and sender-identity experiment. Browser profiles are temporary.\n');
 console.log('Native MIME: Blob sources, original addresses, local cold start and reload, renderer recovery, POST, embeds, AI identity, Chrome fallback, printing, overlays, and master switch passed.');
}finally{await context?.close();await rm(profile,{recursive:true,force:true});await new Promise(r=>server.close(r));}
