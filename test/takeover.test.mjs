import test from 'node:test';import assert from 'node:assert/strict';
const records=[],session={},calls=[];globalThis.chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,getContexts:async()=>[{tabId:12,frameId:0,documentUrl:'chrome-extension://test/workspaces/pdf-reader/index.html?source=https://example.com/a.pdf?signature=x%2By&k=1'}]},extension:{isAllowedFileSchemeAccess:async()=>true},declarativeNetRequest:{getSessionRules:async()=>records.flatMap(r=>r.addRules||[]),updateDynamicRules:async r=>records.push(r),updateSessionRules:async r=>records.push(r),isRegexSupported:async()=>({isSupported:true})},storage:{session:{get:async key=>({[key]:session[key]}),set:async data=>Object.assign(session,data),remove:async key=>delete session[key]}},tabs:{update:async(...args)=>calls.push(args)}};
const {takeoverRules,configureTakeover,useNative,forgetNative,openLocalPdf}=await import('../extension/background/products/takeover.js');
test('takeover covers PDF tabs and embedded frames, is GET/MIME gated and respects attachments',async()=>{assert.deepEqual(takeoverRules(false,true),[]);const rules=takeoverRules(true,false);assert.equal(rules.length,3);for(const r of rules){assert.deepEqual(r.condition.requestMethods,['get']);assert.deepEqual(r.condition.resourceTypes,['main_frame','sub_frame','object']);assert.ok(r.condition.responseHeaders);}assert.equal(rules[0].action.type,'allow');assert.ok(rules[0].priority>rules[1].priority);assert.equal(rules[1].action.redirect.regexSubstitution,'chrome-extension://test/workspaces/pdf-reader/index.html?source=\\0');assert.equal(takeoverRules(true,true).length,3);await configureTakeover(true);});
test('native exemption scoped to source and tab, cleaned only on departure',async()=>{const source='https://example.com/a.pdf?signature=x%2By&k=1';const sender={id:'test',frameId:0,documentId:'reader-document',tab:{id:12},url:'chrome-extension://test/workspaces/pdf-reader/index.html?source='+source};await useNative(sender);const rule=records.at(-1).addRules[0];assert.deepEqual(rule.condition.tabIds,[12]);assert.ok(new RegExp(rule.condition.regexFilter).test(source));assert.ok(new RegExp(rule.condition.regexFilter).test(source+'#page=2'));assert.equal(new RegExp(rule.condition.regexFilter).test(source+'2'),false);await forgetNative(12,source+'#page=2');assert.ok(session['native:12']);await forgetNative(12,'https://example.com/');assert.equal(session['native:12'],undefined);await assert.rejects(useNative({...sender,frameId:2}));await assert.rejects(useNative({...sender,url:'https://evil.test/'}));});

test('native handover cancels stale requests and rolls back failures without leaking exemptions',async()=>{
 const original=globalThis.chrome;
 try {
  for(const fault of ['storage','install','navigate','depart','rollback']){
   const state={},rules=new Map();let live=true,updates=0,navigations=0;
   const sender={id:'test',frameId:0,documentId:'reader',tab:{id:20},url:'chrome-extension://test/workspaces/pdf-reader/index.html?source=https://example.com/a.pdf'};
   globalThis.chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,getContexts:async()=>live?[{tabId:20,frameId:0,documentUrl:sender.url}]:[]},
    storage:{session:{get:async key=>({[key]:state[key]}),set:async values=>{if(fault==='storage')throw Error('storage');Object.assign(state,values);},remove:async key=>delete state[key]}},
    declarativeNetRequest:{isRegexSupported:async()=>({isSupported:true}),getSessionRules:async()=>[...rules.values()],updateSessionRules:async update=>{
     updates++;if(fault==='install'||(fault==='rollback'&&updates===2))throw Error('rules');
     for(const id of update.removeRuleIds||[])rules.delete(id);for(const rule of update.addRules||[])rules.set(rule.id,rule);
     if(fault==='depart')live=false;
    }},tabs:{update:async()=>{navigations++;if(fault==='navigate'||fault==='rollback')throw Error('navigation');}}};
   await assert.rejects(useNative(sender));
   if(fault==='rollback'){assert.equal(rules.size,1);assert.ok(state['native:20'],'failed cleanup retains its ownership record');}
   else {assert.equal(rules.size,0);assert.equal(state['native:20'],undefined);}
   if(['storage','install','depart'].includes(fault))assert.equal(navigations,0);
   if(fault==='storage')assert.equal(updates,0);
  }
 }finally{globalThis.chrome=original;}
});

const { createSettingsSurface } = await import('../extension/background/settings-surface.js');

