import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const required=name=>{
  const value=process.env[name];
  if(!value)throw new Error('missing_environment:'+name);
  return value;
};
const baselineURL=required('VISION_BASELINE_DATABASE_URL');
const currentURL=required('VISION_RELEASE_DATABASE_URL');

async function inspect(connectionString){
  const client=new pg.Client({connectionString,application_name:'vertex-vision-n-minus-one-check'});
  await client.connect();
  try{
    const tables=(await client.query(
      "select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname"
    )).rows;
    const columns=(await client.query(
      "select table_name,column_name,data_type,udt_name,is_nullable,ordinal_position from information_schema.columns where table_schema='public' order by table_name,ordinal_position"
    )).rows;
    const functions=(await client.query(
      "select p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_function_result(p.oid) result from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname,args"
    )).rows;
    const migrations=(await client.query(
      "select name,sha256 from vision_private.schema_migrations order by name"
    )).rows;
    return {tables,columns,functions,migrations};
  }finally{await client.end();}
}

const baseline=await inspect(baselineURL),current=await inspect(currentURL);
const errors=[];

const currentTables=new Map(current.tables.map(x=>[x.relname,x]));
for(const table of baseline.tables){
  const now=currentTables.get(table.relname);
  if(!now){errors.push('missing baseline table: '+table.relname);continue;}
  if(table.relrowsecurity===true&&now.relrowsecurity!==true)errors.push('RLS disabled on baseline table: '+table.relname);
}

const key=x=>x.table_name+'.'+x.column_name;
const currentColumns=new Map(current.columns.map(x=>[key(x),x]));
for(const column of baseline.columns){
  const now=currentColumns.get(key(column));
  if(!now){errors.push('missing baseline column: '+key(column));continue;}
  if(now.data_type!==column.data_type||now.udt_name!==column.udt_name)
    errors.push('column type changed: '+key(column)+' '+column.data_type+'/'+column.udt_name+' -> '+now.data_type+'/'+now.udt_name);
  if(column.is_nullable==='YES'&&now.is_nullable==='NO')
    errors.push('column became more restrictive (NOT NULL): '+key(column));
}

const functionKey=x=>x.proname+'('+x.args+')';
const currentFunctions=new Map(current.functions.map(x=>[functionKey(x),x]));
for(const fn of baseline.functions){
  const now=currentFunctions.get(functionKey(fn));
  if(!now){errors.push('missing baseline function: '+functionKey(fn));continue;}
  if(now.result!==fn.result)errors.push('function result changed: '+functionKey(fn)+' '+fn.result+' -> '+now.result);
}

if(baseline.migrations.at(-1)?.name!=='0004_private_subject_permissions.sql')
  errors.push('baseline migration target mismatch: '+(baseline.migrations.at(-1)?.name||'none'));
if(current.migrations.length<baseline.migrations.length)
  errors.push('current schema has fewer migrations than baseline');

const report={
  status:errors.length?'FAIL':'PASS',
  baselineLatest:baseline.migrations.at(-1)?.name||null,
  currentLatest:current.migrations.at(-1)?.name||null,
  baselineTables:baseline.tables.length,
  baselineColumns:baseline.columns.length,
  baselineFunctions:baseline.functions.length,
  errors
};
const output=process.argv[2];
if(output){
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exit(1);
