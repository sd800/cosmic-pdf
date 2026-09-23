import test from 'node:test';import assert from 'node:assert/strict';
import { DEFAULTS,normalizeSettings,uiLocale,toolbarMode,TOOLBAR_ACTIONS,hiddenToolbarActions } from '../extension/core/settings.js';
import { formatPdfDate,parsePdfDate } from '../extension/workspaces/pdf-viewer/document-dates.js';
import { safeSource,sourceFromReader,filenameFrom,isPdf } from '../extension/core/source.js';
import { ocrScale,ocrRange,ocrWords,OCR_LIMITS,quickOcrRange } from '../extension/workspaces/pdf-viewer/ocr-model.js';
import { pdfDetailCanvasPixels,stepPdfScale,rotateLeft,safePdfLink,pdfOptions,pdfFileSize,parsePdfZoom } from '../extension/workspaces/pdf-viewer/model.js';
test('settings whitelist, defaults and all six sampling levels',()=>{assert.deepEqual(normalizeSettings(null),DEFAULTS);assert.equal(DEFAULTS.useChromeFind,true);for(const useChromeFind of [true,false])assert.equal(normalizeSettings({useChromeFind}).useChromeFind,useChromeFind);assert.equal(normalizeSettings({useChromeFind:'false'}).useChromeFind,true);for(let n=1;n<=6;n++)assert.equal(normalizeSettings({sampling:n}).sampling,n);assert.equal(normalizeSettings({sampling:Infinity}).sampling,4);assert.equal(normalizeSettings({sharpening:'true'}).sharpening,false);assert.equal(normalizeSettings({ocrQuality:99}).ocrQuality,2);assert.equal(normalizeSettings({locale:'zh-TW'}).locale,'auto');assert.equal(normalizeSettings({obsolete:true}).obsolete,undefined);for(const [showFilename,showBranding,mode]of [[true,true,'both'],[false,true,'branding'],[true,false,'filename'],[false,false,'none']])assert.equal(toolbarMode(normalizeSettings({showFilename,showBranding})),mode);assert.equal(toolbarMode(normalizeSettings({showFilename:'false',showBranding:null})),'none');});
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
 for(const value of [[],null,'chi_tra',['remote']])assert.deepEqual(normalizeSettings({ocrLanguages:value}).ocrLanguages,['eng','chi_sim']);
 assert.deepEqual(normalizeSettings({ocrLanguages:['chi_tra','remote','chi_tra']}).ocrLanguages,['chi_tra']);
 const normalized=normalizeSettings();normalized.ocrLanguages.push('chi_tra');assert.deepEqual(DEFAULTS.ocrLanguages,['eng','chi_sim']);
});

test('document properties use decimal sizes and bounded valid byte counts',()=>{
 assert.equal(pdfFileSize(1),'1 byte');assert.equal(pdfFileSize(999),'999 bytes');assert.equal(pdfFileSize(1234),'1.2 KB');assert.equal(pdfFileSize(1200000),'1.2 MB');assert.equal(pdfFileSize(12,'zh-CN'),'12 字节');assert.equal(pdfFileSize(NaN),'');assert.equal(pdfFileSize(-1),'');
});

test('toolbar defaults stay consistent across layouts while explicit choices win',()=>{
 assert.deepEqual(hiddenToolbarActions(normalizeSettings()),['find','paging','fit','print','properties','native']);
 for(const flags of [{showFilename:true},{showBranding:true},{showFilename:true,showBranding:true}])assert.deepEqual(hiddenToolbarActions(normalizeSettings(flags)),['find','paging','fit','print','properties','native']);
 const settings=normalizeSettings({toolbarHidden:{find:false,rotate:true,script:true,fit:'true'}});
 assert.deepEqual(settings.toolbarHidden,{find:false,rotate:true});
 assert.deepEqual(hiddenToolbarActions(settings),['paging','fit','rotate','print','properties','native']);
 assert.deepEqual(hiddenToolbarActions({...settings,showFilename:true}),['paging','fit','rotate','print','properties','native']);
 assert.deepEqual(hiddenToolbarActions(normalizeSettings({toolbarHidden:Object.fromEntries(TOOLBAR_ACTIONS.map(key=>[key,false]))})),[]);
 settings.toolbarHidden.print=false;assert.deepEqual(DEFAULTS.toolbarHidden,{});
});
test('zoom input accepts percent or bare decimals and keeps rendering bounds',()=>{
 for(const input of ['125','125%',' 125 % '])assert.equal(parsePdfZoom(input),1.25);
 assert.equal(parsePdfZoom('37.5'),.375);assert.equal(parsePdfZoom('5'),.25);assert.equal(parsePdfZoom('600'),5);
 for(const input of ['', '0','-25','12abc','1e2','Infinity','50%%'])assert.equal(parsePdfZoom(input),null);
});

