import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../backend/worker.mjs';

const uid='11111111-1111-4111-8111-111111111111';
const org='22222222-2222-4222-8222-222222222222';
const env={VISION_ENV:'staging',SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const request=(path,options={})=>new Request('https://vision.example'+path,{...options,headers:{authorization:'Bearer test.jwt.token',...options.headers}});

test('Views command uses dedicated RPC and retains the user bearer token',async()=>{
  const calls=[];const command={type:'unit.create',tenant_id:uid,organization_id:org,idempotency_key:'unit-1',code:'235',name:'Apartment 235'};
  const response=await handle(request('/api/views/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)}),env,async(url,options)=>{
    calls.push({url,options});
    return Response.json(calls.length===1?{id:uid}:{unit_id:uid,status:'ACTIVE',version:1});
  });
  assert.equal(response.status,200);
  assert.equal(calls.length,2);
  assert.equal(calls[1].url,env.SUPABASE_URL+'/rest/v1/rpc/vision_views_command');
  assert.equal(calls[1].options.headers.authorization,'Bearer test.jwt.token');
  assert.deepEqual(JSON.parse(calls[1].options.body),{command});
});

test('Views reads require one UUID organization and ignore injected PostgREST filters',async()=>{
  const urls=[];const f=async url=>{urls.push(url);return Response.json(url.endsWith('/user')?{id:uid}:[]);};
  assert.equal((await handle(request('/api/views/calendar?organization_id=eq.hack'),env,f)).status,400);
  const response=await handle(request('/api/views/calendar?organization_id='+org+'&select=secret&limit=10000&tenant_id=eq.hack'),env,f);
  assert.equal(response.status,200);
  const u=new URL(urls.at(-1));
  assert.equal(u.pathname,'/rest/v1/vision_views_calendar');
  assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
  assert.equal(u.searchParams.get('select'),'*');
  assert.equal(u.searchParams.get('limit'),'100');
  assert.equal(u.searchParams.has('tenant_id'),false);
});

test('Views read surfaces are allowlisted only',async()=>{
  const f=async url=>Response.json(url.endsWith('/user')?{id:uid}:[]);
  for(const path of ['units','guests','bookings','calendar','maintenance','finance','dashboard'])
    assert.equal((await handle(request('/api/views/'+path+'?organization_id='+org),env,f)).status,200,path);
  assert.equal((await handle(request('/api/views/users?organization_id='+org),env,f)).status,404);
});

test('date/check constraint SQLSTATEs map to sanitized invalid_command',async()=>{
  for(const code of ['22007','23514']){
    const r=await handle(request('/api/views/commands',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env,async url=>
      url.endsWith('/user')?Response.json({id:uid}):Response.json({code,message:'private database detail'},{status:400}));
    assert.equal(r.status,400);
    assert.deepEqual(await r.json(),{error:'invalid_command'});
  }
});
