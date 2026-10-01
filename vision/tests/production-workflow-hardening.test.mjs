import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflows=[
  '.github/workflows/vision-assembly.yml',
  '.github/workflows/vision-cloud-e2e.yml',
  '.github/workflows/vision-background-staging-smoke.yml',
  '.github/workflows/vision-staging-deploy.yml',
  '.github/workflows/vision-rc2-safety.yml',
  '.github/workflows/vision-production-backup-restore.yml',
  '.github/workflows/vision-promotion-gate.yml',
  '.github/workflows/build-android-apk.yml'
];

test('release evidence workflows pin first-party actions to immutable commit SHAs',()=>{
  for(const file of workflows){
    const body=fs.readFileSync(file,'utf8');
    const refs=[...body.matchAll(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s]+)/g)];
    assert.ok(refs.length>0,file+' has no reviewed first-party action references');
    for(const [,action,ref] of refs)assert.match(ref,/^[a-f0-9]{40}$/i,file+' '+action+' must be SHA-pinned');
  }
});

test('integrated assembly watches every release evidence workflow on PR and branch push',()=>{
  const body=fs.readFileSync('.github/workflows/vision-assembly.yml','utf8');
  for(const file of workflows.filter(x=>!x.endsWith('vision-assembly.yml'))){
    const count=body.split(file).length-1;
    assert.ok(count>=2,file+' must be watched by both pull_request and push path filters');
  }
});

test('production backup principal checker validates effective privileges',()=>{
  const body=fs.readFileSync('vision/production/check-backup-principal.mjs','utf8');
  for(const marker of ['has_table_privilege','has_sequence_privilege','has_function_privilege','pg_has_role','transaction_read_only'])
    assert.ok(body.includes(marker),'missing backup principal hardening: '+marker);
});
