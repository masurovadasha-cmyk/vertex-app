import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const policy=JSON.parse(fs.readFileSync(path.join(root,'vision/production/promotion-policy.json'),'utf8'));
const candidateRoot=process.env.VISION_PROMOTION_CANDIDATE_ROOT?path.resolve(process.env.VISION_PROMOTION_CANDIDATE_ROOT):root;
const release=JSON.parse(fs.readFileSync(path.join(candidateRoot,'vision/release/0.1-RC1.json'),'utf8'));
const args=new Set(process.argv.slice(2));
const policyOnly=args.has('--policy-only');
const evidenceDir=process.env.VISION_PROMOTION_EVIDENCE_DIR||process.argv.find(x=>!x.startsWith('--'));
const candidateSha=process.env.VISION_PROMOTION_CANDIDATE_SHA||null;
const reasons=[];

if(policy.productionMutationAllowed!==false)reasons.push('policy_allows_production_mutation');
if(policy.mode!=='evidence-only-no-deploy')reasons.push('invalid_policy_mode');
for(const [key,expected] of Object.entries(policy.requiredReleaseFlags||{})){
  if(release[key]!==expected)reasons.push('release_flag_must_remain_false:'+key+'='+String(release[key]));
}

let sourceCommit=null;
const evidence={};

if(policyOnly){
  reasons.push('external_evidence_not_evaluated','owner_approval_required');
}else{
  if(!/^[a-f0-9]{40}$/.test(candidateSha||''))reasons.push('invalid_candidate_sha');
  if(!evidenceDir)reasons.push('missing_evidence_directory');
  else{
    for(const item of policy.requiredEvidence){
      const file=path.join(evidenceDir,item.file);
      if(!fs.existsSync(file)){reasons.push('missing_evidence:'+item.id);continue;}
      try{evidence[item.id]=JSON.parse(fs.readFileSync(file,'utf8'));}
      catch{reasons.push('invalid_evidence_json:'+item.id);}
    }
  }

  const absorb=(id,record)=>{
    if(!record)return;
    const candidate=record.sourceCommit||record.source_commit||null;
    if(!/^[a-f0-9]{40}$/.test(candidate||'')){reasons.push('invalid_source_commit:'+id);return;}
    if(sourceCommit&&sourceCommit!==candidate)reasons.push('source_commit_mismatch:'+id);
    else sourceCommit=candidate;
    if(candidateSha&&candidate!==candidateSha)reasons.push('candidate_commit_mismatch:'+id);
  };
  for(const [id,record] of Object.entries(evidence))absorb(id,record);

  const assembly=evidence['integrated-assembly'];
  if(assembly){
    if(assembly.product!=='VERTEX Vision')reasons.push('assembly_product_mismatch');
    if(assembly.productionChanged!==false)reasons.push('assembly_production_changed');
    if(assembly.architectureVersion!==release.architectureVersion)reasons.push('assembly_architecture_mismatch');
    if(assembly.platformVersion!==release.platformVersion)reasons.push('assembly_platform_mismatch');
  }
  const rc2=evidence['rc2-safety'];
  if(rc2)for(const [key,expected] of Object.entries(policy.rules.rc2Safety))if(rc2[key]!==expected)reasons.push('rc2:'+key+'='+String(rc2[key]));
  const cloud=evidence['real-staging-auth-e2e'];
  if(cloud){
    for(const [key,expected] of Object.entries(policy.rules.cloudE2E))if(cloud[key]!==expected)reasons.push('cloud:'+key+'='+String(cloud[key]));
    if(cloud.architectureVersion!==release.architectureVersion)reasons.push('cloud_architecture_mismatch');
    if(cloud.latestMigration!==release.databaseMigration)reasons.push('cloud_migration_mismatch');
  }
  const background=evidence['background-staging-smoke'];
  if(background){
    for(const [key,expected] of Object.entries(policy.rules.backgroundSmoke))if(background[key]!==expected)reasons.push('background:'+key+'='+String(background[key]));
    if(background.sourceCommit!==candidateSha)reasons.push('background_candidate_commit_mismatch');
    if(!background.notifications||typeof background.notifications.claimed!=='number'||typeof background.notifications.failed!=='number')reasons.push('background_notifications_invalid');
    if(!background.escalations||typeof background.escalations.scopes!=='number'||typeof background.escalations.failed!=='number')reasons.push('background_escalations_invalid');
    if(background.notifications.failed!==0)reasons.push('background_notification_failures');
    if(background.escalations.failed!==0)reasons.push('background_escalation_failures');
  }
  const backup=evidence['production-backup-restore'];
  if(backup){
    for(const [key,expected] of Object.entries(policy.rules.productionBackupRestore))if(backup[key]!==expected)reasons.push('backup:'+key+'='+String(backup[key]));
    if(backup.targetMigration!==release.databaseMigration)reasons.push('backup_target_migration_mismatch');
    if(backup.backupSourceLatestMigration!==backup.restoredLatestMigration)reasons.push('backup_restore_version_mismatch');
  }
}

const blocking=policyOnly?reasons.filter(x=>!['external_evidence_not_evaluated','owner_approval_required'].includes(x)):reasons;
const status=policyOnly?'BLOCKED':blocking.length?'BLOCKED':policy.successStatus;
const report={
  status,
  mode:policyOnly?'policy-only':'evidence-evaluation',
  productionMutationAllowed:false,
  release:release.release,
  architectureVersion:release.architectureVersion,
  platformVersion:release.platformVersion,
  candidateSourceCommit:candidateSha,
  evidenceSourceCommit:sourceCommit,
  ownerApprovalRequired:true,
  deployPerformed:false,
  reasons
};
console.log(JSON.stringify(report,null,2));

if(policyOnly){
  if(status!=='BLOCKED'||!reasons.includes('external_evidence_not_evaluated')||!reasons.includes('owner_approval_required'))
    throw new Error('promotion_policy_must_be_blocked_without_external_evidence_and_owner_approval');
  if(blocking.length)throw new Error('promotion_policy_static_contract_invalid:'+blocking.join(','));
  process.exit(0);
}
if(status!=='EVIDENCE_PASS')process.exit(2);