test('local PDF navigation checks file access, latest tab URL and native exemptions without download-history access',async()=>{
 const original=globalThis.chrome,source='file:///tmp/Downloaded%20File.PDF#page=2';
 let enabled=true,access=true,current=source,pending='',state={},updates=[];
 try{
  globalThis.chrome={storage:{local:{get:async()=>({settings:{enabled}})},session:{get:async key=>({[key]:state[key]})}},extension:{isAllowedFileSchemeAccess:async()=>access},tabs:{get:async()=>({url:current,pendingUrl:pending}),update:async(...args)=>updates.push(args)}};
  await openLocalPdf(8,source);assert.deepEqual(updates,[[8,{url:'chrome-extension://test/workspaces/pdf-reader/index.html?source='+source}]]);
  updates=[];access=false;await openLocalPdf(8,source);assert.equal(updates.length,0);
  access=true;enabled=false;await openLocalPdf(8,source);assert.equal(updates.length,0);
  enabled=true;current='https://example.com/';await openLocalPdf(8,source);assert.equal(updates.length,0);
  current=source;pending='https://example.com/next';await openLocalPdf(8,source);assert.equal(updates.length,0);
  pending='';state['native:8']={entries:[{id:1000,frameId:0,url:source.split('#')[0]}]};await openLocalPdf(8,source);assert.equal(updates.length,0);
  state={};for(const url of ['https://example.com/a.pdf','file:///tmp/report.txt','javascript:bad'])await openLocalPdf(8,url);assert.equal(updates.length,0);
 }finally{globalThis.chrome=original;}
});

test('embedded native return keeps the parent tab and isolates simultaneous PDF exemptions',async()=>{
 const original=globalThis.chrome,state={},rules=new Map(),updates=[];
 const url=frame=>'chrome-extension://test/workspaces/pdf-reader/index.html?source=https://example.com/'+frame+'.pdf?token=a%2Bb&k=1';
 const sender=frame=>({id:'test',frameId:frame,documentId:'frame-'+frame,tab:{id:30},url:url(frame)});
 try {
  globalThis.chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,getContexts:async({documentIds})=>[3,4].filter(frame=>documentIds.includes('frame-'+frame)).map(frame=>({frameId:frame,tabId:30,documentId:'frame-'+frame,documentUrl:url(frame)}))},
   storage:{session:{get:async key=>({[key]:state[key]}),set:async data=>Object.assign(state,data),remove:async key=>delete state[key]}},
   declarativeNetRequest:{isRegexSupported:async()=>({isSupported:true}),getSessionRules:async()=>[...rules.values()],updateSessionRules:async({removeRuleIds=[],addRules=[]})=>{for(const id of removeRuleIds)rules.delete(id);for(const rule of addRules)rules.set(rule.id,rule);}},
   tabs:{update:async(...args)=>updates.push(args)}};
  state['native:99']={entries:[{frameId:2,id:1000,url:'https://example.com/stale.pdf'}]};
  await useNative(sender(3));await useNative(sender(4));assert.equal(rules.size,2);assert.equal(updates.length,0,'parent must not navigate');
  assert.equal(state['native:30'].entries.length,2);
  await forgetNative(99,null,true);assert.equal(rules.size,2,'stale metadata cannot remove another tab’s reused rule ID');
  for(const rule of rules.values()){assert.deepEqual(rule.condition.tabIds,[30]);assert.deepEqual(rule.condition.resourceTypes,['sub_frame','object']);assert.deepEqual(rule.condition.initiatorDomains,['test']);}
  await useNative(sender(3));assert.equal(rules.size,2,'same frame replaces only its own exemption');
  await assert.rejects(useNative({...sender(3),frameId:5}));
  await assert.rejects(useNative({...sender(3),id:'other'}));
  await forgetNative(30,'https://example.com/another-page');assert.equal(rules.size,0);assert.equal(state['native:30'],undefined);
  await useNative(sender(4));await forgetNative(30,null,true);assert.equal(rules.size,0);
 }finally{globalThis.chrome=original;}
});

