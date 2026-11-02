import assert from 'node:assert/strict';
import { writeFile, mkdir, copyFile } from 'node:fs/promises';

export async function runToolbarQa({ context, worker, page, reader, settings, base, folder, report, open }) {
  await worker.evaluate(async () => chrome.storage.local.set({ settings: {
    sampling: 1, aiEnabled: false, showFilename: true, showBranding: true,
    toolbarHidden: Object.fromEntries(['pages','find','paging','zoom','fit','rotate','fullscreen','ocr','print','properties','native'].map(key => [key, false]))
  } }));
  const prefs = await context.newPage(); await prefs.goto(settings);
  assert.equal(await prefs.locator('#showBranding').count(), 0);
  await prefs.close();
  async function embedded(kind) {
    await page.goto(base + '/embed-page?kind=' + kind);
    const host = await page.waitForFunction(() => !!document.querySelector('iframe,embed,object'));
    await host.dispose();
    let owner;
    for (let attempt = 0; attempt < 80; attempt++) {
      owner = page.frames().find(frame => frame.url().startsWith(reader + '?source='));
      if (owner) break;
      await page.waitForTimeout(40);
    }
    assert.ok(owner, kind + ' reader starts');
    const frame = await (await owner.waitForSelector('.pdf-viewer-frame')).contentFrame();
    await frame.waitForFunction(() => document.querySelector('#count').textContent === '2');
    assert.equal(await frame.locator('.identity').count(), 0);
    assert.equal(await frame.locator('#fullscreen').isVisible(), false);
    return frame;
  }
  let frame = await embedded('iframe');
  const states = [];
  async function resize(width) {
    await page.locator('iframe,embed,object').first().evaluate((node, width) => node.style.width = width + 'px', width);
    await frame.waitForFunction(width => innerWidth === width, width);
    await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const state = await frame.evaluate(() => {
      const visible = [...document.querySelectorAll('header button,header input,header select,#count')]
        .filter(node => node.getBoundingClientRect().width && node.getBoundingClientRect().height);
      const boxes = visible.map(node => ({ id: node.id, ...Object.fromEntries(['left','right','top','bottom'].map(key => [key,node.getBoundingClientRect()[key]])) }));
      const collisions = [];
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
        if (Math.min(boxes[a].right,boxes[b].right)-Math.max(boxes[a].left,boxes[b].left)>1
          && Math.min(boxes[a].bottom,boxes[b].bottom)-Math.max(boxes[a].top,boxes[b].top)>1) collisions.push([boxes[a].id,boxes[b].id]);
      }
      return { width: innerWidth, visible: visible.map(node => node.id), wrap: document.documentElement.dataset.toolbarWrap,
        headerHeight: document.querySelector('header').getBoundingClientRect().height, collisions };
    });
    assert.equal(state.wrap, 'false'); assert.ok(state.headerHeight < 60, 'one toolbar row');
    assert.deepEqual(state.collisions, []);
    assert.ok(state.visible.includes('page') && state.visible.includes('settings'));
    if ([1260,340,280,170].includes(width) && !states.some(state => state.width === width)) {
      await frame.locator('header').screenshot({ path: folder + '/toolbar-' + width + '.png' });
    }
    states.push(state); return state;
  }
  const wide = await resize(1260);
  assert.ok(wide.visible.includes('ai-toggle'), 'AI stays visible when the original row fits');
  const order = ['ai-toggle','rotate','ocr-toggle','zoom-out','sidebar-toggle','theme','filename'];
  for (const width of [920,800,680,560,440,340,280,220,170]) {
    const state = await resize(width);
    let retained = false;
    for (const id of order) {
      if (state.visible.includes(id)) retained = true;
      else assert.equal(retained, false, 'automatic hiding follows the requested order');
    }
    assert.equal(state.visible.includes('zoom-out'), state.visible.includes('zoom-in'));
  }
  assert.ok(states.some(state => state.visible.includes('download') && !state.visible.includes('scale')
    && !state.visible.includes('scale-input') && !state.visible.includes('filename')), 'download survives the percentage and filename');
  assert.ok(!states.at(-1).visible.includes('download'), 'download moves only at the last tier');
  const menu = frame.locator('#more-actions');
  await frame.locator('#settings').click();
  for (const action of ['ai-toggle','rotate','ocr-toggle','zoom-in','zoom-out','sidebar-toggle','theme','download','filename']) {
    assert.equal(await menu.locator('[data-action="' + action + '"]').count(), 1, action + ' remains available');
  }
  assert.equal(await menu.locator('[data-action=fullscreen]').count(), 0);
  const downloadEvent = page.waitForEvent('download');
  await menu.locator('[data-action=download]').click();
  const download = await downloadEvent; assert.equal(await download.failure(), null); await download.delete();
  await frame.locator('#settings').click();
  await menu.locator('[data-action=ai-toggle]').click();
  await page.frames().find(owner => owner.url().startsWith(reader + '?source=')).waitForFunction(async () =>
    (await chrome.storage.local.get('settings')).settings.aiEnabled === true);
  await frame.locator('#settings').click(); await menu.locator('[data-action=filename]').click();
  await frame.waitForSelector('#properties-dialog[open]'); await frame.locator('#properties-close').click();
  await resize(340);
  await frame.locator('#settings').click();
  const wasDark = await frame.evaluate(() => document.documentElement.dataset.dark);
  await menu.locator('[data-action=theme]').click();
  await frame.waitForFunction(value => document.documentElement.dataset.dark !== value, wasDark);
  await resize(1260);
  assert.equal(await frame.locator('#ai-toggle').isVisible(), true);
  assert.equal(await frame.locator('#filename').isVisible(), true);
  const saved = await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  assert.ok(Object.values(saved.toolbarHidden).every(value => value === false), 'adaptive choices never rewrite preferences');
  for (const kind of ['embed','object']) {
    frame = await embedded(kind); await resize(340);
    await frame.locator('#settings').click(); assert.equal(await frame.locator('#more-actions').count(), 1);
    assert.equal(await frame.locator('#more-actions [data-action=fullscreen]').count(), 0);
  }
  await page.setViewportSize({ width: 1360, height: 960 });
  frame = await open('/toolbar-top-level');
  assert.equal(await frame.locator('#fullscreen').isVisible(), true);
  await frame.locator('#fullscreen').click(); await page.waitForFunction(() => !!document.fullscreenElement);
  await frame.locator('#fullscreen').click(); await page.waitForFunction(() => !document.fullscreenElement);
  await page.evaluate(() => Object.defineProperty(document,'fullscreenEnabled',{ configurable:true, value:false }));
  await frame.locator('#fullscreen').click();
  await frame.waitForFunction(() => document.querySelector('#fullscreen').hidden);
  await page.setViewportSize({ width: 1000, height: 960 });
  assert.equal(await frame.locator('#fullscreen').isVisible(), false);
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, toolbarHidden: { ...settings.toolbarHidden, fullscreen: true, rotate: true } } });
  });
  await frame.waitForFunction(() => document.querySelector('#rotate').hidden);
  await frame.locator('#settings').click();
  assert.equal(await frame.locator('#more-actions [data-action=fullscreen]').count(), 0);
  report.checks.push('embedded adaptive single-row toolbar, ordered folding, final download tiers, original handlers, resize recovery, unchanged saved preferences, removed branding, and fullscreen capability gating');
  await writeFile(folder + '/toolbar-states.json', JSON.stringify(states, null, 2) + '\n');
  const evidence = 'test-dist/embedded-toolbar'; await mkdir(evidence, { recursive: true });
  await copyFile(folder + '/toolbar-states.json', evidence + '/states.json');
  for (const width of [1260,340,280,170]) await copyFile(folder + '/toolbar-' + width + '.png', evidence + '/' + width + '.png');
  await writeFile(evidence + '/README.md', '# Embedded toolbar checks\n\nRun `PDF_QA=toolbar node scripts/browser/test-browser.mjs` with PDF_PLAYWRIGHT and PDF_CHROME pointing to the local Playwright module and isolated Chrome for Testing. Uses generated two-page PDFs and a disposable profile; no personal browser is accessed.\n\n`states.json` contains only widths, visible control IDs, toolbar heights, and collision findings. The PNGs show toolbar tiers, not document contents. Checks cover iframe/embed/object entry, ordered single-row folding, percentage and download priorities, trusted AI toggling, properties/theme actions, resize recovery, saved-preference isolation, and full-screen availability in the toolbar and menu. Files are overwritten on rerun; no browser logs are retained.\n');
}
