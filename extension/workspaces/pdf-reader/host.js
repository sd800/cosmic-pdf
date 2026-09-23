import { readSettings, uiLocale, toolbarMode, toolbarSignature } from '../../core/settings.js';
import { sourceFromReader, READER_PATH, isPdf, filenameFrom, cleanFilename } from '../../core/source.js';
import { createPdfViewer } from '../pdf-viewer/host.js';
import { PDF_LIMITS } from '../pdf-viewer/model.js';
const $=id=>document.getElementById(id);
// This web-accessible entry point may only open as a top-level tab. Its sandbox
// is private; neither bytes nor OCR results are ever sent to a web-page parent.
if(window!==top) throw Error('Top-level reader required');
let settings=await readSettings(), locale=uiLocale(settings,chrome.i18n.getUILanguage());
function hostText(locale){return locale==='zh-CN'?{intro:'以舒适的外观阅读 PDF，按需识别扫描件中的文字。',open:'打开 PDF 文件',settings:'设置',native:'使用 Chrome 阅读器',hint:'将 PDF 拖到这里，或选择本地文件。文件不会上传。',failed:'无法打开此文件。可尝试 Chrome 阅读器或选择本地副本。',large:'文件超过 64 MB 的安全读取上限，请使用 Chrome 阅读器。',downloadFailed:'下载未能开始，请重试。',nativeFailed:'无法切换。请在设置中暂时关闭自动打开，然后重新访问原文件。'}:{intro:'Read PDFs comfortably and recognize scanned text when you need it.',open:'Open a PDF',settings:'Settings',native:'Use Chrome reader',hint:'Drop a PDF here, or choose a local file. Your documents are never uploaded.',failed:'This file could not be opened. Try the Chrome reader or choose a local copy.',large:'This file exceeds the 64 MB safe reading limit. Use the Chrome reader instead.',downloadFailed:'The download could not start. Please try again.',nativeFailed:'Could not switch. Turn off automatic opening in Settings, then revisit the original file.'}}
let text=hostText(locale);
function localize(nextLocale){
 const old=text, message=$('message').textContent;locale=nextLocale;text=hostText(locale);
 document.documentElement.lang=locale;
 for(const [id,key]of [['intro','intro'],['open-file','open'],['settings','settings'],['native','native'],['hint','hint']])$(id).textContent=text[key];
 const errorKey=Object.keys(old).find(key=>old[key]===message);if(errorKey)$('message').textContent=text[errorKey];
}
localize(locale);document.documentElement.dataset.motion=String(settings.motion);
let source=sourceFromReader(location.href,chrome.runtime.getURL(READER_PATH)), reader, original, blobURL, filename, controller, generation=0;
let activeSettings=settings,appearanceOverride=null; const media=matchMedia('(prefers-color-scheme:dark)');
function defaultDark(){return activeSettings.appearance==='dark'||(activeSettings.appearance==='auto'&&media.matches);}
function currentDark(){return appearanceOverride===null?defaultDark():appearanceOverride==='opposite'?!defaultDark():appearanceOverride;}
function applyTheme(){const dark=currentDark();document.documentElement.dataset.dark=String(dark);try{localStorage.setItem('appearance',settings.appearance);}catch{}reader?.setTheme(dark,appearanceOverride!==null,activeSettings.appearance==='auto');return dark;}
applyTheme();media.addEventListener('change',()=>{if(activeSettings.appearance==='auto')applyTheme();});
function setView(view){document.documentElement.dataset.view=view;}
function fail(message){$('message').textContent=message; setView('home');}
async function native(){if(source){const result=await chrome.runtime.sendMessage({type:'NATIVE_READER'}).catch(()=>null);if(!result?.ok){if(reader)reader.showError(text.nativeFailed);else fail(text.nativeFailed);}}else if(blobURL){try{await chrome.tabs.create({url:blobURL});}catch{reader?.showError(text.nativeFailed);}}}
function openSettings(){if(reader)void chrome.runtime.sendMessage({type:'OPEN_SETTINGS'});else location.assign(chrome.runtime.getURL('settings/index.html'));}
async function download(){if(!blobURL)return;try{await chrome.downloads.download({url:blobURL,filename,saveAs:true});}catch{if(reader)reader.showError(text.downloadFailed);else fail(text.downloadFailed);}}
$('native').onclick=native;$('settings').onclick=openSettings;$('open-file').onclick=()=>$('file').click();
$('file').onchange=()=>{const f=$('file').files[0];if(f)void openFile(f);};
window.addEventListener('dragover',event=>{event.preventDefault();});window.addEventListener('drop',event=>{event.preventDefault();const f=event.dataTransfer?.files[0];if(f)void openFile(f);});
async function readResponse(response,signal){
 if(!response.ok)throw Error('fetch');if(Number(response.headers.get('content-length'))>PDF_LIMITS.bytes)throw Error('large');
 const chunks=[];let size=0;const stream=response.body.getReader();
 try{while(true){if(signal.aborted)throw Error('abort');const {done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>PDF_LIMITS.bytes)throw Error('large');chunks.push(value);}}finally{await stream.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes.buffer;
}
async function load(loader, initialFilename='PDF'){
 const run=++generation;controller?.abort();controller=new AbortController(); const current=controller;
 reader?.destroy();reader=null;activeSettings=settings;$('reader').hidden=false;setView('loading');$('message').textContent='';
 if(blobURL)URL.revokeObjectURL(blobURL);blobURL=null;original=null;
 const deadline=setTimeout(()=>current.abort(),60000);
 try{
  // Load the isolated rendering shell and its bundled worker while fetching the PDF.
  const prepared=createPdfViewer({container:$('reader'),locale,settings,filename:cleanFilename(initialFilename),canUseNative:!!source,sampling:settings.sampling,sharpening:settings.sharpening,dark:applyTheme(),reversed:appearanceOverride!==null,automatic:activeSettings.appearance==='auto',onNative:native,onSettings:openSettings,onDownload:download,onTheme:()=>{appearanceOverride=toolbarMode(activeSettings)==='both'?!currentDark():appearanceOverride===null?'opposite':null;applyTheme();},onAuto:()=>{appearanceOverride=null;applyTheme();},onReady:()=>{if(run===generation){setView('reader');}},onError:()=>{if(run===generation&&!$('reader').querySelector('iframe')){reader=null;$('reader').hidden=true;fail(text.failed);}}});
  reader=prepared;
  const result=await loader(current.signal);if(run!==generation)return;if(!isPdf(result.bytes))throw Error('format');
  filename=cleanFilename(result.filename);original=new Blob([result.bytes],{type:'application/pdf'});blobURL=URL.createObjectURL(original);document.title=filename+' — Cosmic PDF';
  prepared.open(result.bytes,filename);
 }catch(error){if(run===generation){reader?.destroy();reader=null;$('reader').hidden=true;fail(error.message==='large'?text.large:text.failed);}}finally{clearTimeout(deadline);}
}
async function openFile(file){if(file.size>PDF_LIMITS.bytes){if(reader)reader.showError(text.large);else fail(text.large);return;}source=null;history.replaceState(null,'',chrome.runtime.getURL(READER_PATH));$('native').hidden=true;await load(async()=>({bytes:await file.arrayBuffer(),filename:file.name}),file.name);}
function loadSource(){return load(async signal=>{const response=await fetch(source,{signal,credentials:'include',cache:'default',referrerPolicy:'no-referrer'});return {bytes:await readResponse(response,signal),filename:filenameFrom(response.url||source,response.headers.get('content-disposition')||'')};},filenameFrom(source));}
if(source){$('native').hidden=false;void loadSource();}else setView('home');
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local'||!changes.settings)return;
 void readSettings().then(next=>{
  settings=next;
  const nextLocale=uiLocale(next,chrome.i18n.getUILanguage()),mode=toolbarMode(next),changed=toolbarSignature(activeSettings)!==toolbarSignature(next),dark=currentDark();
  const interfaceChanged=locale!==nextLocale||activeSettings.propertyDateFormat!==next.propertyDateFormat||activeSettings.ocrAction!==next.ocrAction||activeSettings.useChromeFind!==next.useChromeFind;
  activeSettings={...activeSettings,locale:next.locale,propertyDateFormat:next.propertyDateFormat,ocrAction:next.ocrAction,useChromeFind:next.useChromeFind,showFilename:next.showFilename,showBranding:next.showBranding,toolbarHidden:next.toolbarHidden};
  if(changed){if(appearanceOverride!==null)appearanceOverride=mode==='both'?dark:dark===defaultDark()?null:'opposite';reader?.setToolbar(next);applyTheme();}
  if(interfaceChanged){localize(nextLocale);reader?.setInterface(nextLocale,next);}
  // Sampling, OCR languages and recognition detail stay fixed for this reader.
 });
});
window.addEventListener('pagehide',()=>{generation++;controller?.abort();reader?.destroy();reader=null;if(blobURL)URL.revokeObjectURL(blobURL);blobURL=null;});
// A history restore may revive this document after its renderer was disposed.
window.addEventListener('pageshow',event=>{if(!event.persisted)return;if(original){const saved=original,name=filename;void load(async()=>({bytes:await saved.arrayBuffer(),filename:name}),name);}else if(source)void loadSource();else setView('home');});
