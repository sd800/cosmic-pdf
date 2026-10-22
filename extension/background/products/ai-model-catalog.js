import { MODEL_LIMIT, modelId, normalizeCatalog } from '../../core/ai-models.js';
import { fetchResponse, responseJson } from './ai-client.js';
const endpoints={gemini:'https://generativelanguage.googleapis.com/v1beta/models',openai:'https://api.openai.com/v1/models',claude:'https://api.anthropic.com/v1/models'};
export async function fetchModels(provider,key,{signal,fetcher=fetch}={}) {
  if(!Object.hasOwn(endpoints,provider))throw Error('invalidRequest');
  const headers={Accept:'application/json'};
  if(provider==='gemini')headers['x-goog-api-key']=key;
  else if(provider==='openai')headers.Authorization='Bearer '+key;
  else {headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';}
  let cursor='',count=0;const seen=new Set(),models=[];
  for(let page=0;page<10;page++) {
    signal.throwIfAborted();const url=new URL(endpoints[provider]);
    if(provider==='gemini'){url.searchParams.set('pageSize','200');if(cursor)url.searchParams.set('pageToken',cursor);}
    if(provider==='claude'){url.searchParams.set('limit','200');if(cursor)url.searchParams.set('after_id',cursor);}
    const response=await fetchResponse({url:url.href,init:{method:'GET',headers,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'}},signal,fetcher);
    const body=await responseJson(response,1024*1024);signal.throwIfAborted();
    const items=provider==='gemini'?body?.models:body?.data;if(!Array.isArray(items))throw Error('incomplete');
    count+=items.length;if(count>MODEL_LIMIT)throw Error('limit');
    for(const item of items) {
      if(!item||item.lifecycle==='retired')continue;
      const id=modelId(provider==='gemini'?(typeof item.name==='string'?item.name.replace(/^models\//,''):''):item.id);if(!id)continue;
      models.push({id,label:provider==='gemini'?item.displayName:provider==='claude'?item.display_name:id});
    }
    let next=provider==='gemini'?body.nextPageToken:provider==='claude'&&body.has_more?body.last_id:'';
    if(!next) {
      if(provider==='claude'&&body.has_more)throw Error('incomplete');
      return normalizeCatalog({[provider]:{models,fetchedAt:Date.now()}})[provider];
    }
    if(typeof next!=='string'||next.length>2048||/[\x00-\x1f\x7f]/.test(next)||seen.has(next))throw Error('incomplete');
    seen.add(next);cursor=next;
  }
  throw Error('limit');
}
