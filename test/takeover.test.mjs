import test from 'node:test';import assert from 'node:assert/strict';
const records=[],session={},calls=[];globalThis.chrome={runtime:{getURL:path=>'chrome-extension://test/'+path},extension:{isAllowedFileSchemeAccess:async()=>true},declarativeNetRequest:{updateDynamicRules:async r=>records.push(r),updateSessionRules:async r=>records.push(r),isRegexSupported:async()=>({isSupported:true})},storage:{session:{get:async key=>({[key]:session[key]}),set:async data=>Object.assign(session,data),remove:async key=>delete session[key]}},tabs:{update:async(...args)=>calls.push(args)}};
const {takeoverRules,configureTakeover,useNative,forgetNative}=await import('../extension/background/products/takeover.js');
test('takeover is response-type gated, GET/top-level only and respects attachments',async()=>{assert.deepEqual(takeoverRules(false,true),[]);const rules=takeoverRules(true,false);assert.equal(rules.length,3);for(const r of rules){assert.deepEqual(r.condition.requestMethods,['get']);assert.deepEqual(r.condition.resourceTypes,['main_frame']);assert.ok(r.condition.responseHeaders);}assert.equal(rules[0].action.type,'allow');assert.ok(rules[0].priority>rules[1].priority);assert.equal(rules[1].action.redirect.regexSubstitution,'chrome-extension://test/workspaces/pdf-reader/index.html?source=\\0');assert.equal(takeoverRules(true,true).length,4);await configureTakeover(true);});
test('native exemption scoped to source and tab, cleaned only on departure',async()=>{const source='https://example.com/a.pdf?signature=x%2By&k=1';const sender={frameId:0,tab:{id:12},url:'chrome-extension://test/workspaces/pdf-reader/index.html?source='+source};await useNative(sender);const rule=records.at(-1).addRules[0];assert.deepEqual(rule.condition.tabIds,[12]);assert.ok(new RegExp(rule.condition.regexFilter).test(source));assert.ok(new RegExp(rule.condition.regexFilter).test(source+'#page=2'));assert.equal(new RegExp(rule.condition.regexFilter).test(source+'2'),false);await forgetNative(12,source+'#page=2');assert.ok(session['native:12']);await forgetNative(12,'https://example.com/');assert.equal(session['native:12'],undefined);await assert.rejects(useNative({...sender,frameId:2}));await assert.rejects(useNative({...sender,url:'https://evil.test/'}));});

const { createSettingsSurface } = await import('../extension/background/settings-surface.js');

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
