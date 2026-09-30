import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url=process.env.VISION_RESTORED_DATABASE_URL;
if(!url)throw new Error('VISION_RESTORED_DATABASE_URL required');
const release=JSON.parse(fs.readFileSync(new URL('../release/0.1-RC1.json',import.meta.url),'utf8'));

const client=new pg.Client({connectionString:url,application_name:'vertex-vision-production-restore-verify'});
await client.connect();
try{
  await client.query("set statement_timeout='30s'; set default_transaction_read_only=on");
  const readiness=(await client.query('select public.vision_runtime_readiness() data')).rows[0]?.data;
  if(!readiness||readiness.ready!==true)throw new Error('restored_database_not_ready');
  if(readiness.latest_migration!==release.databaseMigration||readiness.architecture_version!==release.architectureVersion)
    throw new Error('restored_release_mismatch');

  const migrations=(await client.query('select name,sha256 from vision_private.schema_migrations order by name')).rows;
  if(!migrations.length||migrations.at(-1)?.name!==release.databaseMigration)throw new Error('restored_migration_history_mismatch');

  const protectedTables=['vision_views_bookings','vision_views_units','vision_views_cleaning_jobs','vision_views_inventory_nights','vision_event_inbox'];
  const rls=(await client.query(
    "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname=any($1::text[]) order by relname",
    [protectedTables]
  )).rows;
  if(rls.length!==protectedTables.length||rls.some(row=>row.relrowsecurity!==true))throw new Error('restored_rls_mismatch');

  const requiredFunctions=[
    'vision_views_command(jsonb)',
    'vision_session_context(uuid,uuid)',
    'vision_runtime_readiness()',
    'vision_inbox_begin(uuid,text,uuid,text,text,uuid,uuid,text)',
    'vision_inbox_complete(uuid,text,uuid,uuid)',
    'vision_inbox_fail(uuid,text,uuid,uuid,text)'
  ];
  for(const signature of requiredFunctions){
    const ok=(await client.query('select to_regprocedure($1) is not null ok',[signature])).rows[0].ok;
    if(!ok)throw new Error('restored_function_missing:'+signature);
  }

  await client.query('begin');
  try{
    await client.query('set local role authenticated');
    let denied=false;
    try{await client.query('select * from public.vision_event_inbox limit 1');}
    catch(error){denied=/permission denied/i.test(error.message);}
    if(!denied)throw new Error('restored_inbox_access_not_denied');
  }finally{await client.query('rollback');}

  const report={
    status:'PASS',
    target:'production',
    sourceCommit:process.env.GITHUB_SHA||null,
    latestMigration:readiness.latest_migration,
    architectureVersion:readiness.architecture_version,
    migrationCount:migrations.length,
    rlsVerified:true,
    requiredFunctionsVerified:true,
    endUserInboxReadDenied:true,
    productionChanged:false
  };
  const output=process.argv[2]||'artifacts/production-backup/restore-verification.json';
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await client.end();}
