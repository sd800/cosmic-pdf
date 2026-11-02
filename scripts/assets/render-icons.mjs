// Rebuild PNG manifest icons from the editable SVG. Playwright is a QA-only dependency.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PDF_PLAYWRIGHT?pathToFileURL(process.env.PDF_PLAYWRIGHT).href:'playwright');
async function htmlFiles(dir) {
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(entry.name==='vendor')continue;
    const path=dir+'/'+entry.name;
    if(entry.isDirectory())files.push(...await htmlFiles(path));
    else if(entry.name.endsWith('.html'))files.push(path);
  }
  return files;
}
const browser=await chromium.launch({executablePath:process.env.PDF_CHROME,headless:true});
try {
  const page=await browser.newPage({viewport:{width:128,height:128},deviceScaleFactor:1});
  const svg=await readFile('extension/icons/icon.svg','utf8');
  await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block}</style>'+svg);
  for(const size of [16,32,48,128]) {
    await page.locator('svg').evaluate((svg,size)=>{svg.style.width=size+'px';svg.style.height=size+'px';},size);
    await writeFile('extension/icons/icon-'+size+'.png',await page.locator('svg').screenshot({omitBackground:true}));
  }
  // One source controls raster icons and content-addressed favicon/brand URLs.
  // Chrome can retain a favicon cached under its old, unchanged URL.
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const sourceHash=hash(svg),revision=sourceHash.slice(0,12);
  const files=['icon.svg',...[16,32,48,128].map(size=>'icon-'+size+'.png')];
  const integrity={};
  for(const file of files)integrity[file]=hash(await readFile('extension/icons/'+file));
  await writeFile('extension/icons/integrity.json',JSON.stringify(integrity,null,2)+'\n');
  for(const file of await htmlFiles('extension')) {
    const html=await readFile(file,'utf8');
    const updated=html.replace(/((?:href|src)="(?:\.\.\/)+icons\/icon\.svg)(?:\?v=[a-f0-9]+)?"/g,'$1?v='+revision+'"');
    await writeFile(file,updated);
  }
} finally {await browser.close();}
