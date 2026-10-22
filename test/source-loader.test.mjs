import test from 'node:test';import assert from 'node:assert/strict';
import {fetchPdfSource,SOURCE_TIMEOUTS} from '../extension/workspaces/pdf-reader/source-loader.js';
import {PDF_LIMITS,pdfOpenPage} from '../extension/workspaces/pdf-viewer/model.js';
function clock(){let now=0,id=0;const tasks=new Map();return{set(fn,ms){const key=++id;tasks.set(key,{fn,at:now+ms});return key;},clear(key){tasks.delete(key);},advance(ms){now+=ms;for(const[key,task]of [...tasks])if(task.at<=now){tasks.delete(key);task.fn();}},get count(){return tasks.size;}};}
const headers=values=>new Headers(values);
test('streaming permits progress beyond a minute and keeps bounded byte/header limits',async()=>{
 assert.equal(PDF_LIMITS.bytes,128*1024*1024);assert.equal(SOURCE_TIMEOUTS.idle,90_000);
 const timers=clock();let cancel=false,index=0;
 const result=await fetchPdfSource('https://example.edu/test.pdf',{timers,fetcher:async()=>({ok:true,headers:headers({}),body:{getReader:()=>({async read(){timers.advance(60_000);return index++<3?{value:new Uint8Array([index]),done:false}:{done:true};},async cancel(){cancel=true;},releaseLock(){}})}})});
 assert.deepEqual([...new Uint8Array(result.bytes)],[1,2,3]);assert.equal(timers.count,0);assert.equal(cancel,true);
 let read=false;
 await assert.rejects(fetchPdfSource('https://example.edu/test.pdf',{timers,fetcher:async()=>({ok:true,headers:headers({'content-length':String(PDF_LIMITS.bytes+1)}),body:{getReader(){read=true;}}})}),/large/);
 assert.equal(read,false);assert.equal(timers.count,0);
});
test('idle timeout, transport cancellation, authorization failure, and overflow have distinct cleanup',async()=>{
 const timers=clock();let aborted=false;
 const promise=fetchPdfSource('https://example.edu/test.pdf',{timers,fetcher:async(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('transport'));},{once:true}))});
 timers.advance(90_000);await assert.rejects(promise,/timeout/);assert.equal(aborted,true);assert.equal(timers.count,0);
 await assert.rejects(fetchPdfSource('https://example.edu/test.pdf',{timers,fetcher:async()=>({ok:false,status:403})}),/access/);
 const controller=new AbortController();controller.abort();let reads=0;
 await assert.rejects(fetchPdfSource('https://example.edu/test.pdf',{timers,signal:controller.signal,fetcher:async()=>{reads++;return {ok:true};}}),/abort/);
 assert.equal(reads,0);assert.equal(timers.count,0);
 let released=false;
 await assert.rejects(fetchPdfSource('https://example.edu/test.pdf',{timers,fetcher:async()=>({ok:true,headers:headers({}),body:{getReader:()=>({read:async()=>({done:false,value:{byteLength:PDF_LIMITS.bytes+1}}),cancel:async()=>{},releaseLock(){released=true;}})}})}),/large/);
 assert.equal(released,true);assert.equal(timers.count,0);
});
test('safe page fragments preserve navigation bounds',()=>{
 assert.equal(pdfOpenPage('https://example.edu/a.pdf#page=12&zoom=150',20),12);
 assert.equal(pdfOpenPage('https://example.edu/a.pdf#page=999',20),20);
 for(const hash of ['page=0','page=-1','page=1.5','page=NaN','page=1e3','nameddest=thing'])assert.equal(pdfOpenPage('https://example.edu/a.pdf#'+hash,20),1);
});
