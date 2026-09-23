export const OCR_LANGUAGES = Object.freeze(['eng', 'chi_sim', 'chi_tra']);
export const DEFAULT_OCR_LANGUAGES = Object.freeze(['eng', 'chi_sim']);
export function normalizeOcrLanguages(value) {
  const selected = Array.isArray(value) ? OCR_LANGUAGES.filter(language => value.includes(language)) : [];
  return selected.length ? selected : [...DEFAULT_OCR_LANGUAGES];
}
