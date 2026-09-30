import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../backend/worker.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const env={VISION_ENV:'staging',SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const request=(path,options={})=>new Request('https://vision.example'+path,{...options,headers:{authorization:'Bearer test.jwt.token',...options.headers}});
test('unconfigured or production environment fails closed',async()=>{
  for(const config of [{},{...env,VISION_ENV:'production'},{...env,SUPABASE_PUBLISHABLE_KEY:'service-role'},{...env,SUPABASE_URL:'https://production.example'}])
    assert.equal((await handle(request('/api/orders'),config)).status,503);
});
test('missing JWT and foreign origin never reach upstream',async()=>{
  const noFetch=()=>{throw new Error('must not call upstream');};
  assert.equal((await handle(new Request('https://vision.example/api/orders'),env,noFetch)).status,401);
  assert.equal((await handle(request('/api/orders',{headers:{origin:'https://evil.example'}}),env,noFetch)).status,403);
});
test('verified user token is forwarded to SQL RPC without privileged substitution',async()=>{
  const calls=[];const command={type:'create',tenant_id:uid,idempotency_key:'same-retry'};
  const response=await handle(request('/api/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)}),env,async(url,options)=>{
    calls.push({url,options});return Response.json(calls.length===1?{id:uid}:{order_id:uid,version:1});
  });
  assert.equal(response.status,200);assert.equal(calls.length,2);
  assert.equal(calls[0].url,env.SUPABASE_URL+'/auth/v1/user');
  assert.equal(calls[1].options.headers.authorization,'Bearer test.jwt.token');
  assert.deepEqual(JSON.parse(calls[1].options.body),{command});
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('bad JWT is rejected by Auth, no RPC runs',async()=>{
  let calls=0;const response=await handle(request('/api/commands',{method:'POST'}),env,async()=>{calls++;return Response.json({error:'invalid'},{status:401});});
  assert.equal(response.status,401);assert.equal(calls,1);
});
test('SQL conflict and denied access map without leaking database details',async()=>{
  for(const [code,status] of [['40001',409],['23505',409],['42501',403],['22023',400],['XX000',503]]){
    const r=await handle(request('/api/commands',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env,async url=>
      url.endsWith('/user')?Response.json({id:uid}):Response.json({code,message:'private detail'},{status:400}));
    assert.equal(r.status,status);assert.ok(!(await r.text()).includes('private detail'));
  }
});
test('bounded request body, malformed JSON and arbitrary routes fail safely',async()=>{
  const auth=async()=>Response.json({id:uid});
  assert.equal((await handle(request('/api/commands',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(9000)}),env,auth)).status,413);
  assert.equal((await handle(request('/api/commands',{method:'POST',headers:{'content-type':'application/json'},body:'{'}),env,auth)).status,400);
  assert.equal((await handle(request('/rest/v1/vision_users'),env,auth)).status,404);
});
test('order reads require tenant and cannot inject PostgREST filters',async()=>{
  const urls=[];const f=async url=>{urls.push(url);return Response.json(url.endsWith('/user')?{id:uid}:[]);};
  assert.equal((await handle(request('/api/orders?tenant_id=eq.hack'),env,f)).status,400);
  assert.equal((await handle(request('/api/orders?tenant_id='+uid+'&select=secret&limit=10000'),env,f)).status,200);
  const u=new URL(urls.at(-1));assert.equal(u.searchParams.get('limit'),'50');assert.equal(u.searchParams.get('tenant_id'),'eq.'+uid);
});

test('versioned Views API routes commands to the dedicated RPC and fixes read filters',async()=>{
  const calls=[];
  const command={type:'create_booking',tenant_id:uid,idempotency_key:'views-retry',organization_id:uid,unit_id:uid,customer_id:uid,check_in:'2026-10-10',check_out:'2026-10-12'};
  const write=await handle(request('/api/v1/views/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)}),env,async(url,options)=>{
    calls.push({url,options});
    return Response.json(calls.length===1?{id:uid}:{booking_id:uid,booking_status:'PENDING',booking_version:1});
  });
  assert.equal(write.status,200);
  assert.equal(calls[1].url,env.SUPABASE_URL+'/rest/v1/rpc/vision_views_command');
  assert.deepEqual(JSON.parse(calls[1].options.body),{command});

  const urls=[];
  const read=await handle(request('/api/v1/views/bookings?tenant_id='+uid+'&select=private&limit=9999'),env,async url=>{
    urls.push(url);return Response.json(url.endsWith('/user')?{id:uid}:[]);
  });
  assert.equal(read.status,200);
  const upstream=new URL(urls.at(-1));
  assert.match(upstream.pathname,/vision_views_bookings$/);
  assert.equal(upstream.searchParams.get('tenant_id'),'eq.'+uid);
  assert.equal(upstream.searchParams.get('select'),'*');
  assert.equal(upstream.searchParams.get('limit'),'50');
});
