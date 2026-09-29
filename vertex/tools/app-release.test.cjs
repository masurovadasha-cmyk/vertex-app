'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'../..');
const web=path.join(root,'vertex/dist');
const android=path.join(root,'android/app/src/main/assets/site');
const release=JSON.parse(fs.readFileSync(path.join(web,'release.json'),'utf8'));

assert.equal(release.version,'1.8-demo');
assert.equal(release.date,'2026-09-29');
assert.ok(Array.isArray(release.boundaries)&&release.boundaries.length>=5);
assert.ok(release.features.includes('property discussions'));
assert.ok(release.features.includes('owner operations dashboard'));
assert.ok(release.features.includes('Vertex Mobility fleet'));
assert.ok(release.features.includes('transfer estimator'));
assert.ok(release.features.includes('payment preference selector'));

const gradle=fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8');
assert.match(gradle,/versionCode\s+10\b/);
assert.match(gradle,/versionName\s+'1\.8-demo'/);

const index=fs.readFileSync(path.join(web,'index.html'),'utf8');
assert.match(index,/<title>Vertex 1\.8/);
for(const required of ['views-catalog.js','app.js','mobile.js','business.js','rentals.js','concierge-demo.js','group.js','mobility.js']) assert.ok(index.includes(required),'missing script '+required);

const mobile=fs.readFileSync(path.join(web,'mobile.js'),'utf8');
assert.match(mobile,/Android APK · 1\.8-demo/);
const shell=fs.readFileSync(path.join(web,'design-shell.js'),'utf8');
assert.match(shell,/1\.8-demo/);
const app=fs.readFileSync(path.join(web,'app.js'),'utf8');
assert.match(app,/const cartAmount=/);
assert.match(app,/Capacity on request · destination imagery/);
assert.match(app,/paymentPreference/);
assert.match(app,/Cryptocurrency/);

const rentals=fs.readFileSync(path.join(web,'rentals.js'),'utf8');
assert.match(rentals,/function discussion\(listingId\)/);
assert.match(rentals,/function ownerReport\(\)/);
assert.match(rentals,/data\.threads/);
assert.match(rentals,/real messaging is connected/);

const sw=fs.readFileSync(path.join(web,'sw.js'),'utf8');
assert.match(sw,/vertex-demo-v18/);
assert.doesNotMatch(sw,/bali\.jpg|istanbul\.jpg/i);
assert.match(sw,/mobility\.js/);
assert.match(sw,/mobility\.css/);
for(const stale of ['bali.jpg','istanbul.jpg']) {
  assert.equal(fs.existsSync(path.join(web,stale)),false);
  assert.equal(fs.existsSync(path.join(android,stale)),false);
}

const ctx={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(web,'views-catalog.js'),'utf8'),ctx);
const stays=ctx.window.VertexOwnedStays;
assert.equal(stays.length,6);
const photos=[...new Set(stays.flatMap(s=>Array.isArray(s.photos)?s.photos:[]))];
assert.equal(photos.length,16);
const quoted=stays.filter(s=>s.quote);
assert.equal(quoted.length,4);
assert.ok(quoted.every(s=>s.quote.arrival==='2026-10-12'&&s.quote.departure==='2026-10-15'&&s.quote.guests===2));
assert.ok(stays.some(s=>s.en.includes('Panoramic')&&s.quote&&s.quote.unavailable===true));

const textExtensions=new Set(['.js','.css','.html','.json','.webmanifest','.md']);
for(const name of fs.readdirSync(web)){
  const file=path.join(web,name);
  if(!fs.statSync(file).isFile()||!textExtensions.has(path.extname(name))) continue;
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/\bOLX\b/i,'OLX reference remains in '+name);
  assert.doesNotMatch(source,/vertex-jarvis/i,'JARVIS reference remains in '+name);
}

const androidRelease=JSON.parse(fs.readFileSync(path.join(android,'release.json'),'utf8'));
assert.equal(androidRelease.version,release.version);

console.log('PASS Vertex 1.8 release semantics, Uzbekistan catalog, demo boundaries, owner dashboard and discussions');
