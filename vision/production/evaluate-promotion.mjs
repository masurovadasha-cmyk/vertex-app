import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const policy=JSON.parse(fs.readFileSync(path.join(root,'vision/production/promotion-policy.json'),'utf8'));
const release=JSON.parse(fs.readFileSync(path.join(root,'vision/release/0.1-RC1.json'),'utf8'));

const args=new Set(process.argv.slice(2));
const policyOnly=args.has('--policy-only');
const evidenceDir=process.env.VISION_PROMOTION_EVIDENCE_DIR||process.argv.find(x=>!x.startsWith('--'));

const reasons=[];
if(policy.productionMutationAllowed!==false)reasons.push('policy_allows_production_mutation');
if(policy.mode!=='evidence-only-no-deploy')reasons.push('invalid_policy_mode');

for(const [key,expected] of Object.entries(policy.requiredReleaseFlags||{})){
  if(release[key]!==expected)reasons.push('release_flag:'+key+'='+String(release[key]));
}

let sourceCommit=null;
const evidence={};
if(!policyOnly){
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
    if(candidate){
      if(!/^[a-f0-9]{40}$/.test(candidate))reasons.push('invalid_source_commit:'+id);
      else if(sourceCommit&&sourceCommit!==candidate)reasons.push('source_commit_mismatch:'+id);
      else sourceCommit=candidate;
    }else reasons.push('missing_source_commit:'+id);
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
  if(rc2){
    const rule=policy.rules.rc2Safety;
    for(const [key,expected] of Object.entries(rule))if(rc2[key]!==expected)reasons.push('rc2:'+key+'='+String(rc2[key]));
  }

  const cloud=evidence['real-staging-auth-e2e'];
  if(cloud){
    const rule=policy.rules.cloudE2E;
    for(const [key,expected] of Object.entries(rule))if(cloud[key]!==expected)reasons.push('cloud:'+key+'='+String(cloud[key]));
    if(cloud.architectureVersion!==release.architectureVersion)reasons.push('cloud_architecture_mismatch');
    if(cloud.latestMigration!==release.databaseMigration)reasons.push('cloud_migration_mismatch');
  }

  const backup=evidence['production-backup-restore'];
  if(backup){
    const rule=policy.rules.productionBackupRestore;
    for(const [key,expected] of Object.entries(rule))if(backup[key]!==expected)reasons.push('backup:'+key+'='+String(backup[key]));
    if(backup.targetMigration!==release.databaseMigration)reasons.push('backup_target_migration_mismatch');
    if(backup.backupSourceLatestMigration!==backup.restoredLatestMigration)reasons.push('backup_restore_version_mismatch');
  }
}

const status=reasons.length?'BLOCKED':'PASS';
const report={
  status,
  mode:policyOnly?'policy-only':'evidence-evaluation',
  productionMutationAllowed:false,
  release:release.release,
  architectureVersion:release.architectureVersion,
  platformVersion:release.platformVersion,
  sourceCommit,
  reasons
};
console.log(JSON.stringify(report,null,2));

if(policyOnly){
  if(status!=='BLOCKED')throw new Error('policy_only_gate_should_be_blocked_before_owner_approval_and_external_evidence');
  const required=['release_flag:cloudStagingVerified=false','release_flag:productionReady=false','release_flag:productionApproved=false'];
  for(const reason of required)if(!reasons.includes(reason))throw new Error('missing_expected_blocker:'+reason);
  process.exit(0);
}
if(status!=='PASS')process.exit(2);
