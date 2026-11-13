import { readSettings } from '../../core/settings.js';
import { isReaderSender } from '../reader-sender.js';
import { TAKEOVER_REDIRECT_RULE_IDS, readerPageURL, safeSource, sourceFromReader, takeoverRedirectURL, takeoverTicket, withoutHash } from '../../core/source.js';
import { mimeApi, mimeOriginalUrl, MIME_READER_PATH } from '../../core/mime-source.js';
const readerURL=readerPageURL();
let serial=Promise.resolve();
const enqueue=fn=>{ const result=serial.catch(()=>{}).then(fn); serial=result; return result; };
export function takeoverRules(enabled, nativeMime = false, ticket) {
  if(!enabled) return [];
  // A session entry lets Chrome validate response redirects even when its
  // native Go to… command supplies no referring origin.
  const action={type:'redirect',redirect:{regexSubstitution:takeoverRedirectURL(ticket)}};
  const base={resourceTypes:['main_frame','sub_frame','object'],requestMethods:['get'],regexFilter:'^https?://.*'};
  // Attachments remain normal downloads. Never retry/replay a POST response.
  const rules=[{id:1,priority:20,action:{type:'allow'},condition:{...base,responseHeaders:[{header:'content-disposition',values:['attachment*']}] }},
    {id:TAKEOVER_REDIRECT_RULE_IDS[0],priority:10,action,condition:{...base,responseHeaders:[{header:'content-type',values:['application/pdf*','application/x-pdf*']}] }},
    {id:TAKEOVER_REDIRECT_RULE_IDS[1],priority:10,action,condition:{...base,regexFilter:'^https?://[^?#]+\\.pdf([?#].*)?$',isUrlFilterCaseSensitive:false,responseHeaders:[{header:'content-type',values:['application/octet-stream*','binary/octet-stream*']}] }}];
  if (nativeMime) rules[1].condition.responseHeaders[0].values = ['application/x-pdf*'];
  return rules;
}
export function configureTakeover(enabled) {return enqueue(async()=>{
  // Session IDs must not survive browser exit or extension reload. Retire
  // legacy persistent rules without disturbing native/Referer session rules.
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[1,2,3,4]});
  const api = mimeApi();
  if (api) await api.setMimeHandlerOptions('application/pdf', { enabled: enabled === true });
  // The public entry only accepts a ticket from the browser's active rules.
  const ticket = enabled && (takeoverTicket(await chrome.declarativeNetRequest.getSessionRules()) || crypto.randomUUID());
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[1,2,3,4],addRules:takeoverRules(enabled, !!api, ticket)});
});}
export function rememberMimeNative(sender, value) { return enqueue(async () => {
  const source = mimeOriginalUrl(value);
  if (!mimeApi() || !source || source.startsWith('blob:') || !isReaderSender(sender) || sender.url !== chrome.runtime.getURL(MIME_READER_PATH)) throw Error('Native reader unavailable');
  await assertCurrentReader(sender);
  const tab = await chrome.tabs.get(sender.tab.id);
  if (!tab.url || withoutHash(tab.url) !== withoutHash(source) || tab.pendingUrl && withoutHash(tab.pendingUrl) !== withoutHash(source)) throw Error('Reader has navigated');
  const key = 'native:' + sender.tab.id, previous = (await chrome.storage.session.get(key))[key];
  await chrome.storage.session.set({ [key]: { ...(previous || {}), mimeSource: withoutHash(source) } });
  try { await assertCurrentReader(sender); }
  catch (error) { if (previous) await chrome.storage.session.set({ [key]: previous }); else await chrome.storage.session.remove(key); throw error; }
  return { native: true };
}); }
export async function setMimeAppearanceShield(sender, value, enabled) {
  const source = safeSource(value);
  if (!source || typeof enabled !== 'boolean' || !isReaderSender(sender) || sender.frameId <= 0
      || sender.url !== chrome.runtime.getURL(MIME_READER_PATH)) throw Error('Invalid PDF reader');
  const tabId = sender.tab.id, address = withoutHash(source);
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || withoutHash(tab.url) !== address || tab.pendingUrl && withoutHash(tab.pendingUrl) !== address) return;
  await assertCurrentReader(sender);
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    args: [address, enabled],
    func: (address, enabled) => {
      const actual = new URL(location.href); actual.hash = '';
      if (actual.href !== address || !document.body) return;
      // Chromium owns this closed shadow root. A nested reader cannot reach it
      // directly, and an overlay there recolors even the reader's popovers.
      const root = chrome.dom?.openOrClosedShadowRoot(document.body);
      if (!root || document.body.shadowRoot || !root.querySelector('iframe[type="application/pdf"]')) return;
      const key = Symbol.for('cosmic-pdf.mime-appearance-shield');
      let sheet = globalThis[key];
      if (enabled) {
        if (!sheet) {
          sheet = new CSSStyleSheet();
          sheet.replaceSync('.darkreader--pdf-overlay{backdrop-filter:none!important} iframe[type="application/pdf"]{filter:none!important}');
          globalThis[key] = sheet;
        }
        if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      } else if (sheet) {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter(candidate => candidate !== sheet);
        delete globalThis[key];
      }
    },
  });
}
async function assertCurrentReader(sender) {
  if (!sender.documentId) throw Error('Reader document unavailable');
  const contexts = await chrome.runtime.getContexts({ contextTypes:['TAB'], documentIds:[sender.documentId] });
  if (!contexts.some(context => context.tabId === sender.tab.id && context.frameId === sender.frameId && context.documentUrl === sender.url)) throw Error('Reader has navigated');
  if(sender.frameId===0){const tab=await chrome.tabs.get(sender.tab.id);if(tab.pendingUrl&&tab.pendingUrl!==sender.url)throw Error('Reader is navigating');}
}
// One tab may contain several independent PDF frames. Keep each fallback
// scoped to its exact source and resource kind; never navigate the parent page.
function nativeEntries(state) {
  const entries=Array.isArray(state?.entries)?state.entries:state?.url?[{...state,frameId:0}]:[];
  return entries.filter(entry=>Number.isInteger(entry.id)&&entry.id>=1000&&entry.id<2_000_000&&Number.isInteger(entry.frameId)&&entry.frameId>=0&&safeSource(entry.url));
}
export function useNative(sender) {return enqueue(async()=>{
  if(!isReaderSender(sender)) throw Error('Invalid reader');
  const source=sourceFromReader(sender.url||'',readerURL);if(!source) throw Error('Invalid PDF source');
  await assertCurrentReader(sender);
  const url=withoutHash(source), tabId=sender.tab.id, key='native:'+tabId;
  const regex='^'+url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(#.*)?$';
  const supported=await chrome.declarativeNetRequest.isRegexSupported({regex});
  if(!supported.isSupported) throw Error('This URL cannot be temporarily exempted. Disable automatic opening in Settings.');
  const previous=(await chrome.storage.session.get(key))[key],entries=nativeEntries(previous);
  const rules=await chrome.declarativeNetRequest.getSessionRules(),prior=entries.find(entry=>entry.frameId===sender.frameId);
  if(!prior&&entries.length>=64)throw Error('Too many embedded reader exemptions');
  let id=prior?.id;
  // A prior failed cleanup can outlive its rule. Never overwrite an ID that
  // has since been allocated to another tab.
  const priorRule=rules.find(rule=>rule.id===id);
  if(priorRule&&(priorRule.action.type!=='allow'||priorRule.condition.tabIds?.length!==1||priorRule.condition.tabIds[0]!==tabId))id=undefined;
  if(!id){id=1000;const used=new Set(rules.map(rule=>rule.id));while(used.has(id))id++;}
  const previousRule=rules.find(rule=>rule.id===id);
  const next=entries.filter(entry=>entry.frameId!==sender.frameId).concat({url,id,frameId:sender.frameId});
  await assertCurrentReader(sender);
  // Persist cleanup ownership before granting an exemption. A failed storage
  // write must not leave an untracked allow rule behind.
  await chrome.storage.session.set({[key]:{entries:next}});
  let installed=false;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[id],addRules:[{id,priority:100,action:{type:'allow'},condition:{tabIds:[tabId],resourceTypes:sender.frameId===0?['main_frame']:['sub_frame','object'],...(sender.frameId===0?{}:{initiatorDomains:[chrome.runtime.id]}),regexFilter:regex,isUrlFilterCaseSensitive:true}}]});
    installed=true;
    await assertCurrentReader(sender);
    // Embedded hosts perform their own same-frame navigation after the reply.
    if(sender.frameId===0)await chrome.tabs.update(tabId,{url:source});
  } catch(error) {
    // If rollback fails, keep cleanup metadata for the tab's next lifecycle event.
    if(installed) await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[id],addRules:previousRule?[previousRule]:[]});
    if(previous) await chrome.storage.session.set({[key]:previous});
    else await chrome.storage.session.remove(key);
    throw error;
  }
});}
export function forgetNative(tabId,url,closed=false){return enqueue(async()=>{
  const key='native:'+tabId, state=(await chrome.storage.session.get(key))[key];
  if(!state&&!closed)return;
  const entries=nativeEntries(state);
  if (!closed && state?.mimeSource && url && withoutHash(url) === state.mimeSource) return;
  if(!closed && (!url || (safeSource(url) && entries.some(entry=>entry.frameId===0&&withoutHash(url)===entry.url))))return;
  if(entries.length||closed){
    const ids=new Set(entries.map(entry=>entry.id)),rules=await chrome.declarativeNetRequest.getSessionRules();
    const owned=rules.filter(rule=>(closed?rule.id>=1000&&rule.id<2_000_000:ids.has(rule.id))&&rule.action.type==='allow'&&rule.condition.tabIds?.length===1&&rule.condition.tabIds[0]===tabId).map(rule=>rule.id);
    if(owned.length)await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:owned});
  }
  await chrome.storage.session.remove(key);
});}

// File navigations do not reliably pass through Chrome's network redirect
// rules. Observe only explicit local PDF URL changes, never download history.
export function openLocalPdf(tabId,value){
  if (mimeApi()) return Promise.resolve();
  const source=safeSource(value);
  if(!Number.isInteger(tabId)||tabId<0||!source||!source.startsWith('file:')||!new URL(source).pathname.toLowerCase().endsWith('.pdf'))return Promise.resolve();
  return enqueue(async()=>{
    if(!(await readSettings()).enabled||!await chrome.extension.isAllowedFileSchemeAccess())return;
    const state=(await chrome.storage.session.get('native:'+tabId))['native:'+tabId];
    if(nativeEntries(state).some(entry=>entry.frameId===0&&entry.url===withoutHash(source)))return;
    const tab=await chrome.tabs.get(tabId);
    if(tab.url!==source||(tab.pendingUrl&&tab.pendingUrl!==source))return;
    await chrome.tabs.update(tabId,{url:readerURL+'?source='+source});
  });
}
