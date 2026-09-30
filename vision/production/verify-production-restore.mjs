import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import pg from 'pg';

const url=process.env.VISION_RESTORED_DATABASE_URL;
if(!url)throw new Error('VISION_RESTORED_DATABASE_URL required');
const root=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const candidateRoot=process.env.VISION_CANDIDATE_ROOT?path.resolve(process.env.VISION_CANDIDATE_ROOT):root;
const release=JSON.parse(fs.readFileSync(path.join(candidateRoot,'vision/release/0.1-RC1.json'),'utf8'));
const migrationsDir=path.join(candidateRoot,'vision/database/migrations');
const local=fs.readdirSync(migrationsDir)
  .filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort()
  .map(name=>{
    const sql=fs.readFileSync(path.join(migrationsDir,name),'utf8').replaceAll('\r\n','\n');
    return {name,sha256:createHash('sha256').update(sql).digest('hex')};
  });

const client=new pg.Client({connectionString:url,application_name:'vertex-vision-production-restore-verify'});
await client.connect();
try{
  await client.query("set statement_timeout='30s'; set default_transaction_read_only=on");
  await client.query('select 1');

  const migrationsTable=(await client.query("select to_regclass('vision_private.schema_migrations') is not null ok")).rows[0].ok;
  const applied=migrationsTable
    ?(await client.query('select name,sha256 from vision_private.schema_migrations order by name')).rows
    :[];

  if(applied.length>local.length)throw new Error('restored_database_has_unknown_migrations');
  for(let i=0;i<applied.length;i++){
    if(applied[i].name!==local[i].name)throw new Error('restored_migration_prefix_mismatch:'+applied[i].name);
    if(applied[i].sha256!==local[i].sha256)throw new Error('restored_migration_checksum_mismatch:'+applied[i].name);
  }

  const protectedTables=[
    'vision_views_bookings',
    'vision_views_units',
    'vision_views_cleaning_jobs',
    'vision_views_inventory_nights',
    'vision_event_inbox'
  ];
  const rlsResults=[];
  for(const table of protectedTables){
    const row=(await client.query(
      "select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1",
      [table]
    )).rows[0];
    if(row){
      if(row.relrowsecurity!==true)throw new Error('restored_rls_disabled:'+table);
      rlsResults.push(table);
    }
  }

  let inboxDenied=null;
  const inboxExists=(await client.query("select to_regclass('public.vision_event_inbox') is not null ok")).rows[0].ok;
  if(inboxExists){
    await client.query('begin');
    try{
      await client.query('set local role authenticated');
      let denied=false;
      try{await client.query('select * from public.vision_event_inbox limit 1');}
      catch(error){denied=/permission denied/i.test(error.message);}
      if(!denied)throw new Error('restored_inbox_access_not_denied');
      inboxDenied=true;
    }finally{await client.query('rollback');}
  }

  const report={
    status:'PASS',
    target:'production',
    sourceCommit:process.env.GITHUB_SHA||null,
    targetMigration:release.databaseMigration,
    targetArchitectureVersion:release.architectureVersion,
    restoredLatestMigration:applied.at(-1)?.name||null,
    restoredMigrationCount:applied.length,
    migrationPrefixVerified:true,
    protectedRlsTablesVerified:rlsResults,
    endUserInboxReadDenied:inboxDenied,
    productionChanged:false
  };
  const output=process.argv[2]||'artifacts/production-backup/restore-verification.json';
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await client.end();}
