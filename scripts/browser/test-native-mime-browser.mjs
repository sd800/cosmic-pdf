import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
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
async function reader(page){const host=await frame(page,'/pdf-reader/mime.html'),view=await frame(page,'/pdf-viewer/viewer.html');await view.waitForFunction(()=>document.querySelector('#count')?.textContent==='3');return {host,view};}
try{
 const ext=resolve('extension');context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1200,height:900},executablePath:process.env.PDF_CHROME,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');assert.equal(await worker.evaluate(()=>typeof chrome.mimeHandler),'object');
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
 const local=await context.newPage();await local.goto(pathToFileURL(fixture).href);const localReader=await reader(local);assert.equal(local.url(),pathToFileURL(fixture).href);
 const pickedEvent=context.waitForEvent('page');await localReader.host.locator('#file').setInputFiles(fixture);const picked=await pickedEvent;
 const pickedReader=await reader(picked);assert.ok(picked.url().startsWith('blob:chrome-extension://'));assert.match(await pickedReader.host.title(),/sample.pdf/);
 await worker.evaluate(async()=>{const api=chrome.mimeHandler;await chrome.storage.local.set({settings:{enabled:false}});for(let i=0;i<80;i++){if((await api.getMimeHandlerOptions('application/pdf')).enabled===false)return;await new Promise(r=>setTimeout(r,25));}throw Error('Native handler did not turn off');});
 const off=await context.newPage();await off.goto(base+'/off.pdf',{waitUntil:'domcontentloaded'});await off.waitForTimeout(300);assert.equal(off.frames().some(f=>f.url().includes('/pdf-reader/mime.html')),false);
 await writeFile(join(folder,'README.md'),'# Native PDF URL checks\n\nRun scripts/browser/test-native-mime-browser.mjs with PDF_PLAYWRIGHT and PDF_CHROME pointing to installed tools. sample.pdf is a three-page synthetic file. The check covers original URL and page fragment, a single-use response, POST, embedded and local PDFs, authenticated AI status, native fallback, PDF overlay isolation/restoration, system-print bypass, and the saved master switch. native-reader.png shows the current reader. probe-extension/ and probe.mjs are a minimal native-stream and sender-identity experiment. Browser profiles are temporary; no request logs or private documents are retained.\n');
 console.log('Native MIME: original URL, one request, page fragment, POST, embeds, local files, AI identity, print/native fallback, overlay isolation/restoration and off switch passed.');
}finally{await context?.close();await rm(profile,{recursive:true,force:true});await new Promise(r=>server.close(r));}
