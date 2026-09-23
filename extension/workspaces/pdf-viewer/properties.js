import { PDFDateString } from '../../vendor/pdfjs/pdf.min.mjs';
import { pdfFileSize } from './model.js';

// Metadata is untrusted text, never markup. This module and its one cached
// metadata request are created only when the user asks for document properties.
export function createProperties({ pdf, viewer, filename, byteLength, locale, text, signal }) {
  const dialog = document.getElementById('properties-dialog');
  const list = document.getElementById('properties-list'), status = document.getElementById('properties-status');
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  let metadata, generation = 0;
  const fields = new Map();
  for (const key of ['fileName', 'fileSize', 'documentTitle', 'author', 'subject', 'keywords', 'created', 'modified', 'application', 'producer', 'pdfVersion', 'pageCount', 'pageSize', 'fastWebView']) {
    const name = document.createElement('dt'), value = document.createElement('dd');
    name.textContent = text[key]; value.dataset.property = key;
    list.append(name, value); fields.set(key, value);
  }
  function set(key, value) {
    fields.get(key).textContent = typeof value === 'string' && value.trim() ? value.slice(0, 4096) : '—';
  }
  function date(value) {
    const parsed = PDFDateString.toDateObject(value);
    return parsed && Number.isFinite(parsed.getTime()) ? dates.format(parsed) : '';
  }
  document.getElementById('properties-close').addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('close', () => { generation++; }, { signal });
  return {
    async open() {
      if (signal.aborted || dialog.open) return;
      const run = ++generation, pageNumber = viewer.currentPageNumber;
      for (const key of fields.keys()) set(key, '');
      set('fileName', filename); set('fileSize', pdfFileSize(byteLength, locale)); set('pageCount', numbers.format(pdf.numPages));
      status.textContent = text.propertiesLoading; dialog.showModal();
      const [result, page] = await Promise.all([
        metadata ||= pdf.getMetadata().catch(() => null),
        pdf.getPage(pageNumber).catch(() => null)
      ]);
      if (signal.aborted || run !== generation || !dialog.open) return;
      const info = result?.info || {}, xmp = result?.metadata;
      const title = info.Title || xmp?.get('dc:title');
      const author = info.Author || xmp?.get('dc:creator');
      set('documentTitle', title); set('author', Array.isArray(author) ? author.slice(0, 50).join(', ') : author);
      for (const [key, source] of [['subject', 'Subject'], ['keywords', 'Keywords'], ['application', 'Creator'], ['producer', 'Producer'], ['pdfVersion', 'PDFFormatVersion']]) set(key, info[source]);
      set('created', date(info.CreationDate)); set('modified', date(info.ModDate));
      set('fastWebView', typeof info.IsLinearized === 'boolean' ? text[info.IsLinearized ? 'yes' : 'no'] : '');
      if (page) {
        // Include the PDF's own rotation/UserUnit, not temporary toolbar rotation.
        const { width, height } = page.getViewport({ scale: 1, rotation: page.rotate });
        const mm = locale === 'zh-CN', unit = mm ? 'mm' : 'in', factor = mm ? 25.4 / 72 : 1 / 72;
        set('pageSize', `${numbers.format(width * factor)} × ${numbers.format(height * factor)} ${unit} (${text.page} ${pageNumber})`);
      }
      status.textContent = result && page ? '' : text.propertiesUnavailable;
    }
  };
}
