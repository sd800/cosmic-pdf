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

test('toolbar defaults adapt to layout while explicit per-control choices win',()=>{
 assert.deepEqual(hiddenToolbarActions(normalizeSettings()),['find','paging','fit','print','properties']);
 for(const flags of [{showFilename:true},{showBranding:true},{showFilename:true,showBranding:true}])assert.deepEqual(hiddenToolbarActions(normalizeSettings(flags)),[]);
 const settings=normalizeSettings({toolbarHidden:{find:false,rotate:true,script:true,fit:'true'}});
 assert.deepEqual(settings.toolbarHidden,{find:false,rotate:true});
 assert.deepEqual(hiddenToolbarActions(settings),['paging','fit','rotate','print','properties']);
 assert.deepEqual(hiddenToolbarActions({...settings,showFilename:true}),['rotate']);
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
