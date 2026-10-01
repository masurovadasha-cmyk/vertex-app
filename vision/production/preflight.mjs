import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import pg from 'pg';

const root=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const candidateRoot=process.env.VISION_CANDIDATE_ROOT?path.resolve(process.env.VISION_CANDIDATE_ROOT):root;
const release=JSON.parse(fs.readFileSync(path.join(candidateRoot,'vision/release/0.1-RC1.json'),'utf8'));
const safety=JSON.parse(fs.readFileSync(path.join(root,'vision/production/safety-manifest.json'),'utf8'));
const migrationsDir=path.join(candidateRoot,'vision/database/migrations');
const local=fs.readdirSync(migrationsDir)
  .filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort()
  .map(name=>{
    const sql=fs.readFileSync(path.join(migrationsDir,name),'utf8').replaceAll('\r\n','\n');
    return {name,sha256:createHash('sha256').update(sql).digest('hex')};
  });

const required=name=>{
  const value=process.env[name];
  if(!value)throw new Error('missing_environment:'+name);
  return value;
};
const target=process.env.VISION_RELEASE_TARGET||'ci';
if(!['ci','staging','production'].includes(target))throw new Error('invalid_release_target');
const databaseURL=required('VISION_RELEASE_DATABASE_URL');
let parsed;try{parsed=new URL(databaseURL);}catch{throw new Error('invalid_database_url');}
if(!['postgres:','postgresql:'].includes(parsed.protocol)||!parsed.hostname||!parsed.username||!parsed.pathname||parsed.pathname==='/')throw new Error('invalid_database_url');
if(target!=='ci'){
  const expectedHost=required('VISION_EXPECTED_DATABASE_HOST');
  if(parsed.hostname!==expectedHost)throw new Error('database_host_mismatch');
  if(!['require','verify-full'].includes(parsed.searchParams.get('sslmode')||''))throw new Error('database_tls_required');
}

const client=new pg.Client({connectionString:databaseURL,application_name:'vertex-vision-release-preflight'});
await client.connect();
try{
  await client.query("set statement_timeout='20s'; set default_transaction_read_only=on");
  const exists=(await client.query("select to_regclass('vision_private.schema_migrations') is not null ok")).rows[0].ok;
  const applied=exists?(await client.query('select name,sha256 from vision_private.schema_migrations order by name')).rows:[];
  if(applied.length>local.length)throw new Error('database_has_unknown_migrations');
  for(let i=0;i<applied.length;i++){
    if(applied[i].name!==local[i].name)throw new Error('migration_prefix_mismatch:'+applied[i].name);
    if(applied[i].sha256!==local[i].sha256)throw new Error('migration_checksum_mismatch:'+applied[i].name);
  }
  const pending=local.slice(applied.length).map(x=>x.name);
  let readiness=null;
  if(applied.length===local.length){
    const hasReadiness=(await client.query("select to_regprocedure('public.vision_runtime_readiness()') is not null ok")).rows[0].ok;
    if(!hasReadiness)throw new Error('readiness_function_missing');
    readiness=(await client.query('select public.vision_runtime_readiness() data')).rows[0].data;
    if(readiness?.latest_migration!==release.databaseMigration||readiness?.architecture_version!==release.architectureVersion)throw new Error('readiness_release_mismatch');
  }

  const counts={};
  for(const [key,table] of Object.entries({
    units:'public.vision_views_units',
    bookings:'public.vision_views_bookings',
    cleaningJobs:'public.vision_views_cleaning_jobs',
    outboxEvents:'public.vision_outbox_events',
    inboxEvents:'public.vision_event_inbox'
  })){
    const present=(await client.query('select to_regclass($1) is not null ok',[table])).rows[0].ok;
    counts[key]=present?(await client.query('select count(*)::bigint n from '+table)).rows[0].n.toString():null;
  }

  const report={
    status:'PASS',
    target,
    release:release.release,
    architectureVersion:release.architectureVersion,
    productionApproved:release.productionApproved,
    safetyStage:safety.stage,
    localMigrationCount:local.length,
    appliedMigrationCount:applied.length,
    latestApplied:applied.at(-1)?.name||null,
    pendingMigrations:pending,
    migrationHashesVerified:true,
    readiness,
    counts
  };
  const output=process.argv[2];
  if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
}finally{
  await client.end();
}