test('Settings keeps the newest registered document without reading general tab URLs', async () => {
  const base='chrome-extension://test/settings/',key='qa-settings',saved={},removed=[];
  const docs=new Map();let afterRead=null,failRead=false;
  const add=(tabId,documentId,incognito=false,path='index.html')=>{const c={tabId,documentId,frameId:0,incognito,documentUrl:base+path};docs.set(documentId,c);return{frameId:0,documentId,url:c.documentUrl,tab:{id:tabId,incognito}};};
  globalThis.chrome={runtime:{async getContexts(filter){if(failRead){failRead=false;throw Error('transient');}const result=[...docs.values()].filter(c=>c.incognito===filter.incognito&&(!filter.documentIds||filter.documentIds.includes(c.documentId)));if(afterRead){const fn=afterRead;afterRead=null;fn();}return result.map(c=>({...c}));}},storage:{session:{async get(k){return{[k]:saved[k]}},async set(update){Object.assign(saved,update);}}},tabs:{async remove(id){removed.push(id);for(const [key,value]of docs)if(value.tabId===id)docs.delete(key);}}};
  let register=createSettingsSurface(url=>url?.startsWith(base),key);
  const first=add(1,'first');await register(first,100);
  const slow=add(2,'slow'),newest=add(3,'newest');await register(newest,300);
  assert.deepEqual(removed,[1]);assert.ok(docs.has('slow'),'unregistered loading document is not guessed to be old');
  await register(slow,200);assert.deepEqual(removed,[1,2],'older document registering late cannot displace newest');
  const privatePage=add(4,'private',true);await register(privatePage,400);assert.ok(docs.has('newest'),'privacy contexts stay separate');
  register=createSettingsSurface(url=>url?.startsWith(base),key); // worker restart, session order survives
  const delayed=add(5,'delayed');await register(delayed,250);assert.equal(removed.at(-1),5);
  const leaving=add(6,'leaving');await register(leaving,500);
  const replacement=add(7,'replacement');afterRead=()=>{docs.get('leaving').documentUrl='chrome-extension://test/workspaces/reader.html';};await register(replacement,600);
  assert.ok(docs.has('leaving'),'document navigation is rechecked before closing');
  const retry=add(8,'retry');failRead=true;await assert.rejects(register(retry,700));await register(retry,700);assert.equal(docs.has('replacement'),false,'queue recovers after API failure');
  const count=removed.length;assert.equal(await register({...retry,frameId:1},800),false);assert.equal(await register({...retry,url:'https://example.com'},800),false);assert.equal(await register(retry,NaN),false);assert.equal(removed.length,count);
});

test('PDF Referer rules derive only source origin and have exact authenticated ownership',async()=>{
 const original=globalThis.chrome,storage={},rules=new Map();
 const source='https://files.example.edu/Download?token=secret%2Bvalue#page=12';
 const sender={id:'test',frameId:0,documentId:'pdf-reader',tab:{id:12},url:'chrome-extension://test/workspaces/pdf-reader/index.html?source='+source};
 let alive=true,failRemove=false;
 globalThis.chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,getContexts:async()=>alive?[{tabId:12,frameId:0,documentUrl:sender.url}]:[]},
  storage:{session:{get:async key=>({[key]:storage[key]}),set:async value=>Object.assign(storage,value),remove:async key=>delete storage[key]}},
  declarativeNetRequest:{isRegexSupported:async()=>({isSupported:true}),getSessionRules:async()=>[...rules.values()],updateSessionRules:async({removeRuleIds=[],addRules=[]})=>{if(failRemove&&removeRuleIds.length)throw Error('busy');for(const id of removeRuleIds)rules.delete(id);for(const rule of addRules)rules.set(rule.id,rule);}}
 };
 try{
  const {preparePdfRequest,finishPdfRequest,forgetPdfRequests}=await import('../extension/background/products/pdf-request.js');
  await assert.rejects(preparePdfRequest({...sender,url:'https://evil.test/'}));
  const token=await preparePdfRequest(sender),rule=[...rules.values()][0];
  assert.equal(rule.action.requestHeaders[0].value,'https://files.example.edu/');
  assert.deepEqual(rule.condition.tabIds,[12]);assert.deepEqual(rule.condition.initiatorDomains,['test']);assert.deepEqual(rule.condition.resourceTypes,['xmlhttprequest']);assert.deepEqual(rule.condition.requestMethods,['get']);assert.equal(rule.condition.isUrlFilterCaseSensitive,true);
  const pattern=new RegExp(rule.condition.regexFilter);assert.equal(pattern.test(source.split('#')[0]),true);assert.equal(pattern.test(source.split('#')[0]+'&extra=1'),false);assert.equal(pattern.test('https://elsewhere.example/'),false);
  await finishPdfRequest({...sender,documentId:'other'},token);assert.equal(rules.size,1);
  failRemove=true;await assert.rejects(finishPdfRequest(sender,token));assert.ok(storage['pdf-fetch:12']);
  failRemove=false;await finishPdfRequest(sender,token);assert.equal(rules.size,0);assert.equal(storage['pdf-fetch:12'],undefined);
  await preparePdfRequest(sender);await forgetPdfRequests(12,sender.url);assert.equal(rules.size,1);
  await forgetPdfRequests(12,'https://example.edu/');assert.equal(rules.size,0);
  alive=false;await assert.rejects(preparePdfRequest(sender));assert.equal(rules.size,0);
 }finally{globalThis.chrome=original;}
});
