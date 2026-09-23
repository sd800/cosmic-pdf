export const OCR_LANGUAGES = Object.freeze(['eng', 'chi_sim', 'chi_tra']);
export function normalizeOcrLanguages(value) {
  const selected = Array.isArray(value) ? OCR_LANGUAGES.filter(language => value.includes(language)) : [];
  return selected.length ? selected : ['eng'];
}