test('document date formats preserve source wall time and explicit offsets',()=>{
 assert.equal(formatPdfDate("D:20250610181400+08'00'",'zh-CN'),'2025 年 6 月 10 日 18:14:00 (UTC+8)');
 assert.equal(formatPdfDate('D:20250610181400','zh-CN'),'2025 年 6 月 10 日 18:14:00');
 for(const [offset,zone] of [['+0800','UTC+8'],['-0500','UTC-5'],['-0030','UTC-0:30'],['+1245','UTC+12:45'],['+0000','UTC+0']])assert.equal(formatPdfDate('D:202506101814'+offset,'en-US','ymd'),`2025-06-10 18:14 (${zone})`);
 assert.equal(formatPdfDate('D:20250610181400Z','en-US'),'Jun 10, 2025, 6:14:00 PM (UTC)');
 for(const [format,expected]of [['ymd','2025-06-10'],['ymd-slash','2025/06/10'],['dmy','10/06/2025'],['mdy','06/10/2025']])assert.equal(formatPdfDate("D:20250610181400-03'30'",'en-US',format),expected+' 18:14:00 (UTC-3:30)');
 assert.equal(formatPdfDate('D:202502','zh-CN'),'2025 年 2 月 1 日 00:00');
 assert.equal(formatPdfDate('D:202506101814','zh-CN'),'2025 年 6 月 10 日 18:14');
 assert.equal(formatPdfDate('D:20250610181439','zh-CN'),'2025 年 6 月 10 日 18:14:39');
 assert.equal(formatPdfDate('D:202506101814','en-US'),'Jun 10, 2025, 6:14 PM');
 assert.equal(formatPdfDate('D:20250610181439','en-US'),'Jun 10, 2025, 6:14:39 PM');
 assert.equal(formatPdfDate('D:20240229','en-US','ymd'),'2024-02-29 00:00');
 for(const input of [null,'','not a date','D:20250229','D:20251301','D:20250101256000',"D:20250101+24'00'","D:20250101+05'99'",'D:20250101Z<script>'])assert.equal(parsePdfDate(input),null);
 for(const propertyDateFormat of ['auto','ymd','ymd-slash','dmy','mdy'])assert.equal(normalizeSettings({propertyDateFormat}).propertyDateFormat,propertyDateFormat);
 assert.equal(normalizeSettings({propertyDateFormat:'invalid'}).propertyDateFormat,'auto');
});
test('quick OCR covers current page plus exactly five or ten successors and clips at EOF',()=>{
 assert.deepEqual(quickOcrRange('page',4,100),{from:4,to:4});
 assert.deepEqual(quickOcrRange('next5',4,100),{from:4,to:9});
 assert.deepEqual(quickOcrRange('next10',4,100),{from:4,to:14});
 assert.deepEqual(quickOcrRange('next10',18,20),{from:18,to:20});
 assert.deepEqual(quickOcrRange('next5',20,20),{from:20,to:20});
 for(const action of ['panel','invalid'])assert.equal(quickOcrRange(action,1,100),null);
 for(const action of ['panel','page','next5','next10'])assert.equal(normalizeSettings({ocrAction:action}).ocrAction,action);
 assert.equal(normalizeSettings({ocrOverlay:false}).ocrOverlay,undefined);
});

test('OCR word separators preserve English spaces and Chinese continuity',()=>{
 const result=ocrWords([{paragraphs:[{lines:[{words:['中','文','测试'].map((text,i)=>({text,bbox:{x0:i*10,y0:1,x1:i*10+8,y1:12}}))},{words:['COSMIC','PDF'].map((text,i)=>({text,bbox:{x0:i*30,y0:20,x1:i*30+25,y1:35}}))}]}]}],100,100);
 assert.equal(result.map(word=>word.text+word.separator).join(''),'中文测试\nCOSMIC PDF\n');
});


