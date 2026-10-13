// A private reader channel carries only bounded text requests and public state.
// No credential, caller-supplied endpoint or arbitrary runtime command crosses it.
import { normalizeAiRequest, aiFailure } from '../../core/ai.js';
export function createAiBridge({ onEvent, onStatus, runtime = chrome.runtime }) {
  let port = null, current = '', webPending = false, closed = false, heartbeat = null, statusRevision = 0;
  const stopHeartbeat = () => { clearInterval(heartbeat); heartbeat = null; };
  function disconnect() { stopHeartbeat(); const previous = port; port = null; current = ''; webPending=false;previous?.disconnect(); }
  async function refresh() {
    const revision = ++statusRevision;
    const result = await runtime.sendMessage({type:'AI_STATUS'}).catch(()=>null);
    if (!closed && revision === statusRevision) onStatus(result?.ok ? result.result : {keys:{},unavailable:true});
  }
  function post(event) { if (!closed) onEvent(event); }
  function request(id, request) {
    if (closed || current || typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id)) return;
    try {
      const input = normalizeAiRequest(request); current = id;
      port = runtime.connect({name:'ai-explanation'});
      const owned = port;
      owned.onMessage.addListener(message => {
        if (closed || port !== owned || message?.id !== current) return;
        if (message.type === 'delta' && typeof message.text === 'string' && message.text.length > 16000) { cancel(id); return; }
        if (!['started','delta','done','error'].includes(message.type)) return;
        post(message);
        if (message.type === 'done' || message.type === 'error') disconnect();
        if (message.type === 'error') void refresh();
      });
      owned.onDisconnect.addListener(() => {
        if (port !== owned) return; const pending = current; stopHeartbeat(); port = null; current = '';
        post({type:'error',id:pending,error:'unavailable'});
      });
      owned.postMessage({type:'explain',id,request:input});
      // Only an active user request keeps its background port alive.
      heartbeat = setInterval(()=>{if(port===owned)try{owned.postMessage({type:'heartbeat'});}catch{disconnect();post({type:'error',id,error:'unavailable'});}},10000);
    } catch(error) { disconnect(); post({type:'error',id,error:aiFailure(error)}); }
  }
  async function openWebsite(id, request, withoutPrompt=false) {
    if(closed||current||typeof id!=='string'||!/^[a-z0-9-]{1,80}$/i.test(id))return;
    try{
      const input=normalizeAiRequest(request);current=id;webPending=true;
      const result=await runtime.sendMessage({type:'AI_OPEN_WEBSITE',id,request:input,withoutPrompt:withoutPrompt===true});
      if(closed||current!==id||!webPending)return;
      disconnect();post(result?.ok?{type:'web-opened',id,...result.result}:{type:'error',id,error:result?.error||'unavailable'});
    }catch(error){if(!closed&&current===id){disconnect();post({type:'error',id,error:aiFailure(error)});}}
  }
  function cancel(id) {
    if (!current || id !== current) return;
    if(webPending)void runtime.sendMessage({type:'AI_CANCEL_WEBSITE',id}).catch(()=>{});
    disconnect(); post({type:'error',id,error:'cancelled'});
  }
  return { refresh, request, openWebsite, cancel, destroy(){if(webPending)void runtime.sendMessage({type:'AI_CANCEL_WEBSITE',id:current}).catch(()=>{});closed=true;statusRevision++;disconnect();} };
}
