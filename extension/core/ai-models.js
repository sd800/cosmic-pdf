import { AI_PROVIDERS } from './ai.js';
export const AI_MODEL_CATALOG_KEY = 'ai-model-catalogs';
export const MODEL_LIMIT = 1000;
export function modelId(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value) ? value : ''; }
// Dedicated media generators are not explanation models; accepting visual
// inputs alone is deliberately not an exclusion criterion.
export function excludedMediaModel(provider,id,label='') {
  const name=typeof label==='string'?label:'';
  if(/(?:^|[\s._-])nano[\s._-]*banana(?:$|[\s._-]|\d)/i.test(id+' '+name))return true;
  if(/^(?:gpt-image|chatgpt-image|dall-e|imagen|veo|sora)(?:$|[-_.])/i.test(id))return true;
  if(provider==='gemini'&&(/^gemini-.*-image(?:$|[-_.])/i.test(id)&&!/-image-(?:input|understanding|analysis|vision)(?:$|-)/i.test(id)||/^gemini-omni-\d+(?:\.\d+)*-flash(?:$|-)/i.test(id)))return true;
  return /^(?:dall[\s.·_-]*e|gpt[\s._-]+image|imagen|veo|sora)(?:$|[\s._-]|\d)/i.test(name)||/(?:^|[\s._-])(?:image|video)[\s._-]+(?:generation|generator)(?:$|[\s._-])/i.test(id+' '+name);
}
export function normalizeAiModels(value) {
  return Object.fromEntries(Object.entries(AI_PROVIDERS).map(([provider,config])=>[provider,modelId(value?.[provider])||config.id]));
}
export function selectedModel(settings, provider = settings.aiProvider) { return normalizeAiModels(settings.aiModels)[provider]; }
export function modelLabel(provider,id,models=[]) { return id===AI_PROVIDERS[provider]?.id ? AI_PROVIDERS[provider].model : models.find(item=>item.id===id)?.label||id; }
export function recommendedModel(provider,item) {
  const family={gemini:/(?:^|[\s._-])flash[\s_-]*lite(?:$|[\s._-])/i,openai:/(?:^|[\s._-])luna(?:$|[\s._-])/i,claude:/(?:^|[\s._-])haiku(?:$|[\s._-])/i}[provider];
  return !!family && family.test(item.id+' '+item.label);
}
export function normalizeCatalog(value) {
  const result={};
  for(const provider of Object.keys(AI_PROVIDERS)) {
    const entry=value?.[provider];if(!Array.isArray(entry?.models)||!Number.isSafeInteger(entry.fetchedAt)||entry.fetchedAt<=0)continue;
    const seen=new Set(),models=[],excludedModels=[],excluded=new Set(Array.isArray(entry.excludedIds)?entry.excludedIds.slice(0,MODEL_LIMIT).map(modelId).filter(Boolean):[]);
    const candidates=entry.models.slice(0,MODEL_LIMIT).concat(Array.isArray(entry.excludedModels)?entry.excludedModels.slice(0,MODEL_LIMIT):[]);
    for(const item of candidates) {
      const id=modelId(item?.id);if(!id||seen.has(id))continue;seen.add(id);
      const label=typeof item.label==='string'?item.label.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,160):id;
      if(excludedMediaModel(provider,id,label)||excluded.has(id)){excluded.add(id);excludedModels.push({id,label:label||id});}else models.push({id,label:label||id});
    }
    result[provider]={models,fetchedAt:entry.fetchedAt,...(excluded.size?{excludedIds:[...excluded].slice(0,MODEL_LIMIT),excludedModels:excludedModels.slice(0,MODEL_LIMIT)}:{})};
  }
  return result;
}
