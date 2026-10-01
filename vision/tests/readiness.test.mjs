import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';
import {handle} from '../backend/worker.mjs';

const env={
  VISION_ENV:'staging',
  SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',
  SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'
};
const raw={
  ready:true,
  latest_migration:'0019_external_module_delegation.sql',
  migration_count:19,
  tables_ok:true,
  functions_ok:true,
  rls_ok:true,
  views_release_active:true,
  architecture_version:'2.3'
};

test('runtime readiness proves migration level, RLS, required functions and Views release state',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;');
  await migrate(db);
  let result=(await db.query('select public.vision_runtime_readiness() data')).rows[0].data;
  assert.deepEqual(result,raw);

  await db.exec('set role anon');
  try{
    result=(await db.query('select public.vision_runtime_readiness() data')).rows[0].data;
    assert.equal(result.ready,true);
  }finally{await db.exec('reset role');}

  await db.query("update public.vision_module_definitions set release_state='DISABLED' where id='views'");
  result=(await db.query('select public.vision_runtime_readiness() data')).rows[0].data;
  assert.equal(result.ready,false);assert.equal(result.views_release_active,false);
  await db.query("update public.vision_module_definitions set release_state='ACTIVE' where id='views'");

  await db.exec('alter table public.vision_views_units disable row level security');
  result=(await db.query('select public.vision_runtime_readiness() data')).rows[0].data;
  assert.equal(result.ready,false);assert.equal(result.rls_ok,false);
});

test('readyz uses publishable key only and returns an allowlisted readiness DTO',async()=>{
  let calls=0;
  const response=await handle(new Request('https://vision.example/readyz'),env,async(url,options)=>{
    calls++;
    assert.equal(url,env.SUPABASE_URL+'/rest/v1/rpc/vision_runtime_readiness');
    assert.equal(options.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(Object.hasOwn(options.headers,'authorization'),false);
    assert.equal(options.body,'{}');
    return Response.json({...raw,private_schema:'never'});
  });
  // Unknown upstream fields fail closed rather than being silently forwarded.
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{ready:false,error:'readiness_unavailable'});assert.equal(calls,1);

  const ok=await handle(new Request('https://vision.example/readyz'),env,async()=>Response.json(raw));
  assert.equal(ok.status,200);
  assert.deepEqual(await ok.json(),{
    ready:true,latestMigration:'0019_external_module_delegation.sql',migrationCount:19,
    tablesOk:true,functionsOk:true,rlsOk:true,viewsReleaseActive:true,architectureVersion:'2.3'
  });
  assert.match(ok.headers.get('x-request-id')||'',/^[0-9a-f-]{36}$/i);
});

test('readyz fails closed on stale schema, malformed upstream, missing config and wrong methods',async()=>{
  const stale=await handle(new Request('https://vision.example/readyz'),env,async()=>Response.json({...raw,ready:false,latest_migration:'0009_application_kernel.sql',migration_count:9}));
  assert.equal(stale.status,503);assert.equal((await stale.json()).ready,false);

  const malformed=await handle(new Request('https://vision.example/readyz'),env,async()=>Response.json({...raw,architecture_version:'9.9'}));
  assert.equal(malformed.status,503);assert.equal((await malformed.json()).error,'readiness_unavailable');

  let calls=0;
  const missing=await handle(new Request('https://vision.example/readyz'),{VISION_ENV:'staging'},async()=>{calls++;return Response.json(raw);});
  assert.equal(missing.status,503);assert.equal(calls,0);assert.equal((await missing.json()).error,'backend_not_configured');

  const method=await handle(new Request('https://vision.example/readyz',{method:'POST'}),env,async()=>{throw new Error('must not call upstream');});
  assert.equal(method.status,405);

  const head=await handle(new Request('https://vision.example/readyz',{method:'HEAD'}),env,async()=>Response.json(raw));
  assert.equal(head.status,200);assert.equal(await head.text(),'');
});
