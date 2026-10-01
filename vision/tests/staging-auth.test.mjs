import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSupabaseStaging,validateStagingDatabaseURL,signInSynthetic} from '../staging/auth.mjs';

const ref='abcdefghijklmnopqrst';
const env={SUPABASE_STAGING_REF:ref,SUPABASE_URL:'https://'+ref+'.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_123'};

test('staging Supabase config is pinned to one project and publishable key',()=>{
  assert.deepEqual(validateSupabaseStaging(env),{projectRef:ref,url:env.SUPABASE_URL,key:env.SUPABASE_PUBLISHABLE_KEY});
  assert.throws(()=>validateSupabaseStaging({...env,SUPABASE_URL:'https://evil.supabase.co'}),/invalid_staging_url/);
  assert.throws(()=>validateSupabaseStaging({...env,SUPABASE_PUBLISHABLE_KEY:'service-role'}),/invalid_publishable_key/);
  assert.throws(()=>validateSupabaseStaging({...env,SUPABASE_STAGING_REF:'short'}),/invalid_staging_ref/);
});

test('staging database URL must match project and require TLS',()=>{
  const direct='postgresql://postgres:secret@db.'+ref+'.supabase.co:5432/postgres?sslmode=require';
  assert.equal(validateStagingDatabaseURL(direct,ref),direct);
  const pool='postgresql://postgres.'+ref+':secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require';
  assert.equal(validateStagingDatabaseURL(pool,ref),pool);
  assert.throws(()=>validateStagingDatabaseURL('postgresql://postgres:secret@db.otherproject123456789.supabase.co/postgres?sslmode=require',ref),/database_project_mismatch/);
  assert.throws(()=>validateStagingDatabaseURL('postgresql://postgres:secret@db.'+ref+'.supabase.co/postgres',ref),/staging_database_tls_required/);
  assert.throws(()=>validateStagingDatabaseURL('postgresql://postgres@db.'+ref+'.supabase.co/postgres?sslmode=require',ref),/invalid_staging_database_url/);
});

test('synthetic Auth sign-in returns only user id and token and sanitizes failures',async()=>{
  const calls=[];
  const session=await signInSynthetic({url:env.SUPABASE_URL,key:env.SUPABASE_PUBLISHABLE_KEY,email:'synthetic@example.invalid',password:'test-password-123'},async(url,options)=>{
    calls.push({url,options});
    return Response.json({user:{id:'11111111-1111-4111-8111-111111111111'},access_token:'x'.repeat(40),refresh_token:'must-not-return'});
  });
  assert.deepEqual(session,{userId:'11111111-1111-4111-8111-111111111111',token:'x'.repeat(40)});
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/auth/v1/token?grant_type=password'));
  assert.equal(calls[0].options.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);
  await assert.rejects(()=>signInSynthetic({url:env.SUPABASE_URL,key:env.SUPABASE_PUBLISHABLE_KEY,email:'synthetic@example.invalid',password:'test-password-123'},async()=>Response.json({error_description:'private detail'},{status:401})),/e2e_auth_failed/);
  await assert.rejects(()=>signInSynthetic({url:env.SUPABASE_URL,key:env.SUPABASE_PUBLISHABLE_KEY,email:'synthetic@example.invalid',password:'test-password-123'},async()=>Response.json({error:'rate'},{status:429})),/auth_unavailable/);
});
