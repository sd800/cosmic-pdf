import { AI_PROVIDERS } from './ai.js';
export const AI_MODEL_CATALOG_KEY = 'ai-model-catalogs';
export const MODEL_LIMIT = 1000;
export function modelId(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value) ? value : ''; }
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
    const seen=new Set(),models=[];
    for(const item of entry.models.slice(0,MODEL_LIMIT)) {
      const id=modelId(item?.id);if(!id||seen.has(id))continue;seen.add(id);
      const label=typeof item.label==='string'?item.label.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,160):id;
      models.push({id,label:label||id});
    }
    result[provider]={models,fetchedAt:entry.fetchedAt};
  }
  return result;
}
