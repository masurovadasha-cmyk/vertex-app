import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../backend/worker.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const org='22222222-2222-4222-8222-222222222222';
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
  for(const [code,status] of [['40001',409],['23505',409],['42501',403],['22023',400],['23514',400],['22003',400],['23P01',409],['XX000',503]]){
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
    return Response.json(calls.length===1?{id:uid}:{booking_id:uid,booking_status:'PENDING',booking_version:1,unit_id:uid,correlation_id:uid,private_note:'must-not-leak'});
  });
  assert.equal(write.status,200);
  assert.equal(calls[1].url,env.SUPABASE_URL+'/rest/v1/rpc/vision_views_command');
  assert.deepEqual(JSON.parse(calls[1].options.body),{command});
  assert.equal((await write.clone().json()).private_note,undefined);
  assert.match(write.headers.get('x-request-id')||'',/^[0-9a-f-]{36}$/i);
  assert.equal(write.headers.get('x-correlation-id'),uid);

  const urls=[];
  const read=await handle(request('/api/v1/views/bookings?tenant_id='+uid+'&organization_id='+org+'&select=private&limit=50'),env,async url=>{
    urls.push(url);return Response.json(url.endsWith('/user')?{id:uid}:[]);
  });
  assert.equal(read.status,200);
  const upstream=new URL(urls.at(-1));
  assert.match(upstream.pathname,/vision_views_bookings$/);
  assert.equal(upstream.searchParams.get('tenant_id'),'eq.'+uid);assert.equal(upstream.searchParams.get('organization_id'),'eq.'+org);
  assert.ok(!upstream.searchParams.get('select').includes('*'));
  assert.ok(!upstream.searchParams.get('select').includes('private'));
  assert.equal(upstream.searchParams.get('limit'),'51');
  assert.equal(read.headers.get('x-page-limit'),'50');
  const oversized=await handle(request('/api/v1/views/bookings?tenant_id='+uid+'&organization_id='+org+'&limit=9999'),env,async url=>{
    assert.ok(url.endsWith('/user'),'invalid pagination must not query data');return Response.json({id:uid});
  });
  assert.equal(oversized.status,400);
});

test('staging worker serves static assets without requiring backend secrets',async()=>{
  let seen=0;
  const assets={fetch:async request=>{seen++;assert.equal(new URL(request.url).pathname,'/index.html');return new Response('vision-ui',{status:200});}};
  const response=await handle(new Request('https://vision.example/index.html'),{VISION_ENV:'staging',ASSETS:assets});
  assert.equal(response.status,200);assert.equal(await response.text(),'vision-ui');assert.equal(seen,1);
});

test('session context comes only from server RPC and is projected to an allowlisted contract',async()=>{
  const calls=[];
  const response=await handle(request('/api/v1/context?tenant_id='+uid+'&organization_id='+uid),env,async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/auth/v1/user'))return Response.json({id:uid});
    return Response.json({
      actor_id:uid,tenant_id:uid,organization_id:uid,module:'views',module_enabled:true,guest_linked:false,
      roles:['views-manager'],permissions:['views.operations.read','views.booking.manage'],
      capabilities:{read_operations:true,create_booking:false,manage_booking:true,execute_cleaning:false,verify_cleaning:false},
      injected:'must-not-leak'
    });
  });
  assert.equal(response.status,200);assert.equal(calls.length,2);
  assert.equal(calls[1].url,env.SUPABASE_URL+'/rest/v1/rpc/vision_session_context');
  assert.deepEqual(JSON.parse(calls[1].options.body),{p_tenant:uid,p_organization:uid});
  const body=await response.json();
  assert.deepEqual(body,{
    actorId:uid,tenantId:uid,organizationId:uid,module:'views',moduleEnabled:true,guestLinked:false,
    roles:['views-manager'],permissions:['views.operations.read','views.booking.manage'],
    capabilities:{read_operations:true,create_booking:false,manage_booking:true,execute_cleaning:false,verify_cleaning:false}
  });
  assert.equal(Object.hasOwn(body,'injected'),false);
});

test('invalid session-context query is rejected before context RPC',async()=>{
  let calls=0;
  const response=await handle(request('/api/v1/context?tenant_id='+uid),env,async url=>{calls++;return Response.json({id:uid});});
  assert.equal(response.status,400);assert.equal(calls,1);
  assert.equal((await response.json()).error,'invalid_context_query');
});

