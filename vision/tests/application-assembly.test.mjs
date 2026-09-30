import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('standalone application shell is isolated from the legacy public Vertex bundle',async()=>{
 const html=await read('ui/index.html'),app=await read('ui/app.mjs');
 assert.match(html,/VERTEX VISION/);assert.match(html,/src="\/app\.mjs"/);assert.match(html,/href="\/styles\.css"/);
 for(const legacy of ['host-console.js','taxi.js','journey.js','Vertex-Latest.apk','vertex-app.masurovadasha.workers.dev'])assert.ok(!html.includes(legacy)&&!app.includes(legacy));
 assert.match(app,/\/api\/vision\/v1\/modules/);assert.match(app,/\/healthz/);assert.match(app,/href='\/views'|href="\/views"|link\.href='\/views'/);
});

test('operations sign-in derives scope from Auth instead of editable tenant/token fields',async()=>{
 const html=await read('ui/operations/index.html'),app=await read('ui/operations/app.mjs');
 assert.match(html,/name="email"/);assert.match(html,/name="password"/);
 assert.doesNotMatch(html,/name="tenant"|name="token"/);
 assert.match(app,/auth\.context/);assert.match(app,/authContext\.tenantId/);assert.match(app,/organization\.id/);
});

test('staging Wrangler and RC manifest describe the assembled app without production approval',async()=>{
 const wrangler=JSON.parse((await read('wrangler.jsonc')).replace(/^\s*\/\/.*$/gm,''));
 const release=JSON.parse(await read('release/0.1-RC1.json'));
 assert.equal(wrangler.name,'vertex-vision-staging');assert.equal(wrangler.main,'backend/operations-worker.mjs');assert.equal(wrangler.vars.VISION_ENV,'staging');
 assert.equal(wrangler.assets.directory,'./ui');assert.equal(wrangler.assets.run_worker_first,true);
 assert.equal(release.applicationAssembly.status,'implemented-in-branch');assert.deepEqual(release.applicationAssembly.activeModules,['views']);
 assert.equal(release.applicationAssembly.root,'/');assert.equal(release.applicationAssembly.viewsRoute,'/views');
 assert.equal(release.cloudStagingVerified,false);assert.equal(release.productionApproved,false);assert.equal(release.productionReady,false);
});
