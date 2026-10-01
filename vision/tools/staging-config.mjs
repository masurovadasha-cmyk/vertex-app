import {pathToFileURL} from 'node:url';
const REF_RE=/^[a-z0-9]{20}$/;
const PUBLISHABLE_RE=/^sb_publishable_[A-Za-z0-9_-]+$/;

function fail(message){throw new Error(message);}
function required(value,name){const v=String(value||'').trim();if(!v)fail(name+' is required');return v;}

export function validateDatabaseTarget(databaseUrl,ref){
  const value=required(databaseUrl,'VISION_STAGING_DATABASE_URL');
  let url;try{url=new URL(value);}catch{fail('VISION_STAGING_DATABASE_URL must be a valid URL');}
  if(!['postgres:','postgresql:'].includes(url.protocol))fail('staging database URL must use postgres/postgresql');
  if(!['require','verify-ca','verify-full'].includes(url.searchParams.get('sslmode')||''))fail('staging database URL must include sslmode=require (or stronger)');
  const host=url.hostname.toLowerCase();
  const direct=host===('db.'+ref+'.supabase.co');
  const pooled=(host.endsWith('.pooler.supabase.com')||host.endsWith('.pooler.supabase.co')) && decodeURIComponent(url.username).includes(ref);
  if(!direct&&!pooled)fail('database URL is not pinned to SUPABASE_STAGING_REF');
  return url.toString();
}

export function validateWorkerUrl(workerUrl){
  const value=required(workerUrl,'VISION_STAGING_URL');
  let url;try{url=new URL(value);}catch{fail('VISION_STAGING_URL must be a valid URL');}
  if(url.protocol!=='https:')fail('VISION_STAGING_URL must use https');
  if(['localhost','127.0.0.1','0.0.0.0'].includes(url.hostname))fail('VISION_STAGING_URL must be remote staging');
  url.pathname='/';url.search='';url.hash='';
  return url.toString().replace(/\/$/,'');
}

export function stagingConfig(env=process.env,{database=false,worker=false}={}){
  const ref=required(env.SUPABASE_STAGING_REF,'SUPABASE_STAGING_REF');
  if(!REF_RE.test(ref))fail('SUPABASE_STAGING_REF must be the 20-character staging project ref');
  const supabaseUrl=required(env.SUPABASE_URL,'SUPABASE_URL');
  if(supabaseUrl!==('https://'+ref+'.supabase.co'))fail('SUPABASE_URL must exactly match SUPABASE_STAGING_REF');
  const publishableKey=required(env.SUPABASE_PUBLISHABLE_KEY,'SUPABASE_PUBLISHABLE_KEY');
  if(!PUBLISHABLE_RE.test(publishableKey))fail('only an sb_publishable_ key is accepted; privileged keys are forbidden');
  const databaseUrl=database?validateDatabaseTarget(env.VISION_STAGING_DATABASE_URL,ref):null;
  const workerUrl=worker?validateWorkerUrl(env.VISION_STAGING_URL):null;
  return {ref,supabaseUrl,publishableKey,databaseUrl,workerUrl};
}

export function safeSummary(config){
  return {
    stagingRef:config.ref,
    supabaseUrl:config.supabaseUrl,
    publishableKey:'configured:'+config.publishableKey.slice(0,15)+'…',
    databaseConfigured:Boolean(config.databaseUrl),
    workerUrl:config.workerUrl||null
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const config=stagingConfig(process.env,{database:process.argv.includes('--database'),worker:process.argv.includes('--worker')});
  console.log(JSON.stringify({ok:true,...safeSummary(config)},null,2));
}
