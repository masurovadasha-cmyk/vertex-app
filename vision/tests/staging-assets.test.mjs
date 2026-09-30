import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../backend/worker.mjs';

test('staging serves VISION-named public assets without exposing the source directory',async()=>{
 const seen=[];
 const env={VISION_ENV:'staging',ASSETS:{fetch:async request=>{seen.push(new URL(request.url).pathname);return new Response('static asset');}}};
 for(const file of ['vision-core.js','vision-shell.js','vision-shell.css','vision-compact.css','vision-views-ops.js','vision-views-ops.css']){
  const r=await handle(new Request('https://vision.example/'+file),env,()=>{throw Error('static files must not call Auth');});
  assert.equal(r.status,200,file);assert.equal(await r.text(),'static asset');
 }
 assert.equal(seen.length,6);
 for(const path of ['/vision','/vision/backend/worker.mjs','/vision/portable/sandbox.mjs','/.dev.vars','/rest/v1/vision_users','/auth/v1/user']){
  assert.equal((await handle(new Request('https://vision.example'+path),env)).status,404,path);
 }
 assert.equal(seen.length,6);
 assert.equal((await handle(new Request('https://vision.example/vision-core.js',{method:'POST'}),env)).status,405);
 assert.equal((await handle(new Request('https://vision.example/api/v1/views/bookings'),env)).status,503);
});
