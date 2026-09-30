import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../backend/worker.mjs';

const uid='11111111-1111-4111-8111-111111111111';
const env={VISION_ENV:'staging',SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const commandRequest=(contentType='application/json',body='{}')=>new Request('https://vision.example/api/commands',{
  method:'POST',headers:{authorization:'Bearer test.jwt.token','content-type':contentType},body
});
const badResponses={
  malformed:()=>new Response('<html>private upstream detail</html>'),
  empty:()=>new Response(null),
  'oversized declared body':limit=>new Response('{}',{headers:{'content-length':String(limit+1)}}),
  'oversized streamed body':limit=>new Response(JSON.stringify('x'.repeat(limit)))
};

// A bad dependency response must never blame the caller's valid request.
for(const stage of ['auth','rpc']){
  for(const [kind,response] of Object.entries(badResponses)){
    test(`${stage}: ${kind} maps to a sanitized dependency failure`,async()=>{
      let calls=0;
      const result=await handle(commandRequest(),env,async()=>{
        calls++;
        if(stage==='rpc'&&calls===1)return Response.json({id:uid});
        return response(stage==='auth'?65536:1048576);
      });
      assert.equal(result.status,503);
      assert.deepEqual(await result.json(),{error:'backend_unavailable'});
      assert.equal(calls,stage==='auth'?1:2,'failed operations must not be retried implicitly');
      assert.equal(result.headers.get('cache-control'),'no-store');
    });
  }
}

test('Auth rate limiting is temporary unavailability, not invalid credentials',async()=>{
  let calls=0;
  const result=await handle(commandRequest(),env,async()=>{
    calls++;return Response.json({message:'private rate limit details'},{status:429});
  });
  assert.equal(result.status,503);
  assert.deepEqual(await result.json(),{error:'auth_unavailable'});
  assert.equal(calls,1);
});

for(const status of [401,403]){
  test(`Auth ${status} still rejects access and never sends a command`,async()=>{
    let calls=0;
    const result=await handle(commandRequest(),env,async()=>{
      calls++;return Response.json({message:'private auth detail'},{status});
    });
    assert.equal(result.status,401);
    assert.deepEqual(await result.json(),{error:'unauthorized'});
    assert.equal(calls,1);
  });
}

for(const contentType of ['application/jsonp','application/json-seq','text/plain','application/json, text/plain']){
  test(`command rejects unsupported media type ${contentType}`,async()=>{
    let calls=0;
    const result=await handle(commandRequest(contentType),env,async()=>{
      calls++;return Response.json(calls===1?{id:uid}:{order_id:uid});
    });
    assert.equal(result.status,415);
    assert.deepEqual(await result.json(),{error:'json_required'});
    assert.equal(calls,1,'unsupported bodies must not reach the command RPC');
  });
}

for(const contentType of ['application/json','application/json; charset=utf-8','Application/JSON; charset=UTF-8']){
  test(`command accepts JSON media type ${contentType}`,async()=>{
    let calls=0;
    const result=await handle(commandRequest(contentType),env,async()=>{
      calls++;return Response.json(calls===1?{id:uid}:{order_id:uid,version:1});
    });
    assert.equal(result.status,200);
    assert.deepEqual(await result.json(),{order_id:uid,version:1});
    assert.equal(calls,2);
  });
}

for(const stage of ['auth','rpc']){
  test(`${stage}: network failure stays sanitized and is not retried`,async()=>{
    let calls=0;
    const result=await handle(commandRequest(),env,async()=>{
      calls++;
      if(stage==='rpc'&&calls===1)return Response.json({id:uid});
      throw new Error('private connection detail');
    });
    assert.equal(result.status,503);
    assert.deepEqual(await result.json(),{error:'backend_unavailable'});
    assert.equal(calls,stage==='auth'?1:2);
  });
}

for(const [count,status] of [[4092,200],[4093,413]]){
  test(`request size limit counts UTF-8 bytes: ${count*2+8} bytes`,async()=>{
    let calls=0;
    const body=JSON.stringify({x:'я'.repeat(count)});
    assert.equal(new TextEncoder().encode(body).byteLength,count*2+8);
    const result=await handle(commandRequest('application/json',body),env,async()=>{
      calls++;return Response.json(calls===1?{id:uid}:{order_id:uid});
    });
    assert.equal(result.status,status);
    assert.equal(calls,status===200?2:1);
    if(status===413)assert.deepEqual(await result.json(),{error:'body_too_large'});
  });
}
