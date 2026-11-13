import {readFile,readdir,stat}from'node:fs/promises';import{resolve,relative,join}from'node:path';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
const root=resolve('.'),manifest=JSON.parse(await readFile('extension/manifest.json')),pkg=JSON.parse(await readFile('package.json'));if(pkg.version!==manifest.version||pkg.version_name!==manifest.version_name)throw Error('Version mismatch');
const releaseName=manifest.version_name?.match(/^(\d{2}\.\d{1,2}\.\d{1,2}\.[1-9]\d*) \(([1-9]\d*)\)$/);
if(!releaseName||releaseName[1]!==manifest.version)throw Error('Expected calendar display version with an ASCII-space cumulative release number');
async function walk(dir){const files=[];for(const name of await readdir(dir)){if(name==='.DS_Store'||name.startsWith('._')||['.git','node_modules','dist'].includes(name))continue;const p=join(dir,name);if((await stat(p)).isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
for(const file of await walk('extension'))if(file.endsWith('.js')&&!file.includes('/vendor/')){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status)throw Error(result.stderr);}
for(const vendor of ['pdfjs','tesseract','marked']){const folder='extension/vendor/'+vendor,entries=JSON.parse(await readFile(folder+'/integrity.json'));for(const[name,hash]of Object.entries(entries)){const actual=createHash('sha256').update(await readFile(folder+'/'+name)).digest('hex');if(actual!==hash)throw Error('Dependency changed: '+name);}}
for(const f of [manifest.background.service_worker,manifest.options_page,...manifest.sandbox.pages,...Object.values(manifest.icons)])await stat('extension/'+f);
// Generated icons and every first-party HTML brand reference must follow the SVG.
const brandHashes=JSON.parse(await readFile('extension/icons/integrity.json'));
const brandSource=await readFile('extension/icons/icon.svg');
const brandRevision=createHash('sha256').update(brandSource).digest('hex').slice(0,12);
for(const name of ['icon.svg',...Object.values(manifest.icons).map(file=>file.replace(/^icons\//,''))]) {
  const bytes=await readFile('extension/icons/'+name);
  if(createHash('sha256').update(bytes).digest('hex')!==brandHashes[name])throw Error('Stale brand asset: '+name+'; run scripts/assets/render-icons.mjs');
}
for(const [size,file]of Object.entries(manifest.icons)) {
  const bytes=await readFile('extension/'+file);
  if(bytes.length<24||bytes.readUInt32BE(16)!==Number(size)||bytes.readUInt32BE(20)!==Number(size))throw Error('Wrong brand icon size: '+file);
}
for(const file of (await walk('extension')).filter(file=>file.endsWith('.html')&&!file.includes('/vendor/'))) {
  const html=await readFile(file,'utf8');
  const references=[...html.matchAll(/(?:href|src)="((?:\.\.\/)+icons\/icon\.svg[^"]*)"/g)];
  if(!references.length||references.some(([,url])=>!url.endsWith('icon.svg?v='+brandRevision)))throw Error('Stale brand URL: '+file+'; run scripts/assets/render-icons.mjs');
  if(!/<link rel="icon" href="[^"]*icon\.svg\?v=[a-f0-9]+"/.test(html))throw Error('Missing favicon: '+file);
}

// Keep the fixed permission contract small; additions require a deliberate audit.
const permissions=['storage','declarativeNetRequestWithHostAccess','scripting'],hosts=['http://*/*','https://*/*','file:///*'];
if(JSON.stringify(manifest.permissions)!==JSON.stringify(permissions)||JSON.stringify(manifest.host_permissions)!==JSON.stringify(hosts))throw Error('Unexpected extension permissions: audit before expanding access');
if(manifest.content_scripts||manifest.optional_permissions?.length||manifest.optional_host_permissions?.length)throw Error('No persistent content scripts or optional permission requests');
if(!manifest.content_security_policy.sandbox.includes("connect-src 'self' blob:"))throw Error('Sandbox must not reach remote resources');
if(JSON.stringify(manifest.mime_types_handler)!==JSON.stringify({'application/pdf':{handler_url:'workspaces/pdf-reader/mime.html',can_embed:true}}))throw Error('Native PDF handler contract changed');
await stat('extension/'+manifest.mime_types_handler['application/pdf'].handler_url);
const publicPages=manifest.web_accessible_resources.flatMap(group=>group.resources).sort();
const viewerShell='workspaces/pdf-viewer/viewer.html';
if(JSON.stringify(publicPages)!==JSON.stringify(['workspaces/pdf-reader/entry.html',viewerShell]))throw Error('Only the navigation entry and opaque viewer shell may be web-accessible');
if(JSON.stringify(manifest.sandbox.pages)!==JSON.stringify([viewerShell])||!manifest.content_security_policy.sandbox.startsWith('sandbox ')||manifest.content_security_policy.sandbox.includes('allow-same-origin'))throw Error('The embeddable viewer shell must have an opaque origin');
const readerEntry=manifest.web_accessible_resources.find(group=>group.resources.includes('workspaces/pdf-reader/entry.html'));
if(readerEntry.resources.length!==1||readerEntry.use_dynamic_url!==true||Number(manifest.minimum_chrome_version)<130)throw Error('PDF takeover requires a session-specific reader entry with Chrome 130+ support');
for(const file of ['CHANGELOG.md','CHANGELOG_zh.md']){
 const changelog=await readFile(file,'utf8'),releases=[...changelog.matchAll(/^## (\d+(?:\.\d+)+)(?: \([1-9]\d*\))?(?: — [^\n]+)?$/gm)];
 if(releases[0]?.[1]!==manifest.version||!changelog.includes('## '+manifest.version_name+' — '))throw Error('Missing complete release entry');
 if(new Set(releases.map(match=>match[1])).size!==Number(releaseName[2]))throw Error('Cumulative release number differs from recorded versions');
}
const files=await walk('extension');let size=0;for(const f of files)size+=(await stat(f)).size;console.log(`Checks passed. ${files.length} runtime files; ${(size/1000000).toFixed(1)} MB unpacked.`);
