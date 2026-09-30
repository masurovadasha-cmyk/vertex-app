import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url=process.env.VISION_PRODUCTION_READONLY_DATABASE_URL;
const expectedHost=process.env.VISION_EXPECTED_PRODUCTION_DATABASE_HOST;
if(!url)throw new Error('VISION_PRODUCTION_READONLY_DATABASE_URL required');
if(!expectedHost)throw new Error('VISION_EXPECTED_PRODUCTION_DATABASE_HOST required');

let parsed;try{parsed=new URL(url);}catch{throw new Error('invalid_database_url');}
if(!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.hostname!==expectedHost)throw new Error('production_database_host_mismatch');
if(!['require','verify-full'].includes(parsed.searchParams.get('sslmode')||''))throw new Error('production_database_tls_required');

const client=new pg.Client({connectionString:url,application_name:'vertex-vision-production-backup-principal-check'});
await client.connect();
try{
  await client.query("set statement_timeout='20s'; set default_transaction_read_only=on");
  const roleSql="select r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls, has_database_privilege(current_user,current_database(),'CREATE') database_create, has_schema_privilege(current_user,'public','CREATE') public_schema_create from pg_roles r where r.rolname=current_user";
  const role=(await client.query(roleSql)).rows[0];
  if(!role)throw new Error('production_backup_role_missing');
  for(const key of ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls','database_create','public_schema_create'])
    if(role[key]===true)throw new Error('production_backup_role_too_privileged:'+key);

  const writesSql="select count(*)::int n from information_schema.role_table_grants where grantee=current_user and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')";
  const writes=(await client.query(writesSql)).rows[0].n;
  if(writes!==0)throw new Error('production_backup_role_has_write_grants');

  const report={
    status:'PASS',target:'production',readOnlyPrincipal:true,elevatedRoleFlags:false,
    databaseCreate:false,publicSchemaCreate:false,tableWriteGrants:0,tlsRequired:true,productionChanged:false
  };
  const output=process.argv[2]||'artifacts/production-backup/principal.json';
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await client.end();}
