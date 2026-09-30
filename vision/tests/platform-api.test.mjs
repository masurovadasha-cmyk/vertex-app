import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../platform/worker.mjs';
const req=(path,options={})=>new Request('https://vision.example'+path,options);
test('health identifies platform without claiming cloud readiness',async()=>{const r=await handle(req('/api/vision/v1/health'));assert.equal(r.status,200);const v=await r.json();assert.equal(v.version,'1.16-rc1');assert.equal(v.moduleCount,19);assert.equal(v.authenticated,false);assert.equal(v.productionReady,false);assert.equal(v.sharedDatabase,'not-connected');assert.equal(v.mode,'release-candidate');assert.equal(v.activeModule,'views');assert.equal(r.headers.get('cache-control'),'no-store');});
test('registry endpoint returns only public metadata',async()=>{const r=await handle(req('/api/vision/v1/modules'));const v=await r.json();assert.equal(v.modules.length,19);assert.ok(v.modules.every(m=>m.parent==='vertex-vision'&&m.cloudEnabled===false));assert.deepEqual(v.modules.filter(m=>m.status==='active').map(m=>m.id),['views']);assert.ok(v.modules.filter(m=>m.id!=='views').every(m=>m.status==='coming-soon'));assert.ok(!JSON.stringify(v).includes('tenant_id'));});
test('database-dependent API always fails closed, even with supplied role or environment keys',async()=>{for(const endpoint of ['commands','orders','tasks','audit']){const r=await handle(req('/api/vision/v1/'+endpoint,{method:'POST',headers:{authorization:'Bearer demo','x-vision-profile':'audit','content-type':'application/json'},body:'{"role":"admin"}'}),{SUPABASE_URL:'https://example.invalid',VISION_ENV:'production'});assert.equal(r.status,503);const body=await r.json();assert.equal(body.error,'cloud_backend_not_connected');assert.equal(body.mode,'release-candidate');assert.equal(body.activeModule,'views');}});
test('development profile and RPC routes are not exposed',async()=>{for(const path of ['/api/profiles','/api/commands','/api/orders','/vision/backend/dev.mjs','/vision/portable/sandbox.mjs','/vision','/.dev.vars'])assert.equal((await handle(req(path))).status,404);});
test('cross-origin API requests are rejected',async()=>assert.equal((await handle(req('/api/vision/v1/modules',{headers:{origin:'https://external.invalid'}}))).status,403));
test('registry mutation and health mutation are rejected',async()=>{assert.equal((await handle(req('/api/vision/v1/modules',{method:'POST'}))).status,405);assert.equal((await handle(req('/health',{method:'DELETE'}))).status,405);});
test('static content is served only through the configured assets binding',async()=>{let count=0;const r=await handle(req('/index.html'),{ASSETS:{fetch:async request=>{count++;assert.equal(new URL(request.url).pathname,'/index.html');return new Response('static');}}});assert.equal(await r.text(),'static');assert.equal(count,1);assert.equal((await handle(req('/index.html'))).status,503);});
test('non-GET asset methods do not reach assets',async()=>{const r=await handle(req('/index.html',{method:'POST'}),{ASSETS:{fetch:()=>{throw Error('must not run');}}});assert.equal(r.status,405);});
test('HEAD health is bodyless',async()=>{const r=await handle(req('/health',{method:'HEAD'}));assert.equal(r.status,200);assert.equal(await r.text(),'');});

test('public deployment fails closed for Views operations APIs',async()=>{
  for(const path of ['/api/v1/views/bookings','/api/v1/views/units','/api/v1/views/cleaning','/api/v1/views/commands']){
    const r=await handle(req(path,{method:path.endsWith('/commands')?'POST':'GET'}));
    assert.equal(r.status,503);
    const body=await r.json();
    assert.equal(body.error,'cloud_backend_not_connected');
    assert.equal(body.activeModule,'views');
  }
});
