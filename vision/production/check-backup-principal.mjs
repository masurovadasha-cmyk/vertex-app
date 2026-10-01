import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url=process.env.VISION_PRODUCTION_READONLY_DATABASE_URL;
const expectedHost=process.env.VISION_EXPECTED_PRODUCTION_DATABASE_HOST;
const target=process.env.VISION_BACKUP_PRINCIPAL_TARGET||'production';
if(!['ci','production'].includes(target))throw new Error('invalid_backup_principal_target');
if(!url)throw new Error('VISION_PRODUCTION_READONLY_DATABASE_URL required');
if(!expectedHost)throw new Error('VISION_EXPECTED_PRODUCTION_DATABASE_HOST required');

let parsed;try{parsed=new URL(url);}catch{throw new Error('invalid_database_url');}
if(!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.hostname!==expectedHost)throw new Error('production_database_host_mismatch');
if(target==='production'&&!['require','verify-full'].includes(parsed.searchParams.get('sslmode')||''))throw new Error('production_database_tls_required');
if(target==='ci'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('ci_backup_database_must_be_local');

const client=new pg.Client({connectionString:url,application_name:'vertex-vision-production-backup-principal-check'});
await client.connect();
try{
  await client.query("set statement_timeout='20s'; set default_transaction_read_only=on");
  const roleSql="select r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls, has_database_privilege(current_user,current_database(),'CREATE') database_create, has_schema_privilege(current_user,'public','CREATE') public_schema_create, case when to_regnamespace('vision_private') is null then false else has_schema_privilege(current_user,'vision_private','CREATE') end private_schema_create from pg_roles r where r.rolname=current_user";
  const role=(await client.query(roleSql)).rows[0];
  if(!role)throw new Error('production_backup_role_missing');
  for(const key of ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls','database_create','public_schema_create','private_schema_create'])
    if(role[key]===true)throw new Error('production_backup_role_too_privileged:'+key);

  const writesSql=`
    select count(*)::int n
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','vision_private') and c.relkind in ('r','p')
      and (
        has_table_privilege(current_user,c.oid,'INSERT')
        or has_table_privilege(current_user,c.oid,'UPDATE')
        or has_table_privilege(current_user,c.oid,'DELETE')
        or has_table_privilege(current_user,c.oid,'TRUNCATE')
        or has_table_privilege(current_user,c.oid,'REFERENCES')
        or has_table_privilege(current_user,c.oid,'TRIGGER')
      )`;
  const writes=(await client.query(writesSql)).rows[0].n;
  if(writes!==0)throw new Error('production_backup_role_has_effective_write_privileges');

  const sequenceWritesSql=`
    select count(*)::int n
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','vision_private') and c.relkind='S'
      and has_sequence_privilege(current_user,c.oid,'UPDATE')`;
  const sequenceWrites=(await client.query(sequenceWritesSql)).rows[0].n;
  if(sequenceWrites!==0)throw new Error('production_backup_role_has_sequence_write_privileges');

  const mutatingFunctionsSql=`
    select count(*)::int n
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','vision_private')
      and p.provolatile='v'
      and p.prosecdef=true
      and has_function_privilege(current_user,p.oid,'EXECUTE')`;
  const mutatingFunctions=(await client.query(mutatingFunctionsSql)).rows[0].n;
  if(mutatingFunctions!==0)throw new Error('production_backup_role_can_execute_mutating_definer_functions');

  const membershipsSql=`
    select count(*)::int n
    from pg_roles r
    where r.rolname<>current_user
      and pg_has_role(current_user,r.oid,'MEMBER')
      and (
        r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
        or exists(
          select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ('public','vision_private') and c.relkind in ('r','p')
            and (
              has_table_privilege(r.rolname,c.oid,'INSERT')
              or has_table_privilege(r.rolname,c.oid,'UPDATE')
              or has_table_privilege(r.rolname,c.oid,'DELETE')
              or has_table_privilege(r.rolname,c.oid,'TRUNCATE')
              or has_table_privilege(r.rolname,c.oid,'REFERENCES')
              or has_table_privilege(r.rolname,c.oid,'TRIGGER')
            )
        )
        or exists(
          select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ('public','vision_private') and c.relkind='S'
            and has_sequence_privilege(r.rolname,c.oid,'UPDATE')
        )
        or exists(
          select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname in ('public','vision_private') and p.provolatile='v' and p.prosecdef=true
            and has_function_privilege(r.rolname,p.oid,'EXECUTE')
        )
      )`;
  const privilegedMemberships=(await client.query(membershipsSql)).rows[0].n;
  if(privilegedMemberships!==0)throw new Error('production_backup_role_can_set_role_to_writer');

  const readOnly=(await client.query("show transaction_read_only")).rows[0].transaction_read_only;
  if(readOnly!=='on')throw new Error('production_backup_session_not_read_only');

  const report={
    status:'PASS',target,readOnlyPrincipal:true,elevatedRoleFlags:false,
    databaseCreate:false,publicSchemaCreate:false,privateSchemaCreate:false,effectiveTableWritePrivileges:0,
    sequenceWritePrivileges:0,mutatingDefinerFunctionExecutePrivileges:0,privilegedRoleMemberships:0,
    transactionReadOnly:true,tlsRequired:target==='production',productionChanged:false
  };
  const output=process.argv[2]||'artifacts/production-backup/principal.json';
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await client.end();}
