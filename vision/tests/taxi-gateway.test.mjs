import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../backend/worker.mjs';

const actor='00000000-0000-4000-8000-000000000001';
const tenant='00000000-0000-4000-8000-000000000002';
const organization='00000000-0000-4000-8000-000000000003';
const env={
  VISION_ENV:'staging',
  SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',
  SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'
};

function upstream(allowed=true){
  return async(url,options={})=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({id:actor});
    if(url.endsWith('/rest/v1/rpc/vision_session_scopes')){
      assert.equal(options.method,'POST');
      return Response.json({
        actor_id:actor,module:'views',
        scopes:allowed?[{
          tenant_id:tenant,organization_id:organization,organization_name:'Views Test',
          member_authorized:true,guest_linked:false
        }]:[]
      });
    }
    throw new Error('unexpected upstream '+url);
  };
}

function req(path,options={}){
  return new Request('https://vision.example'+path,{
    ...options,
    headers:{
      authorization:'Bearer test',
      'x-vertex-tenant-id':tenant,
      'x-vertex-organization-id':organization,
      'x-vertex-correlation-id':'00000000-0000-4000-8000-000000000004',
      ...options.headers
    }
  });
}

test('Taxi gateway fails closed without configured transport',async()=>{
  const response=await handle(req('/api/taxi/capabilities'),env,upstream());
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'taxi_integration_not_configured'});
});

test('Taxi gateway uses verified VISION identity and ignores spoofed user id',async()=>{
  const taxi={
    async fetch(request){
      assert.equal(request.url,'https://vertex-taxi-core.internal/integration/v1/capabilities');
      assert.equal(request.headers.get('x-vertex-user-id'),actor);
      assert.equal(request.headers.get('x-vertex-tenant-id'),tenant);
      assert.equal(request.headers.get('x-vertex-organization-id'),organization);
      assert.equal(request.headers.get('x-vertex-correlation-id'),'00000000-0000-4000-8000-000000000004');
      return Response.json({data:{module:'taxi',sourceOfTruth:'vertex-taxi-core'}});
    }
  };
  const response=await handle(req('/api/taxi/capabilities',{headers:{'x-vertex-user-id':'ffffffff-ffff-4fff-8fff-ffffffffffff'}}),{...env,VERTEX_TAXI_CORE:taxi},upstream());
  assert.equal(response.status,200);
  assert.equal((await response.json()).data.module,'taxi');
});

test('Taxi mutations require idempotency and preserve the key',async()=>{
  const missing=await handle(req('/api/taxi/rides',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),{...env,VERTEX_TAXI_CORE:{fetch:async()=>{throw new Error('must not call');}}},upstream());
  assert.equal(missing.status,400);assert.deepEqual(await missing.json(),{error:'idempotency_required'});

  const taxi={
    async fetch(request){
      assert.equal(request.method,'POST');
      assert.equal(request.headers.get('idempotency-key'),'ride-123');
      assert.equal((await request.json()).quoteId,'quote-1');
      return Response.json({data:{rideId:'ride-1',status:'SEARCHING'}},{status:201});
    }
  };
  const response=await handle(req('/api/taxi/rides',{
    method:'POST',
    headers:{'content-type':'application/json','idempotency-key':'ride-123'},
    body:JSON.stringify({quoteId:'quote-1'})
  }),{...env,VERTEX_TAXI_CORE:taxi},upstream());
  assert.equal(response.status,201);
  assert.equal((await response.json()).data.rideId,'ride-1');
});

test('Taxi gateway rejects scopes that are not server-authorized memberships',async()=>{
  let called=false;
  const response=await handle(req('/api/taxi/capabilities'),{...env,VERTEX_TAXI_CORE:{fetch:async()=>{called=true;return Response.json({});}}},upstream(false));
  assert.equal(response.status,403);
  assert.equal(called,false);
});

test('Taxi gateway sanitizes downstream failures',async()=>{
  const taxi={fetch:async()=>Response.json({message:'private taxi detail'},{status:503})};
  const response=await handle(req('/api/taxi/health'),{...env,VERTEX_TAXI_CORE:taxi},upstream());
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'taxi_unavailable'});
  assert.equal(response.headers.get('x-correlation-id'),'00000000-0000-4000-8000-000000000004');
});
