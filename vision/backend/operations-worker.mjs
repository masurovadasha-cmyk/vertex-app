import {handle as baseHandle} from './worker.mjs';
import {handleAuth} from './auth.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSETS=new Set(['/operations/','/operations/index.html','/operations/app.mjs','/operations/auth.mjs','/operations/client.mjs','/operations/styles.css']);
const security={
 'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
 'x-frame-options':'DENY','cross-origin-resource-policy':'same-origin',
 'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
 'permissions-policy':'camera=(), microphone=(), geolocation=()'
};
const json=(data,status=200)=>Response.json(data,{status,headers:security});
const configured=env=>/^[a-z0-9]{20}$/.test(env.SUPABASE_STAGING_REF||'') && env.SUPABASE_URL===`https://${env.SUPABASE_STAGING_REF}.supabase.co` && /^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_PUBLISHABLE_KEY||'');
function date(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'') && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
async function body(response,limit){
 if(!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('invalid_upstream');
 if(Number(response.headers.get('content-length'))>limit)throw Error('invalid_upstream');
 const reader=response.body?.getReader();if(!reader)throw Error('invalid_upstream');
 let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('invalid_upstream');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function handle(request,env={},fetcher=fetch){
 if(env.VISION_ENV!=='staging')return json({error:'staging_only'},503);
 const url=new URL(request.url);
 if(url.pathname==='/operations')return new Response(null,{status:308,headers:{...security,location:'/operations/'}});
 if(url.pathname.startsWith('/operations/')){
  if(!ASSETS.has(url.pathname))return json({error:'not_found'},404);
  if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(!env.OPERATIONS_UI?.fetch)return json({error:'ui_not_configured'},503);
  try{const response=await env.OPERATIONS_UI.fetch(request);return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers:{...Object.fromEntries(response.headers),...security}});}catch{return json({error:'ui_unavailable'},503);}
 }
 if(url.pathname.startsWith('/api/v1/auth/'))return handleAuth(request,env,fetcher);
 if(['/health','/healthz'].includes(url.pathname)){
  if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
  return new Response(request.method==='HEAD'?null:JSON.stringify({service:'VERTEX VISION',environment:'staging',configured:configured(env),ui:'operations-0.1',productionReady:false}),{headers:{...security,'content-type':'application/json'}});
 }
 if(url.pathname!=='/api/v1/views/operations')return baseHandle(request,env,fetcher);
 if(!configured(env))return json({error:'backend_not_configured'},503);
 if(request.headers.has('origin') && request.headers.get('origin')!==url.origin)return json({error:'origin_denied'},403);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 const authorization=request.headers.get('authorization');
 if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization||'')||authorization.length>8192)return json({error:'unauthorized'},401);
 const keys=['tenant_id','organization_id','from','to'];
 if([...url.searchParams.keys()].some(k=>!keys.includes(k))||keys.some(k=>url.searchParams.getAll(k).length!==1))return json({error:'invalid_query'},400);
 const tenant=url.searchParams.get('tenant_id'),organization=url.searchParams.get('organization_id'),from=url.searchParams.get('from'),to=url.searchParams.get('to');
 if(!UUID.test(tenant)||!UUID.test(organization)||!date(from)||!date(to)||to<=from||Date.parse(to)-Date.parse(from)>31*86400000)return json({error:'invalid_query'},400);
 const upstream=(path,options={})=>fetcher(env.SUPABASE_URL+path,{...options,headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization,'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
 try{
  const auth=await upstream('/auth/v1/user');
  if(!auth.ok)return json({error:auth.status===429||auth.status>=500?'auth_unavailable':'unauthorized'},auth.status===429||auth.status>=500?503:401);
  const identity=await body(auth,65536);if(!identity||!UUID.test(identity.id||''))return json({error:'unauthorized'},401);
  const response=await upstream('/rest/v1/rpc/vision_views_operations_snapshot',{method:'POST',body:JSON.stringify({p_tenant_id:tenant,p_organization_id:organization,p_from:from,p_to:to})});
  const value=await body(response,1048576);
  if(!response.ok){const forbidden=value?.code==='42501'||response.status===403;const invalid=['22023','22007','22008','22P02'].includes(value?.code);return json({error:forbidden?'forbidden':invalid?'invalid_query':'backend_unavailable'},forbidden?403:invalid?400:503);}
  if(!value||value.contract!=='views-operations-ui/v1'||value.tenant_id!==tenant||value.organization_id!==organization)return json({error:'backend_unavailable'},503);
  return json(value);
 }catch{return json({error:'backend_unavailable'},503);}
}
export default {fetch(request,env){return handle(request,env);}};
