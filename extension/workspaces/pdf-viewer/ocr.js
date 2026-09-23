import { OCR_LIMITS, ocrRange, ocrScale, ocrWords } from './ocr-model.js';
import { createOcrWorker } from './ocr-worker-client.js';
import { AnnotationMode, PermissionFlag } from '../../vendor/pdfjs/pdf.min.mjs';
import { languageChoices } from '../../shared/ocr-languages.js';
const $=id=>document.getElementById(id);
export function createOcr({pdf,viewer,eventBus,settings,text,signal,port}){
 const cache=new Map();let active=null,generation=0,closed=false,current=1;
 const languages=languageChoices($('ocr-languages'),settings.ocrLanguages,{eng:text.ocrEnglish,chi_sim:text.ocrSimplified,chi_tra:text.ocrTraditional});$('ocr-to').max=$('ocr-from').max=pdf.numPages;
 const msg=key=>$('ocr-status').textContent=text[key];
 function showResult(page){current=Number(page);const result=cache.get(current);$('ocr-result').value=result?.text||'';$('ocr-copy').disabled=!result?.text;$('ocr-clear').disabled=!cache.size;if(result)$('ocr-result-page').value=current;}
 function updateResultChoices(){const select=$('ocr-result-page');select.replaceChildren();for(const page of [...cache.keys()].sort((a,b)=>a-b)){const option=document.createElement('option');option.value=page;option.textContent=text.page+' '+page;select.append(option);}select.disabled=!cache.size;}
 function clear(){for(const page of cache.keys())viewer.getPageView(page-1)?.div.querySelector('.ocr-text-layer')?.remove();cache.clear();updateResultChoices();showResult(viewer.currentPageNumber);msg('');}
 function busy(value){$('ocr-start').disabled=value;$('ocr-languages').disabled=value;$('ocr-from').disabled=value;$('ocr-to').disabled=value;$('ocr-cancel').hidden=!value;$('ocr-progress').hidden=!value;}
 async function release(job){if(!job)return;job.cancelled=true;job.abort.abort();job.render?.cancel();clearTimeout(job.timer);if(job.worker)await job.worker.terminate().catch(()=>{});if(job.workerURL)URL.revokeObjectURL(job.workerURL);if(job.canvas)job.canvas.width=job.canvas.height=0;}
 function stop(message='ocrCancelled'){generation++;const job=active;active=null;void release(job);busy(false);if(message)msg(message);}
 function overlay(number){
  const result=cache.get(number),view=viewer.getPageView(number-1);if(!view)return;view.div.querySelector('.ocr-text-layer')?.remove();
  if(!result||!settings.ocrOverlay||!view.canvas)return;
  const viewport=view.viewport,layer=document.createElement('div');layer.className='ocr-text-layer';layer.setAttribute('aria-label',text.ocrResult);
  // Word coordinates live in PDF space, so zoom/rotation do not require OCR again.
  const rotation=((viewport.rotation-result.rotation)%360+360)%360;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  for(const word of result.words){
   const a=viewport.convertToViewportPoint(...word.topLeft),b=viewport.convertToViewportPoint(...word.topRight),c=viewport.convertToViewportPoint(...word.bottomLeft);
   const width=Math.hypot(b[0]-a[0],b[1]-a[1]),height=Math.hypot(c[0]-a[0],c[1]-a[1]);if(width<.1||height<.1)continue;
   const span=document.createElement('span');span.textContent=word.text+' ';span.style.left=a[0]+'px';span.style.top=a[1]+'px';span.style.fontSize=height+'px';span.style.fontFamily='sans-serif';ctx.font=height+'px sans-serif';const measured=ctx.measureText(word.text).width||width;
   span.style.transform=`rotate(${rotation}deg) scaleX(${width/measured})`;layer.append(span);
  }
  view.div.append(layer);
 }
 async function run(){
  if(active)return;const range=ocrRange($('ocr-from').value,$('ocr-to').value,pdf.numPages);if(!range){msg('ocrInvalid');return;}
  const id=++generation,job={abort:new AbortController(),cancelled:false};active=job;busy(true);msg('ocrLoading');$('ocr-progress').value=0;
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
   const worker=createOcrWorker(job.workerURL,root,info=>{if(alive()&&info.status==='recognizing text')$('ocr-progress').value=(completed+Math.max(0,Math.min(1,info.progress||0)))/(range.to-range.from+1);});
   job.worker=worker;await worker.initialize(languages.value().join('+'));if(!alive())return;
   await worker.setParameters({tessedit_pageseg_mode:settings.ocrLayout,preserve_interword_spaces:'1',user_defined_dpi:'200'});
   for(let number=range.from;number<=range.to&&alive();number++){
    arm();$('ocr-status').textContent=text.ocrReading+' '+number+' / '+range.to;
    const page=await pdf.getPage(number);if(!alive())break;
    const base=page.getViewport({scale:1}),scale=ocrScale(base.width,base.height,settings.ocrQuality),raster=page.getViewport({scale});
    const canvas=document.createElement('canvas');job.canvas=canvas;canvas.width=Math.ceil(raster.width);canvas.height=Math.ceil(raster.height);
    job.render=page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport:raster,annotationMode:AnnotationMode.DISABLE,background:'rgb(255,255,255)'});await job.render.promise;job.render=null;if(!alive())break;
    const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=0;job.canvas=null;if(!image||!alive())break;
    const {data}=await worker.recognize(image,{}, {text:true,blocks:true});if(!alive())break;
    const words=ocrWords(data.blocks,raster.width,raster.height).map(word=>({text:word.text,topLeft:raster.convertToPdfPoint(word.x0,word.y0),topRight:raster.convertToPdfPoint(word.x1,word.y0),bottomLeft:raster.convertToPdfPoint(word.x0,word.y1)}));
    const result={text:String(data.text||'').slice(0,OCR_LIMITS.characters),words,rotation:raster.rotation};
    cache.delete(number);cache.set(number,result);
    // Bound all result state, not only the number of rendered layers.
    while(cache.size>20||[...cache.values()].reduce((n,r)=>n+r.words.length,0)>50000||[...cache.values()].reduce((n,r)=>n+r.text.length,0)>OCR_LIMITS.characters){const oldest=cache.keys().next().value;cache.delete(oldest);viewer.getPageView(oldest-1)?.div.querySelector('.ocr-text-layer')?.remove();}
    updateResultChoices();showResult(number);overlay(number);completed++;$('ocr-progress').value=completed/(range.to-range.from+1);
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(alive())msg(cache.get(current)?.text?'ocrDone':'ocrEmpty');
  }catch{if(alive())msg('ocrFailed');}
  finally{await release(job);if(active===job){active=null;busy(false);}}
 }
 $('ocr-toggle').onclick=()=>{const show=$('ocr-panel').hidden;$('ocr-panel').hidden=!show;document.documentElement.dataset.ocrOpen=String(show);if(show&&!active){$('ocr-from').value=$('ocr-to').value=viewer.currentPageNumber;showResult(viewer.currentPageNumber);}};
 $('ocr-close').onclick=()=>{$('ocr-panel').hidden=true;document.documentElement.dataset.ocrOpen='false';};
 $('ocr-start').onclick=()=>void run();$('ocr-cancel').onclick=()=>stop();$('ocr-clear').onclick=()=>{stop('');clear();};
 $('ocr-result-page').onchange=()=>{const n=Number($('ocr-result-page').value);viewer.currentPageNumber=n;showResult(n);};
 $('ocr-copy').onclick=()=>{if($('ocr-result').value)port.postMessage({type:'copy',text:$('ocr-result').value.slice(0,OCR_LIMITS.characters)});};
 eventBus.on('pagerendered',({pageNumber})=>overlay(pageNumber),{signal});
 eventBus.on('scalechanging',()=>{for(const number of cache.keys())overlay(number);},{signal});
 eventBus.on('pagechanging',({pageNumber})=>{if(!active){$('ocr-from').value=$('ocr-to').value=pageNumber;if(cache.has(pageNumber))showResult(pageNumber);}},{signal});
 return {destroy(){closed=true;stop('');cache.clear();}};
}
