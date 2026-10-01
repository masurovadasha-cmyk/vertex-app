import {Client} from 'pg';
import {migrate} from '../backend/migrate.mjs';
import {stagingConfig,safeSummary} from './staging-config.mjs';
import {readdir} from 'node:fs/promises';

if(process.env.VISION_APPLY_STAGING_MIGRATIONS!=='YES_APPLY_STAGING'){
  throw new Error('Refusing to mutate staging without VISION_APPLY_STAGING_MIGRATIONS=YES_APPLY_STAGING');
}

const config=stagingConfig(process.env,{database:true});
const client=new Client({
  connectionString:config.databaseUrl,
  application_name:'vertex-vision-staging-migrate'
});
await client.connect();
try{
  const adapter={
    exec:sql=>client.query(sql),
    query:(sql,params)=>client.query(sql,params)
  };
  await migrate(adapter);
  const local=(await readdir(new URL('../database/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort();
  const receipts=(await client.query('select name,sha256 from vision_private.schema_migrations order by name')).rows;
  const applied=new Set(receipts.map(x=>x.name));
  const missing=local.filter(x=>!applied.has(x));
  if(missing.length)throw new Error('Missing migration receipts: '+missing.join(', '));
  const rls=(await client.query("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and relname like 'vision_%' order by relname")).rows;
  const unprotected=rls.filter(x=>!x.relrowsecurity).map(x=>x.relname);
  if(unprotected.length)throw new Error('RLS is disabled on: '+unprotected.join(', '));
  console.log(JSON.stringify({
    ok:true,
    target:safeSummary(config),
    migrationsApplied:receipts.length,
    visionTables:rls.length,
    allVisionTablesRls:true
  },null,2));
} finally {
  await client.end();
}
