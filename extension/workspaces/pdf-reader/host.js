import { readSettings, uiLocale } from '../../core/settings.js';
import { sourceFromReader, READER_PATH, isPdf, filenameFrom, cleanFilename } from '../../core/source.js';
import { createPdfViewer } from '../pdf-viewer/host.js';
import { PDF_LIMITS } from '../pdf-viewer/model.js';
const $=id=>document.getElementById(id);
// This web-accessible entry point may only open as a top-level tab. Its sandbox
// is private; neither bytes nor OCR results are ever sent to a web-page parent.
if(window!==top) throw Error('Top-level reader required');
let settings=await readSettings(), locale=uiLocale(settings,chrome.i18n.getUILanguage());
const zh=locale==='zh-CN', text=zh?{intro:'以舒适的外观阅读 PDF，按需识别扫描件中的文字。',open:'打开 PDF 文件',settings:'设置',native:'使用 Chrome 阅读器',hint:'将 PDF 拖到这里，或选择本地文件。文件不会上传。',loading:'正在打开 PDF…',failed:'无法打开此文件。可尝试 Chrome 阅读器或选择本地副本。',large:'文件超过 64 MB 的安全读取上限，请使用 Chrome 阅读器。',downloadFailed:'下载未能开始，请重试。',nativeFailed:'无法切换。请在设置中暂时关闭自动打开，然后重新访问原文件。'}:{intro:'Read PDFs comfortably and recognize scanned text when you need it.',open:'Open a PDF',settings:'Settings',native:'Use Chrome reader',hint:'Drop a PDF here, or choose a local file. Your documents are never uploaded.',loading:'Opening PDF…',failed:'This file could not be opened. Try the Chrome reader or choose a local copy.',large:'This file exceeds the 64 MB safe reading limit. Use the Chrome reader instead.',downloadFailed:'The download could not start. Please try again.',nativeFailed:'Could not switch. Turn off automatic opening in Settings, then revisit the original file.'};
document.documentElement.lang=locale; $('intro').textContent=text.intro;$('open-file').textContent=text.open;$('settings').textContent=text.settings;$('native').textContent=text.native;$('hint').textContent=text.hint;
let source=sourceFromReader(location.href,chrome.runtime.getURL(READER_PATH)), reader, original, blobURL, filename, controller, generation=0;
let appearance=settings.appearance; const media=matchMedia('(prefers-color-scheme:dark)');
function applyTheme(){const dark=appearance==='dark'||(appearance==='auto'&&media.matches);document.documentElement.dataset.dark=String(dark);try{localStorage.setItem('appearance',appearance);}catch{}reader?.setTheme(dark,appearance==='auto');return dark;}
applyTheme();media.addEventListener('change',()=>{if(appearance==='auto')applyTheme();});
function fail(message){$('message').textContent=message; $('loading').hidden=true; $('welcome').hidden=false;}
async function native(){if(source){const result=await chrome.runtime.sendMessage({type:'NATIVE_READER'}).catch(()=>null);if(!result?.ok){if(reader)reader.showError(text.nativeFailed);else fail(text.nativeFailed);}}else if(blobURL){try{await chrome.tabs.create({url:blobURL});}catch{reader?.showError(text.nativeFailed);}}}
function openSettings(){void chrome.runtime.sendMessage({type:'OPEN_SETTINGS'});}
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
async function load(loader){
 const run=++generation;controller?.abort();controller=new AbortController(); const current=controller;
 reader?.destroy();reader=null;$('reader').hidden=true;$('welcome').hidden=false;$('loading').hidden=false;$('message').textContent=text.loading;
 if(blobURL)URL.revokeObjectURL(blobURL);blobURL=null;original=null;
 const deadline=setTimeout(()=>current.abort(),60000);
 try{const result=await loader(current.signal);if(run!==generation)return; if(!isPdf(result.bytes))throw Error('format');
  filename=cleanFilename(result.filename);original=new Blob([result.bytes],{type:'application/pdf'});blobURL=URL.createObjectURL(original);document.title=filename+' — Cosmic PDF';
  $('reader').hidden=false;$('welcome').hidden=true;
  reader=createPdfViewer({container:$('reader'),bytes:result.bytes,filename,locale,settings,sampling:settings.sampling,sharpening:settings.sharpening,dark:applyTheme(),automatic:appearance==='auto',onNative:native,onSettings:openSettings,onDownload:download,onTheme:()=>{appearance=document.documentElement.dataset.dark==='true'?'light':'dark';applyTheme();},onAuto:()=>{appearance=settings.appearance;applyTheme();},onError:()=>{ if(!$('reader').querySelector('iframe')) { $('reader').hidden=true;fail(text.failed); } }});
 }catch(error){if(run===generation){$('reader').hidden=true;fail(error.message==='large'?text.large:text.failed);}}finally{clearTimeout(deadline);if(run===generation)$('loading').hidden=true;}
}
async function openFile(file){if(file.size>PDF_LIMITS.bytes){fail(text.large);return;}source=null;history.replaceState(null,'',chrome.runtime.getURL(READER_PATH));$('native').hidden=true;await load(async()=>({bytes:await file.arrayBuffer(),filename:file.name}));}
if(source){$('native').hidden=false;void load(async signal=>{const response=await fetch(source,{signal,credentials:'include',cache:'default',referrerPolicy:'no-referrer'});return {bytes:await readResponse(response,signal),filename:filenameFrom(response.url||source,response.headers.get('content-disposition')||'')};});}
chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local'||!changes.settings)return;void readSettings().then(next=>{settings=next;/* Open readers retain rendering/OCR preferences. */});});
window.addEventListener('pagehide',()=>{generation++;controller?.abort();reader?.destroy();if(blobURL)URL.revokeObjectURL(blobURL);},{once:true});
