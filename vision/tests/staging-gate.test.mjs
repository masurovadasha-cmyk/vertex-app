import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stagingConfig,validateDatabaseTarget,validateWorkerUrl} from '../tools/staging-config.mjs';

const ref='abcdefghijklmnopqrst';
const base={
  SUPABASE_STAGING_REF:ref,
  SUPABASE_URL:'https://'+ref+'.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic-test_key'
};

test('staging config accepts only a pinned non-privileged Supabase project',()=>{
  const value=stagingConfig(base);
  assert.equal(value.ref,ref);
  assert.equal(value.supabaseUrl,base.SUPABASE_URL);
  assert.throws(()=>stagingConfig({...base,SUPABASE_URL:'https://zzzzzzzzzzzzzzzzzzzz.supabase.co'}),/exactly match/);
  assert.throws(()=>stagingConfig({...base,SUPABASE_PUBLISHABLE_KEY:'service_role_secret'}),/privileged keys are forbidden/);
  assert.throws(()=>stagingConfig({...base,SUPABASE_STAGING_REF:'short'}),/20-character/);
});

test('database target must be Supabase staging with SSL and the same project ref',()=>{
  const pooled='postgresql://postgres.'+ref+':synthetic@aws-0-test.pooler.supabase.com:6543/postgres?sslmode=require';
  const direct='postgresql://postgres:synthetic@db.'+ref+'.supabase.co:5432/postgres?sslmode=verify-full';
  assert.match(validateDatabaseTarget(pooled,ref),/^postgresql:/);
  assert.match(validateDatabaseTarget(direct,ref),/^postgresql:/);
  assert.throws(()=>validateDatabaseTarget('postgresql://postgres:pw@localhost:5432/postgres?sslmode=require',ref),/not pinned/);
  assert.throws(()=>validateDatabaseTarget('postgresql://postgres.'+ref+':pw@aws-0-test.pooler.supabase.com:6543/postgres',ref),/sslmode/);
  assert.throws(()=>validateDatabaseTarget('postgresql://postgres.otherprojectref00:pw@aws-0-test.pooler.supabase.com:6543/postgres?sslmode=require',ref),/not pinned/);
});

test('worker smoke target must be remote HTTPS',()=>{
  assert.equal(validateWorkerUrl('https://vertex-vision-staging.example.workers.dev/'),'https://vertex-vision-staging.example.workers.dev');
  assert.throws(()=>validateWorkerUrl('http://vertex-vision-staging.example.workers.dev'),/https/);
  assert.throws(()=>validateWorkerUrl('https://localhost:8787'),/remote staging/);
});
