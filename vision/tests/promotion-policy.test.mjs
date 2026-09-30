import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('promotion policy remains blocked until external evidence and owner approval exist',()=>{
  const run=spawnSync(process.execPath,['vision/production/evaluate-promotion.mjs','--policy-only'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const report=JSON.parse(run.stdout);
  assert.equal(report.status,'BLOCKED');
  assert.equal(report.productionMutationAllowed,false);
  assert.equal(report.ownerApprovalRequired,true);
  assert.equal(report.deployPerformed,false);
  assert.ok(report.reasons.includes('external_evidence_not_evaluated'));
  assert.ok(report.reasons.includes('owner_approval_required'));
  assert.ok(!report.reasons.some(x=>x.startsWith('release_flag_must_remain_false:')));
});

test('candidate release flags stay false while promotion evidence is evaluated externally',()=>{
  const release=JSON.parse(fs.readFileSync('vision/release/0.1-RC1.json','utf8'));
  assert.equal(release.cloudStagingVerified,false);
  assert.equal(release.productionReady,false);
  assert.equal(release.productionApproved,false);
});

test('promotion policy forbids deployment side effects and requires same-source evidence',()=>{
  const policy=JSON.parse(fs.readFileSync('vision/production/promotion-policy.json','utf8'));
  assert.equal(policy.version,'0.2');
  assert.equal(policy.mode,'evidence-only-no-deploy');
  assert.equal(policy.productionMutationAllowed,false);
  assert.equal(policy.candidateSourceCommitRequired,true);
  assert.equal(policy.externalOwnerApprovalRequired,true);
  assert.equal(policy.successStatus,'EVIDENCE_PASS');
  assert.deepEqual(policy.requiredEvidence.map(x=>x.id),[
    'integrated-assembly','rc2-safety','real-staging-auth-e2e','production-backup-restore'
  ]);
});


test('trusted promotion evaluator reads candidate release from an isolated checkout',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vision-candidate-'));
  try{
    fs.mkdirSync(path.join(dir,'vision/release'),{recursive:true});
    const release=JSON.parse(fs.readFileSync('vision/release/0.1-RC1.json','utf8'));
    release.productionReady=true;
    fs.writeFileSync(path.join(dir,'vision/release/0.1-RC1.json'),JSON.stringify(release));
    const run=spawnSync(process.execPath,['vision/production/evaluate-promotion.mjs','--policy-only'],{
      encoding:'utf8',env:{...process.env,VISION_PROMOTION_CANDIDATE_ROOT:dir}
    });
    assert.notEqual(run.status,0);
    assert.match(run.stderr+run.stdout,/release_flag_must_remain_false:productionReady=true/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('manual promotion uses protected master as controller and separate immutable candidate checkout',()=>{
  const workflow=fs.readFileSync('.github/workflows/vision-promotion-gate.yml','utf8');
  assert.match(workflow,/Require protected master release controller/);
  assert.match(workflow,/test "\$GITHUB_REF" = "refs\/heads\/master"/);
  assert.match(workflow,/Checkout immutable candidate separately[\s\S]*ref: \$\{\{ inputs\.candidate_sha \}\}[\s\S]*path: candidate/);
  assert.match(workflow,/VISION_PROMOTION_CANDIDATE_ROOT: candidate/);
  assert.match(workflow,/Verify evidence workflow identities before downloading artifacts/);
});
