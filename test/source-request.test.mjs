import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceRequest } from '../extension/workspaces/pdf-reader/source-request.js';
import { readerEntryTarget, readerPageURL, READER_ENTRY_PATH } from '../extension/core/source.js';
import { pdfPageDestination } from '../extension/workspaces/pdf-viewer/model.js';

const event=()=>{const listeners=[];return{addListener:fn=>listeners.push(fn),emit:value=>{for(const fn of listeners)fn(value);}};};
function client(){
 const tasks=new Map(),messages=[],port={onMessage:event(),onDisconnect:event(),disconnected:0,postMessage:value=>messages.push(value),disconnect(){this.disconnected++;}};
 let sequence=0,connections=0;
 const timers={setTimeout(fn,delay){const id=++sequence;tasks.set(id,{fn,delay,interval:false});return id;},clearTimeout:id=>tasks.delete(id),setInterval(fn,delay){const id=++sequence;tasks.set(id,{fn,delay,interval:true});return id;},clearInterval:id=>tasks.delete(id)};
 const runtime={connect({name}){assert.equal(name,'pdf-source-request');connections++;return port;},sendMessage:async value=>{messages.push(value);}};
 return{port,tasks,messages,timers,runtime,get connections(){return connections;},fire(delay){for(const [id,t]of [...tasks])if(t.delay===delay){if(!t.interval)tasks.delete(id);t.fn();}}};
}
test('transient entry retains signed URLs and fragments but has one fixed trusted destination',()=>{
 const runtime={getURL:path=>'chrome-extension://owner/'+path},entry=runtime.getURL(READER_ENTRY_PATH),reader=readerPageURL(runtime);
 const source='https://example.edu/Download?token=a%2Bb&k=1#page=12';
 assert.equal(readerEntryTarget(entry+'?source='+source,runtime),reader+'?source='+source);
 for(const value of ['javascript:alert(1)','https://user:pass@example.edu/a.pdf','file:///tmp/a.pdf','data:application/pdf,abc'])assert.equal(readerEntryTarget(entry+'?source='+value,runtime),reader);
 assert.equal(readerEntryTarget('https://example.edu/'+READER_ENTRY_PATH+'?source='+source,runtime),reader);
 for(const value of ['0','-1','1.2','1e3','NaN','999999999'])assert.equal(pdfPageDestination('https://example.edu/a.pdf#page='+value),null);
 assert.equal(pdfPageDestination('https://example.edu/a.pdf#page=12&zoom=150'),12);
});
test('request lease is bounded before initialization, heartbeats only during transfer, and releases once',async()=>{
 const qa=client(),request=createSourceRequest(qa);
 assert.equal(qa.tasks.size,1);
 qa.port.onMessage.emit({type:'ready',token:'owned-token'});await request.ready;
 qa.fire(20_000);assert.deepEqual(qa.messages,[{type:'heartbeat'}]);
 qa.port.onMessage.emit({type:'ready',token:'different-token'});
 request.release();request.release();
 assert.equal(qa.tasks.size,0);assert.equal(qa.port.disconnected,1);
 assert.deepEqual(qa.messages,[{type:'heartbeat'},{type:'PDF_REQUEST_END',token:'owned-token'}]);
});
test('request initialization abort, timeout, absent header rule, and connection loss retire resources',async()=>{
 for(const mode of ['aborted','abort','timeout','no-rule','disconnect']){
  const qa=client(),controller=new AbortController();if(mode==='aborted')controller.abort();
  const request=createSourceRequest({...qa,signal:controller.signal});
  if(mode==='abort')controller.abort();
  if(mode==='timeout')qa.fire(5000);
  if(mode==='no-rule')qa.port.onMessage.emit({type:'ready',token:null});
  if(mode==='disconnect'){qa.port.onMessage.emit({type:'ready',token:'owned-token'});qa.port.onDisconnect.emit();}
  await request.ready;assert.equal(qa.tasks.size,0,mode);assert.equal(qa.connections,mode==='aborted'?0:1,mode);
  assert.equal(qa.messages.filter(m=>m.type==='PDF_REQUEST_END').length,mode==='disconnect'?1:0,mode);
 }
});
test('browser-owned request ports clean up normal, retiring, and rejected readers without touching peers',async()=>{
 const original=globalThis.chrome,storage={},rules=new Map(),contexts=new Map();
 const sender=frame=>({id:'test',origin:'chrome-extension://test',frameId:frame,documentId:'frame-'+frame,tab:{id:12},url:'chrome-extension://test/workspaces/pdf-reader/index.html?source=https://example.edu/'+frame+'.pdf#page=1'});
 function port(who){let ready;const prepared=new Promise(r=>ready=r);return{sender:who,name:'pdf-source-request',onMessage:event(),onDisconnect:event(),disconnected:0,prepared,postMessage:message=>ready(message),disconnect(){this.disconnected++;}};}
 globalThis.chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,getContexts:async({documentIds})=>documentIds.map(id=>contexts.get(id)).filter(Boolean)},storage:{session:{get:async key=>({[key]:storage[key]}),set:async values=>Object.assign(storage,values),remove:async key=>delete storage[key]}},declarativeNetRequest:{isRegexSupported:async()=>({isSupported:true}),getSessionRules:async()=>[...rules.values()],updateSessionRules:async({removeRuleIds=[],addRules=[]})=>{for(const id of removeRuleIds)rules.delete(id);for(const rule of addRules)rules.set(rule.id,rule);}}};
 try{
  const {connectPdfRequest,finishPdfRequest,forgetPdfRequests}=await import('../extension/background/products/pdf-request.js');
  for(const frame of [1,2,3]){const s=sender(frame);contexts.set(s.documentId,{documentId:s.documentId,frameId:frame,tabId:12,documentUrl:s.url.replace('#page=1','#page=2')});}
  const first=port(sender(1)),peer=port(sender(2));
  assert.equal(connectPdfRequest(first),true);const a=await first.prepared;
  connectPdfRequest(peer);const b=await peer.prepared;assert.equal(rules.size,2);
  await forgetPdfRequests(12,sender(1).url.replace('#page=1','#page=3'));assert.equal(rules.size,2,'hash changes retain the ongoing exact-URL requests');
  contexts.delete('frame-1');first.onDisconnect.emit();await finishPdfRequest(first.sender,a.token);
  assert.equal(rules.size,1);assert.ok(storage['pdf-fetch:12'].some(v=>v.token===b.token));
  peer.onMessage.emit({type:'unexpected'});await finishPdfRequest(peer.sender,b.token);assert.equal(peer.disconnected,1);assert.equal(rules.size,0);
  const retiring=port(sender(3));connectPdfRequest(retiring);retiring.onDisconnect.emit();
  await new Promise(setImmediate);assert.equal(rules.size,0,'disconnect during initialization also cleans the later token');
  for(const who of [{...sender(1),origin:'null'},{...sender(1),id:'other'},{...sender(1),url:'https://example.edu/'}]){const rejected=port(who);connectPdfRequest(rejected);assert.equal(rejected.disconnected,1);}
  assert.equal(connectPdfRequest({...first,name:'unrelated'}),false);
 }finally{globalThis.chrome=original;}
});
