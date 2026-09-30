import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedJSON,LIMITS} from '../backend/http.mjs';
import {handle} from '../backend/worker.mjs';
import {validateViewsCommand} from '../modules/views/command-contract.mjs';
const id='11111111-1111-4111-8111-111111111111';
const env={VISION_ENV:'staging',SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const command={type:'create_booking',tenant_id:id,organization_id:id,idempotency_key:'decimal-test',unit_id:id,customer_id:id,check_in:'2026-10-10',check_out:'2026-10-11'};
const request=body=>new Request('https://vision.test/api/v1/views/commands',{method:'POST',headers:{authorization:'Bearer test.jwt.token','content-type':'application/json'},body:JSON.stringify(body)});
test('valid decimal JSON amounts are not rejected because of binary floating-point multiplication',()=>{
 for(const total of [0.29,1.1,19.99,'0.29'])assert.equal(validateViewsCommand({...command,total}).total,total);
 for(const total of [0.291,NaN,Infinity,-1])assert.throws(()=>validateViewsCommand({...command,total}),/invalid_command/);
});
test('prototype command names are client errors rather than accidental gateway failures',async()=>{
 for(const type of ['constructor','toString','__proto__']){
  const response=await handle(request({...command,type}),env,async url=>{assert.ok(url.endsWith('/user'));return Response.json({id});});
  assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_command'});
 }
});
test('declared and streamed size failures release/cancel the body',async()=>{
 let cancelled=false;
 const source=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(LIMITS.commandBytes+1));},cancel(){cancelled=true;}}));
 await assert.rejects(()=>boundedJSON(source,LIMITS.commandBytes),/body_too_large/);
 assert.equal(cancelled,true);assert.equal(source.body.locked,false);
 const small=Response.json({message:'ok'});await boundedJSON(small,100);assert.equal(small.body.locked,false);
});
test('invalid UTF-8 never silently changes command text',async()=>{
 const source=new Response(Uint8Array.from([123,34,120,34,58,34,255,34,125]));
 await assert.rejects(()=>boundedJSON(source,100),/invalid_json/);
});
test('expired downstream token returns sign-in-required, not a retryable database outage',async()=>{
 const response=await handle(request(command),env,async url=>url.endsWith('/user')?Response.json({id}):Response.json({message:'private token detail'},{status:401}));
 assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorized'});
});
test('health and unavailable readiness honor bodyless HEAD and deny mutation methods',async()=>{
 for(const path of ['/health','/readyz']){
  const head=await handle(new Request('https://vision.test'+path,{method:'HEAD'}),{VISION_ENV:'staging'});
  assert.equal(await head.text(),'');assert.ok(head.headers.get('x-request-id'));
  assert.equal((await handle(new Request('https://vision.test'+path,{method:'POST'}),env)).status,405);
 }
});
