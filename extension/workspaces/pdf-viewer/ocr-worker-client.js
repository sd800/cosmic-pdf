// Small adapter for the pinned Tesseract.js 6 worker protocol. Unlike the public
// createWorker promise, ownership is immediate: Cancel also stops model loading.
export function createOcrWorker(url, root, onProgress, WorkerClass=Worker) {
 const worker=new WorkerClass(url),pending=new Map();let serial=0,closed=false;
 function terminate(){if(closed)return Promise.resolve();closed=true;worker.terminate();for(const job of pending.values())job.reject(Error('OCR stopped'));pending.clear();return Promise.resolve();}
 worker.onmessage=({data})=>{
  if(closed||!data)return;
  if(data.status==='progress'){onProgress(data.data);return;}
  const job=pending.get(data.jobId);if(!job)return;pending.delete(data.jobId);
  if(data.status==='resolve')job.resolve({data:data.data});else job.reject(Error('OCR failed'));
 };
 worker.onerror=()=>{void terminate();};
 function send(action,payload){if(closed)return Promise.reject(Error('OCR stopped'));return new Promise((resolve,reject)=>{const jobId=String(++serial);pending.set(jobId,{resolve,reject});worker.postMessage({workerId:'cosmic-pdf-ocr',jobId,action,payload});});}
 return {terminate,
  async initialize(langs){await send('load',{options:{lstmOnly:true,corePath:root+'core',logging:false}});await send('loadLanguage',{langs,options:{langPath:root+'lang',gzip:true,cacheMethod:'none',lstmOnly:true}});await send('initialize',{langs,oem:1,config:{}});},
  setParameters(params){return send('setParameters',{params});},
  async recognize(blob,options={},output={text:true,blocks:true}){const image=new Uint8Array(await blob.arrayBuffer());return send('recognize',{image,options,output});}
 };
}
