import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPlan,readPage} from '../modules/views/read-contract.mjs';
import {handle} from '../backend/worker.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const env={VISION_ENV:'staging',SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const url=(extra='',resource='bookings')=>new URL('https://vision.example/api/v1/views/'+resource+'?tenant_id='+uid+extra);
const row=(n)=>({id:uid.slice(0,-1)+n,created_at:'2026-09-30T12:00:00.123456+00:00',status:'PENDING',private_note:'do not expose',jwt:'never expose'});
const request=(u)=>new Request(u,{headers:{authorization:'Bearer test.jwt.token'}});
test('Views read contracts allow only reviewed tables and columns',()=>{
 for(const resource of ['bookings','units','cleaning']){
  const p=readPlan(url('&select=passport&order=private&table=users',resource));
  assert.equal(p.resource,resource);assert.equal(p.params.get('tenant_id'),'eq.'+uid);
  assert.equal(p.params.get('limit'),'51');assert.ok(!p.params.get('select').includes('*'));assert.ok(!p.params.get('select').includes('passport'));assert.equal(p.params.get('table'),null);
 }
 assert.equal(readPlan(new URL('https://vision.example/api/private')),null);
});
test('invalid bounds, duplicate parameters and arbitrary cursor filters are rejected',()=>{
 for(const extra of ['&limit=0','&limit=101','&limit=-2','&limit=1e2','&limit=01','&limit=','&limit=2&limit=3','&tenant_id='+uid,'&cursor=', '&cursor='+btoa(JSON.stringify(['now()),id.gt.0',uid])), '&cursor='+btoa(JSON.stringify(['2026-09-30T12:00:00Z','bad-id']))])assert.throws(()=>readPlan(url(extra)),/invalid_page_query/);
 assert.equal(readPlan(url('&limit=100')).limit,100);
});
test('page retains array compatibility, strips unexpected fields and preserves microsecond cursor',()=>{
 const p=readPlan(url('&limit=2'));const page=readPage([row(3),row(2),row(1)],p);
 assert.equal(page.items.length,2);assert.equal(page.items[0].private_note,undefined);assert.equal(page.items[0].jwt,undefined);
 const next=readPlan(url('&limit=2&cursor='+page.nextCursor));
 assert.deepEqual(next.cursor,[row(2).created_at,row(2).id]);
 assert.equal(next.params.get('or'),`(created_at.lt.${row(2).created_at},and(created_at.eq.${row(2).created_at},id.lt.${row(2).id}))`);
 assert.equal(readPage([row(1)],p).nextCursor,null);assert.deepEqual(readPage([],p),{items:[],nextCursor:null});
});
test('malformed upstream rows and unbounded results cannot become valid DTOs',()=>{
 const p=readPlan(url('&limit=1'));
 for(const body of [null,{},[{}],[{...row(1),version:{token:'secret'}}],[row(1),row(2),row(3)]])assert.throws(()=>readPage(body,p),/upstream_invalid_response/);
});
test('staging Worker exposes cursor header without leaking unexpected fields',async()=>{
 const r=await handle(request(url('&limit=1')),env,async u=>u.endsWith('/user')?Response.json({id:uid}):Response.json([row(2),row(1)]));
 assert.equal(r.status,200);assert.equal(r.headers.get('x-page-limit'),'1');assert.ok(r.headers.get('x-next-cursor'));
 const body=await r.json();assert.equal(body.length,1);assert.equal(body[0].private_note,undefined);assert.equal(r.headers.get('cache-control'),'no-store');
});
test('malformed Views upstream is sanitized as unavailability, not a caller error',async()=>{
 const r=await handle(request(url()),env,async u=>u.endsWith('/user')?Response.json({id:uid}):Response.json([{}]));
 assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'backend_unavailable'});
});
test('health reports source and requirements, never claims authenticated database verification',async()=>{
 const r=await handle(new Request('https://vision.example/health'),{...env,VISION_SOURCE_COMMIT:'a'.repeat(40)});
 const body=await r.json();assert.equal(body.sourceCommit,'a'.repeat(40));assert.equal(body.probe,'liveness-config-only');assert.equal(body.requiredMigration,'0008_views_integrity.sql');
 const bad=await handle(new Request('https://vision.example/health'),{...env,VISION_SOURCE_COMMIT:'secret-shaped-value'});
 assert.equal((await bad.json()).sourceCommit,null);
});
