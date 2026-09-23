import { OCR_LANGUAGES, normalizeOcrLanguages } from '../core/ocr-languages.js';
// Shared by Settings and the sandbox reader. The last language cannot be cleared.
export function languageChoices(fieldset, selected, labels, onChange = () => {}) {
  const options = document.createElement('div');
  options.className = 'language-options';
  const initial = normalizeOcrLanguages(selected);
  const inputs = OCR_LANGUAGES.map(language => {
    const label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
    input.type = 'checkbox'; input.value = language; input.checked = initial.includes(language);
    text.textContent = labels[language]; label.append(input, text); options.append(label);
    input.addEventListener('change', () => {
      if (!inputs.some(item => item.checked)) input.checked = true;
      else onChange(value());
      update();
    });
    return input;
  });
  function value() { return inputs.filter(input => input.checked).map(input => input.value); }
  function update() {
    const only = value().length === 1;
    for (const input of inputs) {
      if (only && input.checked) input.setAttribute('aria-disabled', 'true');
      else input.removeAttribute('aria-disabled');
    }
  }
  fieldset.append(options); update();
  return {value};
}