test('malformed session context from upstream fails closed',async()=>{
  const response=await handle(request('/api/v1/context?tenant_id='+uid+'&organization_id='+uid),env,async url=>
    url.endsWith('/user')?Response.json({id:uid}):Response.json({actor_id:uid,tenant_id:uid,organization_id:uid,module:'views',module_enabled:true,roles:[],permissions:['../../admin'],guest_linked:false,capabilities:{}})
  );
  assert.equal(response.status,503);assert.equal((await response.json()).error,'backend_unavailable');
});

test('Views reads require organization scope and never broaden to all authorized orgs',async()=>{
  let calls=0;
  const missing=await handle(request('/api/v1/views/bookings?tenant_id='+uid),env,async url=>{calls++;return Response.json({id:uid});});
  assert.equal(missing.status,400);assert.equal(calls,1);assert.equal((await missing.json()).error,'organization_id_required');
});

test('typed Views command contract rejects malformed payload before SQL RPC',async()=>{
  const bad=[
    {type:'check_in',tenant_id:uid,idempotency_key:'bad-1',booking_id:uid,expected_version:'1'},
    {type:'check_out',tenant_id:uid,idempotency_key:'bad-2',booking_id:uid,expected_version:1,admin:true},
    {type:'create_booking',tenant_id:uid,idempotency_key:'bad-3',organization_id:uid,unit_id:uid,customer_id:uid,check_in:'2026-02-30',check_out:'2026-03-02'},
    {type:'refund_everything',tenant_id:uid,idempotency_key:'bad-4'}
  ];
  for(const command of bad){
    let calls=0;
    const response=await handle(request('/api/v1/views/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)}),env,async url=>{
      calls++;
      assert.ok(url.endsWith('/auth/v1/user'),'invalid command must not reach SQL RPC');
      return Response.json({id:uid});
    });
    assert.equal(response.status,400);assert.equal((await response.json()).error,'invalid_command');assert.equal(calls,1);
  }
});

test('every API response has a request ID and separate requests do not reuse it',async()=>{
  const f=async url=>url.endsWith('/user')?Response.json({id:uid}):Response.json([]);
  const a=await handle(request('/api/orders?tenant_id='+uid),env,f);
  const b=await handle(request('/api/orders?tenant_id='+uid),env,f);
  const first=a.headers.get('x-request-id'),second=b.headers.get('x-request-id');
  assert.match(first||'',/^[0-9a-f-]{36}$/i);assert.match(second||'',/^[0-9a-f-]{36}$/i);assert.notEqual(first,second);
});


test('Unified Work Feed uses scoped RPC and returns only projected read data',async()=>{
  const calls=[];const now='2026-10-01T01:00:00.000Z';
  const upstream={
    generated_at:now,
    tasks:[{id:uid,type:'task',source:'core.task',title:'Prepare unit',status:'IN_PROGRESS',priority:'HIGH',due_at:null,assigned_to_me:true,source_id:uid,created_at:now,updated_at:now}],
    approvals:[],attention:[],requests:[],
    counts:{tasks:1,approvals:0,attention:0,requests:0}
  };
  const response=await handle(request('/api/v1/work-feed?tenant_id='+uid+'&organization_id='+org+'&limit=25'),env,async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/auth/v1/user'))return Response.json({id:uid});
    return Response.json({...upstream,private_note:'must-not-leak'});
  });
  // Unknown upstream fields fail closed instead of crossing the trust boundary.
  assert.equal(response.status,503);
  assert.equal(calls[1].url,env.SUPABASE_URL+'/rest/v1/rpc/vision_work_feed');
  assert.deepEqual(JSON.parse(calls[1].options.body),{p_tenant:uid,p_organization:org,p_limit:25});

  calls.length=0;
  const ok=await handle(request('/api/v1/work-feed?tenant_id='+uid+'&organization_id='+org+'&limit=25'),env,async(url,options)=>{
    calls.push({url,options});return Response.json(url.endsWith('/auth/v1/user')?{id:uid}:upstream);
  });
  assert.equal(ok.status,200);
  const body=await ok.json();
  assert.equal(body.tasks[0].assignedToMe,true);
  assert.equal(body.tasks[0].sourceId,uid);
  assert.equal(body.counts.tasks,1);
  assert.equal(Object.hasOwn(body,'private_note'),false);

  let invalidCalls=0;
  const invalid=await handle(request('/api/v1/work-feed?tenant_id='+uid+'&organization_id='+org+'&limit=999'),env,async url=>{invalidCalls++;return Response.json({id:uid});});
  assert.equal(invalid.status,400);assert.equal(invalidCalls,1);assert.equal((await invalid.json()).error,'invalid_work_feed_query');
});
