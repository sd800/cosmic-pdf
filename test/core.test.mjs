import test from 'node:test';import assert from 'node:assert/strict';
import { DEFAULTS,normalizeSettings,uiLocale,toolbarMode } from '../extension/core/settings.js';
import { safeSource,sourceFromReader,filenameFrom,isPdf } from '../extension/core/source.js';
import { ocrScale,ocrRange,ocrWords,OCR_LIMITS } from '../extension/workspaces/pdf-viewer/ocr-model.js';
import { pdfDetailCanvasPixels,stepPdfScale,rotateLeft,safePdfLink,pdfOptions } from '../extension/workspaces/pdf-viewer/model.js';
test('settings whitelist, defaults and all six sampling levels',()=>{assert.deepEqual(normalizeSettings(null),DEFAULTS);for(let n=1;n<=6;n++)assert.equal(normalizeSettings({sampling:n}).sampling,n);assert.equal(normalizeSettings({sampling:Infinity}).sampling,4);assert.equal(normalizeSettings({sharpening:'true'}).sharpening,false);assert.equal(normalizeSettings({ocrQuality:99}).ocrQuality,2);assert.equal(normalizeSettings({locale:'zh-TW'}).locale,'auto');assert.equal(normalizeSettings({obsolete:true}).obsolete,undefined);for(const [showFilename,showBranding,mode]of [[true,true,'both'],[false,true,'branding'],[true,false,'filename'],[false,false,'none']])assert.equal(toolbarMode(normalizeSettings({showFilename,showBranding})),mode);assert.equal(toolbarMode(normalizeSettings({showFilename:'false',showBranding:null})),'both');});
test('UI supports only English/Simplified Chinese',()=>{assert.equal(uiLocale(DEFAULTS,'zh-TW'),'zh-CN');assert.equal(uiLocale(DEFAULTS,'ja'),'en-US');assert.equal(uiLocale({...DEFAULTS,locale:'en-US'},'zh-CN'),'en-US');});
test('raw DNR source preserves all signed query parameters and fragments',()=>{const reader='chrome-extension://id/workspaces/pdf-reader/index.html',source='https://example.com/a?one=1&signed=A%2BB%3D&source=2#page=2';assert.equal(sourceFromReader(reader+'?source='+source,reader),source);assert.equal(sourceFromReader('https://evil.test/?source='+source,reader),null);for(const value of ['javascript:alert(1)','data:application/pdf,abc','https://u:p@example.com/a'])assert.equal(safeSource(value),null);assert.equal(safeSource('file:///tmp/a.pdf'),'file:///tmp/a.pdf');});
test('safe filenames and PDF content sniffing',()=>{assert.equal(filenameFrom('https://e.com/download','attachment; filename*=UTF-8\'\'report%20one.pdf'),'report one.pdf');assert.equal(filenameFrom('https://e.com/abc'), 'abc.pdf');assert.equal(isPdf(new TextEncoder().encode('%PDF-1.7\n').buffer),true);assert.equal(isPdf(new TextEncoder().encode('<html>error</html>').buffer),false);});
test('bounded OCR raster, range and untrusted word geometry',()=>{for(const [w,h]of [[612,842],[20000,30000],[100,90000]]){const s=ocrScale(w,h,3);assert.ok(w*h*s*s<=OCR_LIMITS.pixels+1);assert.ok(Math.max(w,h)*s<=OCR_LIMITS.dimension);}assert.deepEqual(ocrRange(2,21,100),{from:2,to:21});for(const range of [[0,2],[1,21],[5,2],[1.1,3]])assert.equal(ocrRange(...range,100),null);assert.equal(ocrWords([{paragraphs:[{lines:[{words:[{text:'ok',bbox:{x0:1,y0:2,x1:12,y1:15}},{text:'bad',bbox:{x0:NaN}}]}]}]}],100,100).length,1);});
test('reader preserves zoom increments, safe links, readonly parser and sampling budgets',()=>{assert.equal(stepPdfScale(stepPdfScale(1,1),1),1.2);assert.equal(rotateLeft(0),270);assert.equal(safePdfLink('javascript:alert(1)'),null);assert.equal(pdfOptions(new Uint8Array(),'local:').isEvalSupported,false);assert.equal(pdfOptions(new Uint8Array(),'local:').enableXfa,false);assert.equal(pdfDetailCanvasPixels(1),1024*1024);assert.equal(pdfDetailCanvasPixels(6),36*1024*1024);});

test('OCR languages allow every nonempty combination, without implicit English',()=>{
 const languages=['eng','chi_sim','chi_tra'];
 for(let mask=1;mask<8;mask++){
  const chosen=languages.filter((_,i)=>mask&(1<<i));
  assert.deepEqual(normalizeSettings({ocrLanguages:[...chosen].reverse()}).ocrLanguages,chosen);
 }
 for(const value of [[],null,'chi_tra',['remote']])assert.deepEqual(normalizeSettings({ocrLanguages:value}).ocrLanguages,['eng']);
 assert.deepEqual(normalizeSettings({ocrLanguages:['chi_tra','remote','chi_tra']}).ocrLanguages,['chi_tra']);
 const normalized=normalizeSettings();normalized.ocrLanguages.push('chi_sim');assert.deepEqual(DEFAULTS.ocrLanguages,['eng']);
});
