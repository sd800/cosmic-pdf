import { OCR_LIMITS, ocrRange, ocrScale, ocrWords, quickOcrRange } from './ocr-model.js';
import { createOcrTextLayer } from './ocr-text-layer.js';
import { createOcrWorker } from './ocr-worker-client.js';
import { AnnotationMode, PermissionFlag } from '../../vendor/pdfjs/pdf.min.mjs';
import { languageChoices } from '../../shared/ocr-languages.js';
import { bindPressAction } from './press-action.js';
const $=id=>document.getElementById(id);
export function createOcr({pdf,viewer,eventBus,settings,text,signal}){
 const cache=new Map(),layerStates=new WeakMap();let active=null,generation=0,closed=false,action=settings.ocrAction,statusKey='',readingPage=0,readingEnd=0,hideFeedback=0,feedbackUntil=0,progress=0;
 const languages=languageChoices($('ocr-languages'),settings.ocrLanguages,{eng:text.ocrEnglish,chi_sim:text.ocrSimplified,chi_tra:text.ocrTraditional});$('ocr-to').max=$('ocr-from').max=pdf.numPages;
 function updateStatus() {
  const value=statusKey==='ocrReading'?`${text.ocrReading} ${readingPage} / ${readingEnd}`:text[statusKey]||'';
  $('ocr-status').textContent=$('ocr-feedback-status').textContent=value;
  $('ocr-feedback').hidden=!$('ocr-panel').hidden||!value||(!active&&performance.now()>=feedbackUntil);
  $('ocr-feedback-cancel').hidden=!active;
  $('ocr-feedback-progress').hidden=!active;
  $('ocr-progress').value=$('ocr-feedback-progress').value=progress;
 }
 function msg(key){statusKey=key;feedbackUntil=key?performance.now()+6000:0;updateStatus();if(!active){clearTimeout(hideFeedback);hideFeedback=setTimeout(updateStatus,6000);}}
 function clear(){for(const page of cache.keys())viewer.getPageView(page-1)?.div.querySelector('.ocr-text-layer')?.remove();cache.clear();$('ocr-clear').disabled=true;msg('');}
 function busy(value){$('ocr-start').disabled=value;$('ocr-languages').disabled=value;$('ocr-from').disabled=value;$('ocr-to').disabled=value;$('ocr-cancel').hidden=!value;$('ocr-progress').hidden=!value;$('ocr-toggle').setAttribute('aria-busy',String(value));updateStatus();if(!value&&statusKey){clearTimeout(hideFeedback);hideFeedback=setTimeout(()=>{$('ocr-feedback').hidden=true;},6000);}}
 async function release(job){if(!job)return;job.cancelled=true;job.abort.abort();job.render?.cancel();clearTimeout(job.timer);if(job.worker)await job.worker.terminate().catch(()=>{});if(job.workerURL)URL.revokeObjectURL(job.workerURL);if(job.canvas)job.canvas.width=job.canvas.height=0;}
 function stop(message='ocrCancelled'){generation++;const job=active;active=null;void release(job);busy(false);if(message)msg(message);}
 function overlay(number){
  const result=cache.get(number),view=viewer.getPageView(number-1);if(!view)return;
  const previous=view.div.querySelector('.ocr-text-layer');
  if(!result?.words.length||!view.canvas){previous?.remove();return;}
  const geometry=[...view.viewport.transform,view.viewport.width,view.viewport.height,view.viewport.rotation].join(',');
  const previousState=previous&&layerStates.get(previous);
  if(previousState?.result===result&&previousState.geometry===geometry)return;
  const layer=createOcrTextLayer(result,view.viewport);layerStates.set(layer,{result,geometry});layer.setAttribute('aria-label',text.ocrResult);
  if(!layer.childElementCount){previous?.remove();return;}
  // Publish a complete replacement at once; do not briefly expose both sources.
  if(previous)previous.replaceWith(layer);else view.div.append(layer);
 }
 async function run(requested){
  if(active){openPanel();return;}const range=requested||ocrRange($('ocr-from').value,$('ocr-to').value,pdf.numPages);if(!range){msg('ocrInvalid');return;}
  $('ocr-from').value=range.from;$('ocr-to').value=range.to;
  const id=++generation,job={abort:new AbortController(),cancelled:false};active=job;clearTimeout(hideFeedback);progress=0;busy(true);msg('ocrLoading');
  const alive=()=>!closed&&generation===id&&!job.cancelled;
  try{
   const permissions=await pdf.getPermissions();if(permissions&&!permissions.includes(PermissionFlag.COPY)){if(alive())msg('ocrNoPermission');return;}
   // An opaque worker has no extension privileges or access to network sites.
   // Its code, LSTM core and all three language models are bundled and pinned.
   const workerCode=await(await fetch(new URL('../../vendor/tesseract/worker.min.js',import.meta.url),{signal:job.abort.signal})).text();if(!alive())return;
   job.workerURL=URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'}));
   const root=new URL('../../vendor/tesseract/',import.meta.url).href;
   const arm=()=>{clearTimeout(job.timer);job.timer=setTimeout(()=>{if(alive())stop('ocrFailed');},OCR_LIMITS.timeout);};arm();
   let completed=0;
   const worker=createOcrWorker(job.workerURL,root,info=>{if(alive()&&info.status==='recognizing text'){progress=(completed+Math.max(0,Math.min(1,info.progress||0)))/(range.to-range.from+1);updateStatus();}});
   job.worker=worker;await worker.initialize(languages.value().join('+'));if(!alive())return;
   await worker.setParameters({tessedit_pageseg_mode:settings.ocrLayout,preserve_interword_spaces:'1',user_defined_dpi:'200'});
   for(let number=range.from;number<=range.to&&alive();number++){
    arm();readingPage=number;readingEnd=range.to;msg('ocrReading');
    const page=await pdf.getPage(number);if(!alive())break;
    const base=page.getViewport({scale:1}),scale=ocrScale(base.width,base.height,settings.ocrQuality),raster=page.getViewport({scale});
    const canvas=document.createElement('canvas');job.canvas=canvas;canvas.width=Math.ceil(raster.width);canvas.height=Math.ceil(raster.height);
    job.render=page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport:raster,annotationMode:AnnotationMode.DISABLE,background:'rgb(255,255,255)'});await job.render.promise;job.render=null;if(!alive())break;
    const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=0;job.canvas=null;if(!image||!alive())break;
    const {data}=await worker.recognize(image,{}, {text:true,blocks:true});if(!alive())break;
    const words=ocrWords(data.blocks,raster.width,raster.height).map(word=>({text:word.text,line:word.line,separator:word.separator,topLeft:raster.convertToPdfPoint(word.x0,word.y0),topRight:raster.convertToPdfPoint(word.x1,word.y0),bottomLeft:raster.convertToPdfPoint(word.x0,word.y1)}));
    const result={characters:words.reduce((count,word)=>count+word.text.length,0),words,rotation:raster.rotation};
    cache.delete(number);if(words.length)cache.set(number,result);
    // Bound all result state, not only the number of rendered layers.
    while(cache.size>20||[...cache.values()].reduce((n,r)=>n+r.words.length,0)>50000||[...cache.values()].reduce((n,r)=>n+r.characters,0)>OCR_LIMITS.characters){const oldest=cache.keys().next().value;cache.delete(oldest);viewer.getPageView(oldest-1)?.div.querySelector('.ocr-text-layer')?.remove();}
    $('ocr-clear').disabled=!cache.size;overlay(number);completed++;progress=completed/(range.to-range.from+1);updateStatus();
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(alive())msg([...cache].some(([number,result])=>number>=range.from&&number<=range.to&&result.words.length)?'ocrDone':'ocrEmpty');
  }catch{if(alive())msg('ocrFailed');}
  finally{await release(job);if(active===job){active=null;busy(false);}}
 }
 function openPanel(){
  $('ocr-panel').hidden=false;document.documentElement.dataset.ocrOpen='true';
  if(!active)$('ocr-from').value=$('ocr-to').value=viewer.currentPageNumber;
  updateStatus();
 }
 function activate(){
  if(action==='panel'){
   if($('ocr-panel').hidden)openPanel();else closePanel();
  }else void run(quickOcrRange(action,viewer.currentPageNumber,pdf.numPages));
 }
 function closePanel(){$('ocr-panel').hidden=true;document.documentElement.dataset.ocrOpen='false';updateStatus();}
 bindPressAction($('ocr-toggle'),{click:activate,hold:openPanel,canHold:()=>action!=='panel',signal});
 $('ocr-close').onclick=closePanel;
 $('ocr-start').onclick=()=>void run();$('ocr-cancel').onclick=$('ocr-feedback-cancel').onclick=()=>stop();$('ocr-clear').onclick=()=>{stop('');clear();};
 eventBus.on('pagerendered',({pageNumber})=>overlay(pageNumber),{signal});
 eventBus.on('scalechanging',()=>{for(const number of cache.keys())overlay(number);},{signal});
 eventBus.on('pagechanging',({pageNumber})=>{if(!active)$('ocr-from').value=$('ocr-to').value=pageNumber;},{signal});
 return {
  openPanel,
  setInterface(nextAction){
   action=nextAction;
   const names={eng:text.ocrEnglish,chi_sim:text.ocrSimplified,chi_tra:text.ocrTraditional};
   for(const input of $('ocr-languages').querySelectorAll('input'))input.nextElementSibling.textContent=names[input.value];
   for(const layer of document.querySelectorAll('.ocr-text-layer'))layer.setAttribute('aria-label',text.ocrResult);
   updateStatus();
  },
  destroy(){closed=true;stop('');clearTimeout(hideFeedback);for(const number of cache.keys())viewer.getPageView(number-1)?.div.querySelector('.ocr-text-layer')?.remove();cache.clear();}
 };
}
