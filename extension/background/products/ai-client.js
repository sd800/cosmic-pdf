import { modelId } from '../../core/ai-models.js';
import { AI_PROVIDERS, AI_LIMITS } from '../../core/ai.js';
export function providerRequest(provider, key, system, messages, model) {
  const config = AI_PROVIDERS[provider]; if (!config) throw Error('invalidRequest');
  const id=model===undefined?config.id:modelId(model);if(!id)throw Error('invalidRequest');
  const original=id===config.id;
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  let body;
  if (provider === 'openai') {
    headers.Authorization = 'Bearer ' + key;
    body = { model: id, instructions: system, input: messages, stream: true, store: false, max_output_tokens: 2048, ...(original?{reasoning:{effort:'none'}}:{}) };
  } else if (provider === 'gemini') {
    headers['x-goog-api-key'] = key;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 2048, ...(original?{thinkingConfig:{thinkingLevel:'minimal'}}:{}) } };
  } else {
    headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = { model: id, system, messages, stream: true, max_tokens: 2048, ...(original?{thinking:{type:'disabled'}}:{}) };
  }
  return { url: provider==='gemini'&&!original?`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:streamGenerateContent?alt=sse`:config.endpoint, init: { method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit',
    redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' } };
}
// Consume bounded diagnostics locally. Never publish provider messages, key
// fragments, request IDs, URLs or arbitrary response fields to the UI/logs.
export async function responseJson(response, maxBytes = 16384) {
  if (!response.body) return null;
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {
    for (;;) { const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)return null;chunks.push(value); }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch{return null;}
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function providerFailure(status, data) {
  const error=data?.error||data?.response?.error||{},codes=new Set([error.type,error.code,error.status,
    ...(Array.isArray(error.details)?error.details.slice(0,20).map(d=>d?.reason):[])].filter(v=>typeof v==='string'));
  if([...codes].some(c=>['API_KEY_INVALID','API_KEY_EXPIRED','API_KEY_NOT_FOUND','UNAUTHENTICATED','invalid_api_key','authentication_error'].includes(c))||status===401)return 'auth';
  if(codes.has('SERVICE_DISABLED'))return 'serviceDisabled';
  if(codes.has('FAILED_PRECONDITION')||codes.has('failed_precondition')||status===402)return 'accountSetup';
  if([...codes].some(c=>['model_not_found','NOT_FOUND','not_found_error'].includes(c))||status===404)return 'modelUnavailable';
  if(codes.has('insufficient_quota')||codes.has('RESOURCE_EXHAUSTED')||codes.has('rate_limit_error')||status===429)return 'quota';
  if(status===403||codes.has('PERMISSION_DENIED')||codes.has('permission_error')||[...codes].some(c=>/^API_KEY_.*_BLOCKED$/.test(c)))return 'access';
  if(status===400||status===422||codes.has('invalid_request_error')||codes.has('INVALID_ARGUMENT')||codes.has('unsupported_parameter'))return 'requestRejected';
  if(status===408||status===504)return 'timeout';
  if(status>=500||codes.has('overloaded_error')||codes.has('api_error'))return 'service';
  return 'unavailable';
}
export async function fetchResponse(request,signal,fetcher){
  signal.throwIfAborted();let response;
  try{response=await fetcher(request.url,{...request.init,signal});}catch{signal.throwIfAborted();throw Error('network');}
  if(!response.ok)throw Error(providerFailure(response.status,await responseJson(response)));
  return response;
}
export async function testConnection(provider,key,{signal,fetcher=fetch,model}){
  const request=providerRequest(provider,key,'Reply with the single word OK.',[{role:'user',content:'Test connection.'}],model),body=JSON.parse(request.init.body);
  request.init.headers.Accept='application/json';const outputLimit=!model||model===AI_PROVIDERS[provider].id?32:1024;
  if(provider==='gemini'){
    request.url=request.url.replace(':streamGenerateContent?alt=sse',':generateContent');body.generationConfig.maxOutputTokens=outputLimit;
  }else{body.stream=false;if(provider==='openai')body.max_output_tokens=outputLimit;else body.max_tokens=outputLimit;}
  request.init.body=JSON.stringify(body);
  const response=await fetchResponse(request,signal,fetcher),data=await responseJson(response,65536);signal.throwIfAborted();
  if(!data)throw Error('incomplete');if(data.error||data.status==='failed')throw Error(providerFailure(0,data));
  let text='';
  if(provider==='gemini'){
    if(data.promptFeedback?.blockReason)throw Error('blocked');
    text=(data.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
  }else if(provider==='openai')text=(data.output||[]).flatMap(item=>item.type==='message'?item.content||[]:[]).filter(p=>p.type==='output_text'&&typeof p.text==='string').map(p=>p.text).join('');
  else text=(data.content||[]).filter(p=>p.type==='text'&&typeof p.text==='string').map(p=>p.text).join('');
  if(!text.trim())throw Error('empty');
}
export async function streamExplanation(provider, key, prompt, { signal, onText, fetcher = fetch, model }) {
  const request = providerRequest(provider, key, prompt.system, prompt.messages, model);
  const response = await fetchResponse(request,signal,fetcher);
  if (!response.body || !/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get('content-type')||'')) { await response.body?.cancel().catch(() => {}); throw Error('incomplete'); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '', bytes = 0, completed = false;
  function event(raw) {
    if (raw.length > AI_LIMITS.event) throw Error('limit');
    const data = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let item; try { item = JSON.parse(data); } catch { throw Error('incomplete'); }
    if (item.error || ['error','response.failed'].includes(item.type)) throw Error(providerFailure(0,item));
    let delta = '';
    if (provider === 'openai') {
      if (item.type === 'response.output_text.delta') delta = item.delta || '';
      if (item.type === 'response.refusal.delta') throw Error('blocked');
      if (item.type === 'response.completed') completed = true;
      if (item.type === 'response.incomplete') throw Error('limit');
    } else if (provider === 'claude') {
      if (item.type === 'content_block_start' && item.content_block?.type === 'text') delta = item.content_block.text || '';
      if (item.type === 'content_block_delta' && item.delta?.type === 'text_delta') delta = item.delta.text || '';
      if (item.type === 'message_delta' && item.delta?.stop_reason === 'max_tokens') throw Error('limit');
      if (item.type === 'message_stop') completed = true;
    } else {
      if (item.promptFeedback?.blockReason) throw Error('blocked');
      const candidate = item.candidates?.[0];
      delta = (candidate?.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
      if (candidate?.finishReason) {
        if (candidate.finishReason !== 'STOP') throw Error(candidate.finishReason === 'MAX_TOKENS' ? 'limit' : 'blocked');
        completed = true;
      }
    }
    if (typeof delta !== 'string') throw Error('unavailable');
    if (delta) { text += delta; if (text.length > AI_LIMITS.output) throw Error('limit'); onText(delta); }
  }
  try {
    while (true) {
      signal.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > AI_LIMITS.stream) throw Error('limit');
      buffer += decoder.decode(chunk.value, { stream: true });
      // Normalize CRLF only after a complete line arrives (chunks can split CR/LF).
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary; while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); event(raw);
      }
      if (buffer.length > AI_LIMITS.event) throw Error('limit');
    }
    buffer += decoder.decode(); if (buffer.trim()) event(buffer);
    signal.throwIfAborted();
    if (!completed) throw Error('incomplete');
    if (!text.trim()) throw Error('empty');
    return text;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
