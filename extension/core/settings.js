import { normalizeOcrLanguages } from './ocr-languages.js';
export const DEFAULTS = Object.freeze({ enabled:true, locale:'auto', appearance:'auto', sampling:4, sharpening:false,
  zoom:'1', gap:16, showFilename:true, showBranding:true, sidebar:false, links:true, motion:true, darkStrength:.96,
  ocrLanguages:Object.freeze(['eng']), ocrQuality:2, ocrLayout:'3', ocrOverlay:true });
const choices = { locale:['auto','en-US','zh-CN'], appearance:['auto','light','dark'], sampling:[1,2,3,4,5,6],
  zoom:['page-width','page-fit','.5','.75','1','1.25','1.5','2'], gap:[8,16,24,32], darkStrength:[.85,.9,.96,1],
  ocrQuality:[1.5,2,3], ocrLayout:['3','6','11'] };
export function normalizeSettings(input={}) {
  const result={...DEFAULTS};
  for(const [key,fallback] of Object.entries(DEFAULTS)) {
    const value=input?.[key];
    if(typeof fallback==='boolean' ? typeof value==='boolean' : choices[key]?.includes(value)) result[key]=value;
  }
  result.ocrLanguages=normalizeOcrLanguages(input?.ocrLanguages);
  return result;
}
export async function readSettings(){return normalizeSettings((await chrome.storage.local.get('settings')).settings);}
export function uiLocale(settings, browserLocale='en-US'){return settings.locale==='auto' ? (/^zh/i.test(browserLocale)?'zh-CN':'en-US') : settings.locale;}

export function toolbarMode(settings){return settings.showFilename ? (settings.showBranding ? 'both' : 'filename') : (settings.showBranding ? 'branding' : 'none');}
