import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSessionScopes} from '../contracts/session-scopes.mjs';
import {publicAuthConfig} from '../backend/auth-config.mjs';
import {handle} from '../backend/worker.mjs';

const actor='00000000-0000-4000-8000-000000000011';
const tenant='00000000-0000-4000-8000-000000000001';
const org='00000000-0000-4000-8000-000000000002';
const env={
  VISION_ENV:'staging',
  SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',
  SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'
};

test('session scope projector allowlists accessible Views workspaces',()=>{
  const value=projectSessionScopes({
    actor_id:actor,module:'views',
    scopes:[{tenant_id:tenant,organization_id:org,organization_name:'Views Hotel & Apartments',member_authorized:true,guest_linked:false}]
  });
  assert.equal(value.actorId,actor);
  assert.equal(value.scopes.length,1);
  assert.deepEqual(value.scopes[0],{
    tenantId:tenant,organizationId:org,organizationName:'Views Hotel & Apartments',
    memberAuthorized:true,guestLinked:false
  });
  assert.throws(()=>projectSessionScopes({
    actor_id:actor,module:'views',
    scopes:[{tenant_id:tenant,organization_id:org,organization_name:'Views',member_authorized:false,guest_linked:false}]
  }),/upstream_invalid_response/);
  assert.throws(()=>projectSessionScopes({
    actor_id:actor,module:'views',
    scopes:[{tenant_id:tenant,organization_id:org,organization_name:'Views',member_authorized:true,guest_linked:false,private_role:'never'}]
  }),/upstream_invalid_response/);
});

test('public auth config contains only client-safe Supabase staging metadata',()=>{
  const value=publicAuthConfig(env);
  assert.deepEqual(value,{
    provider:'supabase',environment:'staging',url:env.SUPABASE_URL,
    publishableKey:env.SUPABASE_PUBLISHABLE_KEY,passwordGrant:true,persistence:'memory-only'
  });
  assert.equal(JSON.stringify(value).includes('password'),true);
  assert.equal(Object.hasOwn(value,'serviceRoleKey'),false);
  assert.equal(publicAuthConfig({VISION_ENV:'staging'}),null);
});

test('auth-config fails closed unless staging Supabase public config is complete',async()=>{
  const missing=await handle(new Request('https://vision.example/auth-config'),{VISION_ENV:'staging'},async()=>{throw new Error('no network');});
  assert.equal(missing.status,503);
  assert.deepEqual(await missing.json(),{error:'backend_not_configured'});

  const ok=await handle(new Request('https://vision.example/auth-config'),env,async()=>{throw new Error('no network');});
  assert.equal(ok.status,200);
  const body=await ok.json();
  assert.equal(body.provider,'supabase');
  assert.equal(body.persistence,'memory-only');
  assert.equal(body.publishableKey,env.SUPABASE_PUBLISHABLE_KEY);
});

test('session-scopes endpoint verifies bearer identity then projects RPC response',async()=>{
  let call=0;
  const response=await handle(
    new Request('https://vision.example/api/v1/session-scopes',{headers:{authorization:'Bearer test.jwt.token'}}),
    env,
    async(url,options)=>{
      call++;
      if(call===1){
        assert.equal(url,env.SUPABASE_URL+'/auth/v1/user');
        return Response.json({id:actor});
      }
      assert.equal(url,env.SUPABASE_URL+'/rest/v1/rpc/vision_session_scopes');
      assert.equal(options.body,'{}');
      return Response.json({
        actor_id:actor,module:'views',
        scopes:[{tenant_id:tenant,organization_id:org,organization_name:'Views Hotel & Apartments',member_authorized:true,guest_linked:false}]
      });
    }
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.actorId,actor);
  assert.equal(body.scopes[0].organizationId,org);
  assert.equal(call,2);
});

test('session-scopes rejects query parameters and invalid bearer tokens',async()=>{
  const invalidQuery=await handle(
    new Request('https://vision.example/api/v1/session-scopes?tenant_id='+tenant,{headers:{authorization:'Bearer test.jwt.token'}}),
    env,
    async(url)=>{
      if(url.endsWith('/auth/v1/user'))return Response.json({id:actor});
      throw new Error('must not reach RPC');
    }
  );
  assert.equal(invalidQuery.status,400);
  assert.deepEqual(await invalidQuery.json(),{error:'invalid_session_scopes_query'});

  const unauth=await handle(new Request('https://vision.example/api/v1/session-scopes'),env,async()=>{throw new Error('must not call');});
  assert.equal(unauth.status,401);
});