function paperSample(size = 128, pixel = () => [0, 0, 0, 255]) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) data.set(pixel(x, y), i);
  return { data, width: size, height: size };
}
const black = [4, 4, 4, 255], white = [255, 255, 255, 255];
const { isDarkPaper, createDarkPaperGuard } = await import('../extension/workspaces/pdf-viewer/dark-paper.js');
test('dark-paper exception requires a uniform neutral bed across the whole page and all edges', () => {
  for (const size of [128, 257]) {
    assert.equal(isDarkPaper(paperSample(size, () => black)), true);
    // Sparse strokes spread across the page, leaving uninterrupted black margins.
    assert.equal(isDarkPaper(paperSample(size, (x,y) => x > 16 && x < size - 16 && y > 16 && y < size - 16 && x % 12 < 2 && y % 24 < 2 ? white : black)), true);
    for (const pixel of [
      () => white, () => [160,160,160,255], () => [3,9,17,255],
      (x,y) => x < 2 || y < 2 || x >= size-2 || y >= size-2 ? white : black, // star field on white paper
      (x,y) => x === 0 ? white : black, // even one thin white edge
      (x,y) => x > size*.45 && x < size*.55 && y > size*.45 && y < size*.55 ? white : black, // small white inset
      (x,y) => x%2 === y%2 ? white : black,
      (x,y) => { const n=(x*31+y*17)%16; return [n,n,n,255]; }, // noisy night photograph
      x => { const n=Math.floor(x/size*16); return [n,n,n,255]; }, // dark gradient
      (x,y) => x > 16 && x < 32 && y > 16 && y < 32 ? [255,0,0,255] : black,
      () => [0,0,0,0]
    ]) assert.equal(isDarkPaper(paperSample(size, pixel)), false);
  }
  for (const shade of [0,4,32,64,96,120,127]) {
    const paper = [shade,shade,shade,255];
    for (const strength of [.85,.9,.96,1]) assert.equal(isDarkPaper(paperSample(128,()=>paper),strength),true);
    assert.equal(isDarkPaper(paperSample(128,(x,y)=>x>16&&x<112&&y>16&&y<112&&x%12<2&&y%24<2?[0,0,0,255]:paper)),true);
    assert.equal(isDarkPaper(paperSample(128,(x,y)=>x<2||y<2||x>=126||y>=126?white:paper)),false);
  }
  for (const shade of [128,160,200,240,255]) assert.equal(isDarkPaper(paperSample(128,()=>[shade,shade,shade,255])),false);
  assert.equal(isDarkPaper(paperSample(128,(x,y)=>{const n=80+(x*31+y*17)%16;return[n,n,n,255];})),false);
  for (const strength of [.5,NaN,2]) assert.equal(isDarkPaper(paperSample(), strength), false);
  for (const strength of [.85,.9,.96,1]) assert.equal(isDarkPaper(paperSample(), strength), true);
  assert.equal(isDarkPaper(), false);
  assert.equal(isDarkPaper({data:new Uint8ClampedArray(4),width:128,height:128}), false);
});
test('black-paper guard stages rare candidates, caches failures and decisions, and releases buffers', () => {
  const reads = [], source = {width:612,height:842}; let sample = size => paperSample(size, () => white), fail = false;
  const canvas = {width:0,height:0,getContext:()=>({drawImage(){},getImageData(x,y,size){reads.push(size);if(fail)throw Error('read failed');return sample(size);}})};
  const guard = createDarkPaperGuard(5,.96,()=>canvas);
  assert.equal(guard.get(1),0); assert.equal(guard.decide(1,source),1); assert.deepEqual(reads,[32]);
  sample = size => paperSample(size, () => black);
  assert.equal(guard.decide(1,source),1); assert.deepEqual(reads,[32]); // cached rejection
  assert.equal(guard.decide(2,source),2); assert.deepEqual(reads,[32,32,128,257]);
  assert.equal(canvas.width,0); assert.equal(canvas.height,0);
  assert.equal(guard.decide(2,{width:4000,height:5000}),2); assert.equal(reads.length,4); // zoom cache
  assert.equal(guard.reject(2),2); // a later interrupted/failed redraw cannot overturn the original verdict
  sample = size => paperSample(size, () => size === 257 ? white : black);
  assert.equal(guard.decide(3,source),1); assert.deepEqual(reads.slice(-3),[32,128,257]); // confirmation veto
  fail = true; assert.equal(guard.decide(4,source),1); const count=reads.length;
  assert.equal(guard.decide(4,source),1); assert.equal(reads.length,count); assert.equal(canvas.width,0);
  assert.equal(guard.decide(5,{width:100,height:100}),1); assert.equal(reads.length,count);
  guard.destroy(); assert.equal(guard.get(2),1); assert.equal(guard.decide(2,source),1);
  let allocations=0; const weak=createDarkPaperGuard(1,NaN,()=>{allocations++;return canvas;});
  assert.equal(weak.decide(1,source),1); assert.equal(allocations,0);
});

test('black-paper preference defaults on and preserves explicit boolean opt-out', () => {
  assert.equal(DEFAULTS.preserveDarkPaper, true);
  for (const value of [true, false]) assert.equal(normalizeSettings({preserveDarkPaper:value}).preserveDarkPaper, value);
  assert.equal(normalizeSettings({preserveDarkPaper:'false'}).preserveDarkPaper, true);
});
