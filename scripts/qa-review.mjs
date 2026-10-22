import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {reviewedPdf} from '../test/fixtures/reviewed-pdf.mjs';

export async function runReviewQa({worker,page,reader,base,report,open}) {
  await worker.evaluate(async()=>{const settings=(await chrome.storage.local.get('settings')).settings||{};await chrome.storage.local.set({settings:{...settings,appearance:'light',sampling:1,aiEnabled:false,automaticOcr:false}});});
  let frame=await open('/reviewed');
  await frame.waitForSelector('#annotations:not([hidden])');
  async function appearanceSample(){return frame.evaluate(()=>{
    const view=qaViewer.getPageView(0),canvas=view.canvas,context=canvas.getContext('2d');
    return [[100,650],[60,600],[100,525],[60,445],[110,383]].map(([x,y])=>{
      const [left,top]=view.viewport.convertToViewportPoint(x,y);
      return [...context.getImageData(Math.floor(left*canvas.width/view.viewport.width),Math.floor(top*canvas.height/view.viewport.height),1,1).data].slice(0,3);
    });
  });}
  const enabled=await appearanceSample();
  assert.ok(enabled.every(rgb=>Math.min(...rgb)<240),'all five passive appearance regions are painted');
  assert.equal(await frame.locator('.annotationLayer,input[name="FullName"],.annotationEditorLayer').count(),0,'no interactive annotation or form layers');
  assert.equal(await frame.evaluate(()=>globalThis.PDF_ATTACK),undefined,'document JavaScript remains disabled');
  assert.ok(await frame.locator('.pdf-links a').count(),'safe links remain independent');
  await frame.locator('#annotations').click();
  await frame.waitForFunction(()=>qaViewer.getPageView(0).renderingState===3);
  const disabled=await appearanceSample();
  assert.ok(disabled.every(rgb=>Math.min(...rgb)>245),'hide affects every annotation and filled form region');
  await frame.locator('#annotations').click();await frame.waitForFunction(()=>qaViewer.getPageView(0).renderingState===3);
  assert.deepEqual(await appearanceSample(),enabled,'re-enable restores existing appearances');
  report.checks.push('passive highlights, note, stamp, ink, and filled form render and toggle without enabling interactive layers');
  await page.screenshot({path:resolve('test-dist/reader-review/reader.png')});

  // Print hands the exact host-owned original to Chrome; no raster print buffers.
  const opened=page.context().waitForEvent('page');
  await frame.evaluate(()=>qaLifecycle.openPrint());
  const native=await opened;await native.waitForURL(/^blob:chrome-extension:/);
  const bytes=await page.evaluate(async url=>Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),native.url());
  assert.deepEqual(Buffer.from(bytes),Buffer.from(reviewedPdf()),'native printing uses the unchanged original');
  assert.equal(await frame.locator('#print-pages,#print-dialog').count(),0);
  await native.close();
  report.checks.push('printing opens the unchanged original in Chrome without raster copies or a plugin page-range cap');

  // The last-page term is outside the four-page display cache but remains in the full-document index.
  await frame.locator('#settings').click();await frame.locator('#more-actions [data-action="search-toggle"]').click();
  await frame.locator('#query').fill('UNIQUE_FINAL_PAGE_NEEDLE');
  await frame.waitForFunction(()=>document.querySelector('#matches').textContent==='1 / 1');
  assert.equal(await frame.evaluate(()=>qaViewer.currentPageNumber),12);
  report.checks.push('Find searches uncached pages even while the Chrome shortcut preference remains enabled');

  frame=await open('/reviewed#page=12');
  assert.equal(await frame.evaluate(()=>qaViewer.currentPageNumber),12,'page anchor is honored on initial open');
  await page.reload();frame=await (await page.waitForSelector('iframe')).contentFrame();
  await frame.waitForFunction(()=>qaViewer?.currentPageNumber===12&&qaViewer.getPageView(11)?.renderingState===3);
  assert.equal(await frame.locator('#annotations').isVisible(),false,'annotation control stays absent until markup is found');
  report.checks.push('page anchors survive reload and plain pages do not expose an annotation switch');

  frame=await open('/referer.pdf');
  await frame.waitForFunction(()=>qaViewer.getPageView(0)?.renderingState===3);
  for(let tries=0;tries<50;tries++){
    if(!(await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).some(rule=>rule.action.type==='modifyHeaders'))break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal((await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).some(rule=>rule.action.type==='modifyHeaders'),false,'request header rule is removed after transport');
  report.checks.push('source-origin Referer opens the protected local endpoint and its temporary rule is removed');
  const output=resolve('test-dist/reader-review');await mkdir(output,{recursive:true});
  await writeFile(join(output,'reviewed.pdf'),reviewedPdf());
  await writeFile(join(output,'README.md'),'# Reader review fixtures\n\nSynthetic 12-page reviewed.pdf: highlight, note, stamp, filled Zhang San field, ink, safe link, inert JavaScript action, and a unique last-page search term. reader.png shows the passive renderer. Run PDF_QA=review with scripts/test-browser.mjs using the isolated Playwright/Chrome paths from docs/QA.md. \n\nVerified: '+report.checks.join('; ')+'.\n');
}
