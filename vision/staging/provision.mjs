import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {migrate} from '../backend/migrate.mjs';
import {provisionDemo,profiles,demo} from '../backend/demo.mjs';
import {validateSupabaseStaging,validateStagingDatabaseURL,signInSynthetic} from './auth.mjs';

const requiredProfiles=Object.freeze(['guest','views','dispatcher','staff','quality','audit']);
const envName=key=>'VISION_E2E_'+key.toUpperCase()+'_';
const required=(name)=>{
  const value=process.env[name];
  if(!value)throw new Error('missing_staging_secret:'+name);
  return value;
};

const config=validateSupabaseStaging(process.env);
const databaseURL=validateStagingDatabaseURL(required('VISION_STAGING_DATABASE_URL'),config.projectRef);

const identities={};
for(const key of requiredProfiles){
  const email=required(envName(key)+'EMAIL');
  const password=required(envName(key)+'PASSWORD');
  const session=await signInSynthetic({url:config.url,key:config.key,email,password});
  identities[key]=session.userId;
}
if(new Set(Object.values(identities)).size!==requiredProfiles.length)throw new Error('e2e_auth_users_must_be_distinct');

const client=new pg.Client({connectionString:databaseURL,application_name:'vertex-vision-staging-provision'});
await client.connect();
const db={query:(...args)=>client.query(...args),exec:sql=>client.query(sql)};
try{
  await client.query("set statement_timeout='60s'");
  await migrate(db);
  await provisionDemo(db,identities);
  const readiness=(await client.query('select public.vision_runtime_readiness() result')).rows[0]?.result;
  if(!readiness||readiness.ready!==true||readiness.latest_migration!=='0010_runtime_readiness.sql')throw new Error('staging_database_not_ready');
  const userCount=(await client.query('select count(*)::int n from public.vision_users where tenant_id=$1 and id=any($2::uuid[])',[demo.tenant_id,Object.values(identities)])).rows[0].n;
  if(userCount!==requiredProfiles.length)throw new Error('staging_identity_mapping_incomplete');

  const report={
    status:'provisioned',
    syntheticOnly:true,
    projectRef:config.projectRef,
    tenantId:demo.tenant_id,
    organizationId:demo.views_id,
    unitId:demo.unit_id,
    customerId:demo.customer_id,
    profiles:requiredProfiles,
    identitiesDistinct:true,
    latestMigration:readiness.latest_migration,
    migrationCount:readiness.migration_count,
    viewsReleaseActive:readiness.views_release_active,
    rlsOk:readiness.rls_ok,
    functionsOk:readiness.functions_ok,
    tablesOk:readiness.tables_ok
  };
  const output=process.argv[2]||'artifacts/staging/provision.json';
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{
  await client.end();
}
