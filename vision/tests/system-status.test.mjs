import test from 'node:test';
import assert from 'node:assert/strict';
import {systemStatusBase,projectSystemStatus} from '../backend/system-status.mjs';
import {handle} from '../backend/worker.mjs';

const env={
  VISION_ENV:'staging',
  VISION_SOURCE_COMMIT:'a'.repeat(40),
  SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',
  SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'
};

test('system status base exposes only non-sensitive config flags',()=>{
  const value=systemStatusBase({...env,VISION_BACKGROUND_CONSUMER_CONNECTED:'1'});
  assert.deepEqual(value,{
    service:'VERTEX VISION',
    environment:'staging',
    sourceCommit:'a'.repeat(40),
    architectureVersion:'2.3',
    requiredMigration:'0019_external_module_delegation.sql',
    backendConfigured:true,
    backgroundConsumerConnected:true,
    escalationSchedulerConnected:false
  });
  assert.equal(JSON.stringify(value).includes('sb_publishable_test'),false);
  assert.equal(Object.hasOwn(value,'SUPABASE_URL'),false);
});

test('system status projector distinguishes unchecked readiness from not-ready',()=>{
  const base=systemStatusBase(env);
  assert.deepEqual(projectSystemStatus(base,null,false),{
    ...base,readinessChecked:false,databaseReady:null,latestMigration:null,migrationCount:null,viewsReleaseActive:null
  });
  const ready=projectSystemStatus(base,{
    ready:false,latestMigration:'0019_external_module_delegation.sql',migrationCount:19,viewsReleaseActive:true
  },true);
  assert.equal(ready.readinessChecked,true);
  assert.equal(ready.databaseReady,false);
  assert.equal(ready.latestMigration,'0019_external_module_delegation.sql');
});

test('system-status endpoint returns honest disconnected state without backend call',async()=>{
  let calls=0;
  const response=await handle(new Request('https://vision.example/system-status'),{VISION_ENV:'staging'},async()=>{calls++;throw new Error('must not call');});
  assert.equal(response.status,200);assert.equal(calls,0);
  const body=await response.json();
  assert.equal(body.backendConfigured,false);
  assert.equal(body.readinessChecked,false);
  assert.equal(body.databaseReady,null);
});

test('system-status endpoint projects live readiness when configured',async()=>{
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
  const response=await handle(new Request('https://vision.example/system-status'),env,async(url,options)=>{
    assert.equal(url,env.SUPABASE_URL+'/rest/v1/rpc/vision_runtime_readiness');
    assert.equal(options.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);
    return Response.json(raw);
  });
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.backendConfigured,true);
  assert.equal(body.readinessChecked,true);
  assert.equal(body.databaseReady,true);
  assert.equal(body.latestMigration,'0019_external_module_delegation.sql');
  assert.equal(body.sourceCommit,'a'.repeat(40));
});

test('system-status fails soft when readiness dependency is unavailable',async()=>{
  const response=await handle(new Request('https://vision.example/system-status'),env,async()=>new Response('bad',{status:503,headers:{'content-type':'text/plain'}}));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.backendConfigured,true);
  assert.equal(body.readinessChecked,false);
  assert.equal(body.databaseReady,null);
});
