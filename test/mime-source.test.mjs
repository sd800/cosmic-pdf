import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMimeStream, mimeOriginalUrl, mimeLocalFilename, isNativePdfCopy } from '../extension/core/mime-source.js';
import { isReaderSender } from '../extension/background/reader-sender.js';
const runtime={id:'test',getURL:path=>'chrome-extension://test/'+path};
const original=globalThis.chrome;globalThis.chrome={runtime};
const {takeoverRules,rememberMimeNative,forgetNative}=await import('../extension/background/products/takeover.js');
globalThis.chrome=original;
const mimeUrl=runtime.getURL('workspaces/pdf-reader/mime.html');
const stream={originalUrl:'https://example.edu/a.pdf#page=2',streamUrl:'chrome-extension://test/11111111-1111-4111-8111-111111111111',mimeType:'application/pdf',tabId:7};
test('Chrome MIME streams require the own extension stream and a safe source URL',()=>{
 assert.equal(validateMimeStream(stream,runtime).originalUrl,stream.originalUrl);
 for(const patch of [{mimeType:'text/html'},{tabId:-1},{streamUrl:'https://example.edu/stream'},{streamUrl:stream.streamUrl+'?key=secret'},
   {streamUrl:stream.streamUrl.replace('//test/','//foreign/')},{originalUrl:'javascript:alert(1)'},{originalUrl:'https://user:password@example.edu/a.pdf'}])assert.throws(()=>validateMimeStream({...stream,...patch},runtime));
 assert.equal(mimeOriginalUrl('blob:chrome-extension://foreign/uuid',runtime),null);
 const opaque = 'blob:null/11111111-1111-4111-8111-111111111111#page=2';
 assert.equal(validateMimeStream({...stream,originalUrl:opaque},runtime).originalUrl,opaque);
 assert.equal(mimeOriginalUrl('blob:null/not-a-uuid',runtime),null);
 assert.throws(()=>validateMimeStream({...stream,originalUrl:opaque,streamUrl:opaque},runtime));
 assert.equal(mimeOriginalUrl('file:///tmp/a.pdf',runtime),'file:///tmp/a.pdf');
 const copy={originalUrl:'blob:chrome-extension://test/uuid#cosmic-pdf-native&page=2'};
 assert.equal(isNativePdfCopy(copy,runtime),true);assert.equal(isNativePdfCopy({...copy,originalUrl:'blob:https://example.edu/uuid#cosmic-pdf-native'},runtime),false);
 assert.equal(mimeLocalFilename({originalUrl:'blob:chrome-extension://test/uuid#filename=Chosen.pdf'},runtime),'Chosen.pdf');
});
test('native and legacy handlers have distinct routes without extra permissions',()=>{
 const previous=globalThis.chrome;globalThis.chrome={runtime};
 try{
  const ticket='12345678-1234-4234-8234-123456789abc';
  assert.deepEqual(takeoverRules(true,true,ticket)[1].condition.responseHeaders[0].values,['application/x-pdf*']);
  assert.deepEqual(takeoverRules(true,false,ticket)[1].condition.responseHeaders[0].values,['application/pdf*','application/x-pdf*']);
  assert.deepEqual(takeoverRules(false,true),[]);
  const sender={id:'test',url:mimeUrl,origin:'chrome-extension://test',frameId:3,documentId:'mime-doc',tab:{id:7}};
  assert.equal(isReaderSender(sender,runtime),true);
  assert.equal(isReaderSender({...sender,origin:'null'},runtime),false);
  assert.equal(isReaderSender({...sender,url:mimeUrl+'.evil'},runtime),false);
 }finally{globalThis.chrome=previous;}
});
test('native choice is bound to a live MIME document, survives fragment changes, and expires on departure',async()=>{
 const previous=globalThis.chrome,state={};let active=true,url=stream.originalUrl;
 const sender={id:'test',url:mimeUrl,origin:'chrome-extension://test',frameId:3,documentId:'mime-doc',tab:{id:7}};
 globalThis.chrome={mimeHandler:{},runtime:{...runtime,getContexts:async()=>active?[{tabId:7,frameId:3,documentUrl:mimeUrl}]:[]},
  tabs:{get:async()=>({url})},storage:{session:{get:async key=>({[key]:state[key]}),set:async value=>Object.assign(state,value),remove:async key=>delete state[key]}},
  declarativeNetRequest:{getSessionRules:async()=>[]}};
 try{
  await rememberMimeNative(sender,stream.originalUrl);assert.equal(state['native:7'].mimeSource,'https://example.edu/a.pdf');
  await forgetNative(7,'https://example.edu/a.pdf#page=3');assert.ok(state['native:7']);
  await assert.rejects(rememberMimeNative(sender,'https://other.edu/a.pdf'));
  url='blob:https://example.edu/11111111-1111-4111-8111-111111111111';
  await assert.rejects(rememberMimeNative(sender,url));
  assert.equal(state['native:7'].mimeSource,'https://example.edu/a.pdf');
  active=false;await assert.rejects(rememberMimeNative(sender,stream.originalUrl));
  await forgetNative(7,'https://example.edu/next');assert.equal(state['native:7'],undefined);
 }finally{globalThis.chrome=previous;}
});
