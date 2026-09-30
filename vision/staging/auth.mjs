const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ref=/^[a-z0-9]{20}$/;
const publishable=/^sb_publishable_[A-Za-z0-9_-]+$/;

export function validateSupabaseStaging(env){
  const projectRef=env.SUPABASE_STAGING_REF||'';
  const url=env.SUPABASE_URL||'';
  const key=env.SUPABASE_PUBLISHABLE_KEY||'';
  if(!ref.test(projectRef))throw new Error('invalid_staging_ref');
  if(url!==`https://${projectRef}.supabase.co`)throw new Error('invalid_staging_url');
  if(!publishable.test(key))throw new Error('invalid_publishable_key');
  return Object.freeze({projectRef,url,key});
}

async function readJSON(response,limit=65536){
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>limit)throw new Error('auth_response_too_large');
  const text=await response.text();
  if(new TextEncoder().encode(text).length>limit)throw new Error('auth_response_too_large');
  try{return JSON.parse(text);}catch{throw new Error('auth_invalid_response');}
}

export async function signInSynthetic({url,key,email,password},fetcher=fetch){
  if(typeof email!=='string'||!email.includes('@')||email.length>254)throw new Error('invalid_e2e_email');
  if(typeof password!=='string'||password.length<8||password.length>256)throw new Error('invalid_e2e_password');
  const response=await fetcher(url+'/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{apikey:key,'content-type':'application/json'},
    body:JSON.stringify({email,password}),
    redirect:'error',
    signal:AbortSignal.timeout(10000)
  });
  const body=await readJSON(response);
  if(!response.ok)throw new Error(response.status===429||response.status>=500?'auth_unavailable':'e2e_auth_failed');
  if(!uuid.test(body?.user?.id||'')||typeof body?.access_token!=='string'||body.access_token.length<20)throw new Error('auth_invalid_response');
  return Object.freeze({userId:body.user.id,token:body.access_token});
}

export function validateStagingDatabaseURL(value,projectRef){
  let url;try{url=new URL(value);}catch{throw new Error('invalid_staging_database_url');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.pathname||url.pathname==='/')throw new Error('invalid_staging_database_url');
  const direct=url.hostname===`db.${projectRef}.supabase.co`;
  const pooler=url.hostname.endsWith('.pooler.supabase.com')&&url.username.includes(projectRef);
  if(!direct&&!pooler)throw new Error('database_project_mismatch');
  return value;
}
