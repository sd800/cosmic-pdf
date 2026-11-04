import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAppearance} from '../extension/workspaces/pdf-viewer/page-appearance.js';

test('page overrides follow only this open document and Auto resumes its current default',()=>{
 let globalDark=false;
 const page=n=>({classList:{contains:name=>name==='page'},dataset:{pageNumber:String(n)}}),thumb=n=>({dataset:{page:String(n)}});
 const pages={children:[page(1),page(2)]},thumbnails={children:[thumb(1),thumb(2)]};
 const appearance=createPageAppearance({pages,thumbnails,getDark:()=>globalDark});
 appearance.apply();appearance.set(1,'dark');assert.deepEqual(pages.children.map(n=>n.dataset.paperDark),['true','false']);
 assert.deepEqual(thumbnails.children.map(n=>n.dataset.paperDark),['true','false']);
 globalDark=true;appearance.set(2,'light');appearance.apply();assert.deepEqual(pages.children.map(n=>n.dataset.paperDark),['true','false']);
 appearance.set(1,'auto');assert.equal(appearance.get(1),'auto');globalDark=false;appearance.apply();assert.equal(pages.children[0].dataset.paperDark,'false');
 pages.children.push(page(3));thumbnails.children.push(thumb(3));appearance.apply();assert.equal(pages.children[2].dataset.paperDark,'false');
 appearance.set(2,'auto');assert.equal(appearance.get(2),'auto');
 for(const [page,mode]of [[0,'dark'],[NaN,'dark'],[1,'invalid'],[1.5,'light']])appearance.set(page,mode);
 assert.equal(appearance.get(1),'auto');
 const other=createPageAppearance({pages,thumbnails,getDark:()=>true});other.apply();assert.deepEqual(pages.children.map(n=>n.dataset.paperDark),['true','true','true']);
});
