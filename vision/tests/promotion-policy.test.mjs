import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('promotion policy remains blocked until external evidence and explicit approval exist',()=>{
  const run=spawnSync(process.execPath,['vision/production/evaluate-promotion.mjs','--policy-only'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const report=JSON.parse(run.stdout);
  assert.equal(report.status,'BLOCKED');
  assert.equal(report.productionMutationAllowed,false);
  for(const reason of [
    'release_flag:cloudStagingVerified=false',
    'release_flag:productionReady=false',
    'release_flag:productionApproved=false'
  ])assert.ok(report.reasons.includes(reason),reason);
});

test('promotion policy itself forbids deployment side effects',()=>{
  const policy=JSON.parse(fs.readFileSync('vision/production/promotion-policy.json','utf8'));
  assert.equal(policy.mode,'evidence-only-no-deploy');
  assert.equal(policy.productionMutationAllowed,false);
  assert.deepEqual(policy.requiredEvidence.map(x=>x.id),[
    'integrated-assembly','rc2-safety','real-staging-auth-e2e','production-backup-restore'
  ]);
});
