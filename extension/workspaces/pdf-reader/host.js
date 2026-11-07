import { fetchPdfSource } from './source-loader.js';
import { createSourceRequest } from './source-request.js';
import { resolveReaderAppearance, toggleReaderAppearance, isAppearanceMode } from '../../core/appearance.js';
import { readSettings, normalizeSettings, uiLocale, toolbarSignature } from '../../core/settings.js';
import { sourceFromReader, readerPageURL, safeSource, withoutHash, isPdf, filenameFrom, cleanFilename } from '../../core/source.js';
import { createPdfViewer } from '../pdf-viewer/host.js';
import { PDF_LIMITS, pdfPageDestination } from '../pdf-viewer/model.js';
import { MIME_READER_PATH, NATIVE_PDF_FRAGMENT, mimeApi, validateMimeStream, mimeFilenameHeaders, mimeLocalFilename, isNativePdfCopy } from '../../core/mime-source.js';
const $=id=>document.getElementById(id);
// The extension-owned host also supports embedded PDFs. No bytes, OCR text or
// private channel are ever shared with its containing webpage.
let settings=await readSettings(), locale=uiLocale(settings,chrome.i18n.getUILanguage());
function hostText(locale){return locale==='zh-CN'?{intro:'以舒适的外观阅读 PDF，按需识别扫描件中的文字。',open:'打开 PDF 文件',settings:'设置',native:'使用 Chrome 阅读器',hint:'将 PDF 拖到这里，或选择本地文件。PDF 阅读和文字识别均在本机完成。',failed:'无法打开此文件。可尝试 Chrome 阅读器或选择本地副本。',large:'文件超过 128 MB 的安全读取上限，请使用 Chrome 阅读器。',timeout:'连接长时间没有进展，请重试或选择本地副本。',access:'网站未允许读取此文件，请尝试 Chrome 阅读器。',downloadFailed:'下载未能开始，请重试。',nativeFailed:'无法切换。请在设置中暂时关闭自动打开，然后重新访问原文件。'}:{intro:'Read PDFs comfortably and recognize scanned text when you need it.',open:'Open a PDF',settings:'Settings',native:'Use Chrome reader',hint:'Drop a PDF here, or choose a local file. PDF reading and text recognition stay on your device.',failed:'This file could not be opened. Try the Chrome reader or choose a local copy.',large:'This file exceeds the 128 MB safe reading limit. Use the Chrome reader instead.',timeout:'The connection stopped making progress. Try again or choose a local copy.',access:'The website did not allow this file to be read. Try the Chrome reader.',downloadFailed:'The download could not start. Please try again.',nativeFailed:'Could not switch. Turn off automatic opening in Settings, then revisit the original file.'}}
let text=hostText(locale);
function localize(nextLocale){
 const old=text, message=$('message').textContent;locale=nextLocale;text=hostText(locale);
 document.documentElement.lang=locale;
 for(const [id,key]of [['intro','intro'],['open-file','open'],['settings','settings'],['native','native'],['hint','hint']])$(id).textContent=text[key];
 const errorKey=Object.keys(old).find(key=>old[key]===message);if(errorKey)$('message').textContent=text[errorKey];
}
localize(locale);document.documentElement.dataset.motion=String(settings.motion);
let mimeInfo = null, mimeFailure = false;
if (location.pathname === '/' + MIME_READER_PATH) {
 try { mimeInfo = validateMimeStream(await mimeApi().getStreamInfo()); }
 catch { mimeFailure = true; }
 if (isNativePdfCopy(mimeInfo)) {
  await mimeApi().abortAndFallbackToNativeHandler();
 }
}
let source=mimeInfo?.originalUrl || sourceFromReader(location.href,readerPageURL()), reader, original, blobURL, filename, controller, generation=0;
let nativeFrame = null;
let activeSettings=settings,appearanceOverride=null; const media=matchMedia('(prefers-color-scheme:dark)');
function appearance(){return resolveReaderAppearance(activeSettings.appearance,appearanceOverride,media.matches);}
function currentDark(){return appearance().dark;}
function applyTheme(){const dark=currentDark();document.documentElement.dataset.dark=String(dark);try{localStorage.setItem('appearance',settings.appearance);}catch{}reader?.setTheme(dark,appearance().mode);return dark;}
applyTheme();media.addEventListener('change',()=>{if(appearanceOverride==='auto'||appearanceOverride==='original'||(appearanceOverride===null||appearanceOverride==='opposite')&&activeSettings.appearance==='auto')applyTheme();});
function setMimeAppearanceShield(enabled){
 if(!mimeInfo||mimeInfo.embedded||!safeSource(source))return Promise.resolve();
 return chrome.runtime.sendMessage({type:'MIME_APPEARANCE_SHIELD',source,enabled}).catch(()=>{});
}
function setView(view){document.documentElement.dataset.view=view;}
function fail(message){$('message').textContent=message; setView('home');}
async function native(page){
 if (mimeInfo || mimeFailure) {
  try {
   if (blobURL) {
    const currentPage = Number.isSafeInteger(page) && page > 0 && page <= PDF_LIMITS.pages ? page : pdfPageDestination(source) || 1;
    if (!mimeInfo.embedded) {
      const result = await chrome.runtime.sendMessage({ type: 'NATIVE_MIME_READER', source });
      if (!result?.ok) throw Error('Native handoff unavailable');
    }
    await setMimeAppearanceShield(false);
    generation++; controller?.abort(); reader?.destroy(); reader = null;
    nativeFrame = document.createElement('iframe'); nativeFrame.className = 'pdf-viewer-frame'; nativeFrame.title = 'Chrome PDF viewer';
    nativeFrame.allowFullscreen = true; nativeFrame.referrerPolicy = 'no-referrer';
    nativeFrame.src = blobURL + NATIVE_PDF_FRAGMENT + '&page=' + currentPage;
    $('reader').replaceChildren(nativeFrame); $('reader').hidden = false; setView('reader');
   } else {
    await setMimeAppearanceShield(false);
    await mimeApi().abortAndFallbackToNativeHandler();
   }
  } catch { fail(text.nativeFailed); }
  return;
 }
 if(source){
  const requested=source,run=generation;
  const result=await chrome.runtime.sendMessage({type:'NATIVE_READER'}).catch(()=>null);
  if(run!==generation||source!==requested)return;
  if(result?.ok&&window!==top){location.assign(requested);return;}
  if(!result?.ok){if(reader)reader.showError(text.nativeFailed);else fail(text.nativeFailed);}
 }else if(blobURL){await openNativeCopy();}
}
async function openNativeCopy(){
 if(!blobURL||!reader)return;
 // Chrome prints the unchanged original, with its native PDF/OS print pipeline.
 // The opaque renderer cannot provide a destination or arbitrary bytes here.
 const url=blobURL,run=generation;
 try{
  const current=mimeInfo ? await chrome.tabs.get(mimeInfo.tabId) : await chrome.tabs.getCurrent();
  if(run!==generation||url!==blobURL)return;
  await chrome.tabs.create({url:url+NATIVE_PDF_FRAGMENT,...(current?{windowId:current.windowId,index:current.index+1}:{} )});
 }catch{if(run===generation)reader?.showError(text.nativeFailed);}
}
function openSettings(){if(reader)void chrome.runtime.sendMessage({type:'OPEN_SETTINGS'});else location.assign(chrome.runtime.getURL('settings/index.html'));}
function download(){
 if(!blobURL)return;
 // Save only the host-owned original Blob. No download-history API, refetch or
 // sandbox-provided URL; Chrome applies the user's normal download preferences.
 const link=document.createElement('a');link.href=blobURL;link.download=filename;link.hidden=true;
 try{document.body.append(link);link.click();}
 catch{if(reader)reader.showError(text.downloadFailed);else fail(text.downloadFailed);}
 finally{link.remove();}
}
$('native').onclick=native;$('settings').onclick=openSettings;$('open-file').onclick=()=>$('file').click();
$('file').onchange=()=>{const f=$('file').files[0];$('file').value='';if(f)void openFile(f);};
window.addEventListener('dragover',event=>{event.preventDefault();});window.addEventListener('drop',event=>{event.preventDefault();const f=event.dataTransfer?.files[0];if(f)void openFile(f);});
async function load(loader, initialFilename='PDF'){
 const run=++generation;controller?.abort();controller=new AbortController(); const current=controller;
 reader?.destroy();reader=null;activeSettings=settings;$('reader').hidden=false;setView('loading');$('message').textContent='';
 if(blobURL)URL.revokeObjectURL(blobURL);blobURL=null;original=null;
 try{
  // Load the isolated rendering shell and its bundled worker while fetching the PDF.
  const prepared=createPdfViewer({container:$('reader'),locale,settings,filename:cleanFilename(initialFilename),documentUrl:source||'',canUseNative:!!source,embedded:mimeInfo ? mimeInfo.embedded === true : window !== top,sampling:settings.sampling,sharpening:settings.sharpening,dark:applyTheme(),themeMode:appearance().mode,onNative:native,onPrint:openNativeCopy,onSettings:openSettings,onAiPreference:(key,enabled)=>{
    void chrome.runtime.sendMessage({type:'SAVE_AI_PREFERENCE',key,enabled}).then(result=>{
      // Durable storage notifications publish successful edits. A late reply
      // must not repaint an older snapshot over a newer toolbar/context edit.
      if(run===generation&&!result?.ok)reader?.setAi(settings);
    },()=>{if(run===generation)reader?.setAi(settings);});
  },onDownload:download,onTheme:mode=>{appearanceOverride=isAppearanceMode(mode)?mode:toggleReaderAppearance(activeSettings.appearance,appearanceOverride,media.matches);applyTheme();},onReady:()=>{if(run===generation){setView('reader');}},onError:()=>{if(run===generation&&!$('reader').querySelector('iframe')){reader=null;$('reader').hidden=true;fail(text.failed);}}});
  reader=prepared;
  const result=await loader(current.signal);if(run!==generation)return;if(!isPdf(result.bytes))throw Error('format');
  filename=cleanFilename(result.filename);original=new Blob([result.bytes],{type:'application/pdf'});blobURL=URL.createObjectURL(original);document.title=filename+' — Cosmic PDF';
  if(mimeInfo&&!mimeInfo.embedded){const choice=(await chrome.storage.session.get('native:'+mimeInfo.tabId))['native:'+mimeInfo.tabId];if(run!==generation)return;if(choice?.mimeSource===withoutHash(source)||choice?.entries?.some(entry=>entry.frameId===0&&entry.url===withoutHash(source))){await native();return;}}
  await setMimeAppearanceShield(true);
  if(run!==generation)return;
  prepared.open(result.bytes,filename);
 }catch(error){if(run===generation){reader?.destroy();reader=null;$('reader').hidden=true;fail(text[error.message]||text.failed);}}
}
async function openFile(file){if(file.size>PDF_LIMITS.bytes){if(reader)reader.showError(text.large);else fail(text.large);return;}if(mimeInfo){const current=await chrome.tabs.get(mimeInfo.tabId);const url=URL.createObjectURL(file)+'#'+new URLSearchParams({filename:cleanFilename(file.name)});await chrome.tabs.create({url,windowId:current.windowId,index:current.index+1,openerTabId:current.id});return;}source=null;history.replaceState(null,'',readerPageURL());$('native').hidden=true;await load(async()=>({bytes:await file.arrayBuffer(),filename:file.name}),file.name);}
function loadSource(){
 const requested=source;
 if (mimeInfo) return load(async signal => {
  const result = await fetchPdfSource(mimeInfo.streamUrl, { signal, keepCompletedResponse: true });
  return { bytes: result.bytes, filename: mimeLocalFilename(mimeInfo) || filenameFrom(requested, mimeFilenameHeaders(mimeInfo).get('content-disposition') || '') };
 }, filenameFrom(requested));
 return load(async signal=>{
  const request=createSourceRequest({signal});
  try {
   await request.ready;
   if(signal.aborted)throw Error('abort');
   const result=await fetchPdfSource(requested,{signal});
   return {bytes:result.bytes,filename:filenameFrom(result.response.url||requested,result.response.headers.get('content-disposition')||'')};
  } finally {
   request.release();
  }
 },filenameFrom(requested));
}
if(source){$('native').hidden=false;void loadSource();}else if(mimeFailure){$('native').hidden=false;fail(text.failed);}else setView('home');
window.addEventListener('hashchange',()=>{
 const next=sourceFromReader(location.href,readerPageURL());
 if(source&&next&&withoutHash(source)===withoutHash(next))source=next;
 const page=pdfPageDestination(location.href)||(location.hash?null:1);if(page)reader?.goToPage(page);
});
function sourceUpdated(tabId, change) {
 if (!mimeInfo || mimeInfo.embedded || tabId !== mimeInfo.tabId || !change.url || withoutHash(change.url) !== withoutHash(source)) return;
 source = change.url; const page = pdfPageDestination(source) || 1; reader?.goToPage(page);
 if (nativeFrame && blobURL) nativeFrame.src = blobURL + NATIVE_PDF_FRAGMENT + '&page=' + page;
}
if (mimeInfo) chrome.tabs.onUpdated.addListener(sourceUpdated);
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local'||!changes.settings)return;
 { const next=normalizeSettings(changes.settings.newValue);
  settings=next;
  const nextLocale=uiLocale(next,chrome.i18n.getUILanguage()),changed=toolbarSignature(activeSettings)!==toolbarSignature(next);
  const interfaceChanged=locale!==nextLocale||activeSettings.propertyDateFormat!==next.propertyDateFormat||activeSettings.ocrAction!==next.ocrAction||activeSettings.automaticOcr!==next.automaticOcr||activeSettings.useChromeFind!==next.useChromeFind||activeSettings.captureLinks!==next.captureLinks;
  const aiChanged=['aiEnabled','aiMode','aiWebsite','aiProvider','aiLanguage','aiIncludeContext'].some(key=>activeSettings[key]!==next[key]);
  const paperChanged=activeSettings.preserveDarkPaper!==next.preserveDarkPaper;
  activeSettings={...activeSettings,aiEnabled:next.aiEnabled,aiMode:next.aiMode,aiWebsite:next.aiWebsite,aiProvider:next.aiProvider,aiLanguage:next.aiLanguage,aiIncludeContext:next.aiIncludeContext,preserveDarkPaper:next.preserveDarkPaper,locale:next.locale,propertyDateFormat:next.propertyDateFormat,ocrAction:next.ocrAction,automaticOcr:next.automaticOcr,useChromeFind:next.useChromeFind,captureLinks:next.captureLinks,showFilename:next.showFilename,toolbarHidden:next.toolbarHidden};
  if(aiChanged)reader?.setAi(next);
  if(paperChanged)reader?.setDarkPaper(next.preserveDarkPaper);
  if(changed)reader?.setToolbar(next);
  if(interfaceChanged){localize(nextLocale);reader?.setInterface(nextLocale,next);}
  // Sampling, OCR languages and recognition detail stay fixed for this reader.
 }
});
window.addEventListener('pagehide',()=>{generation++;controller?.abort();reader?.destroy();reader=null;if(blobURL)URL.revokeObjectURL(blobURL);blobURL=null;if(mimeInfo)chrome.tabs.onUpdated.removeListener(sourceUpdated);});
// A history restore may revive this document after its renderer was disposed.
window.addEventListener('pageshow',event=>{if(!event.persisted)return;if(mimeInfo)chrome.tabs.onUpdated.addListener(sourceUpdated);if(original){const saved=original,name=filename;void load(async()=>({bytes:await saved.arrayBuffer(),filename:name}),name);}else if(mimeInfo)void native();else if(source)void loadSource();else setView('home');});
