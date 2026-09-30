'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../platform/registry.cjs');
const root='vision/platform/';
const doc={documentElement:{dataset:{}}};
const box={window:{},document:doc};
vm.runInNewContext(fs.readFileSync(root+'design-system.js','utf8'),box);
const design=box.window.VertexVisionDesign;
test('Sand Luxury is presentation metadata for exactly the 19 registered modules',()=>{
 assert.equal(design.id,'sand-luxury');assert.deepEqual(Object.keys(design.modules).sort(),core.modules.map(m=>m.id).sort());
 for(const module of Object.values(design.modules)){assert.equal(module.ru.length,3);assert.equal(module.en.length,3);assert.ok(Object.isFrozen(module));}
 assert.deepEqual(core.modules.filter(m=>m.status==='active').map(m=>m.id),['views']);
 assert.equal(core.modules.filter(m=>m.status!=='active').flatMap(m=>m.actions).length,0);
});
test('trusted inline SVG icons never interpolate supplied names',()=>{
 for(const name of [...core.modules.map(m=>m.id),'__proto__','constructor','<script>alert(1)</script>']){
  const svg=design.icon(name);assert.ok(svg.startsWith('<svg'));assert.match(svg,/aria-hidden="true"/);assert.doesNotMatch(svg,/<script|onclick|<image|<foreignObject/);
 }
});
test('design does not fetch, save business data or change session permissions',()=>{
 const source=fs.readFileSync(root+'design-system.js','utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|setInterval|\.permissions\s*=/);
});
test('reviewed design files are built once and synchronized to Android',()=>{
 for(const [from,to] of [['mark.svg','vision-mark.svg'],['design-system.js','vision-design.js'],['sand-luxury.css','vision-sand.css']]){
  assert.deepEqual(fs.readFileSync(root+from),fs.readFileSync('vertex/dist/'+to));
  assert.deepEqual(fs.readFileSync('vertex/dist/'+to),fs.readFileSync('android/app/src/main/assets/site/'+to));
 }
 const html=fs.readFileSync('vertex/dist/index.html','utf8');
 assert.equal(html.split('src="vision-design.js"').length-1,1);
 assert.equal(html.split('href="vision-sand.css"').length-1,1);
 assert.ok(html.indexOf('src="vision-design.js"')<html.indexOf('src="vision-shell.js"'));
 assert.ok(html.indexOf('href="vision-sand.css"')>html.indexOf('href="vision-views.css"'));
});
test('design identity is consistent without changing operational readiness',()=>{
 for(const f of ['vertex/dist/release.json','vision/release/0.1-RC1.json','vision/assembly/manifest.json'])assert.equal(JSON.parse(fs.readFileSync(f)).design.id,design.id);
 const release=JSON.parse(fs.readFileSync('vision/release/0.1-RC1.json'));assert.equal(release.productionReady,false);assert.equal(release.cloudStagingVerified,false);
});
test('motion preferences and unknown data presentation are explicit',()=>{
 const css=fs.readFileSync(root+'sand-luxury.css','utf8'),ui=fs.readFileSync(root+'views-ops.js','utf8');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/--vs-fast:160ms/);assert.doesNotMatch(css,/animation:[^;]*infinite/);
 assert.match(ui,/vs-unavailable-kpis/);assert.match(ui,/vs-data-note/);assert.doesNotMatch(ui,/Sarand|Albania|240M|124,580/);
});
test('core text pairs meet the selected normal-text contrast threshold',()=>{
 const luminance=hex=>hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
 for(const [text,surface] of [['f5f1e8','393e34'],['655f52','fffcf6'],['fffbea','716038'],['292719','cbb37e']]){
  const a=luminance(text),b=luminance(surface),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.ok(ratio>=4.5,text+' on '+surface+' contrast '+ratio);
 }
});
