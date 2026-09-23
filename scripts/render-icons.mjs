// Rebuild PNG manifest icons from the editable SVG. Playwright is a QA-only dependency.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PDF_PLAYWRIGHT?pathToFileURL(process.env.PDF_PLAYWRIGHT).href:'playwright');
const browser=await chromium.launch({executablePath:process.env.PDF_CHROME,headless:true});
try {
  const page=await browser.newPage({viewport:{width:128,height:128},deviceScaleFactor:1});
  const svg=await readFile('extension/icons/icon.svg','utf8');
  await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block}</style>'+svg);
  for(const size of [16,32,48,128]) {
    await page.locator('svg').evaluate((svg,size)=>{svg.style.width=size+'px';svg.style.height=size+'px';},size);
    await writeFile('extension/icons/icon-'+size+'.png',await page.locator('svg').screenshot({omitBackground:true}));
  }
} finally {await browser.close();}
