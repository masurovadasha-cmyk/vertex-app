const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const security={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY'};
const json=(data,status=200)=>Response.json(data,{status,headers:security});
const configured=env=>/^[a-z0-9]{20}$/.test(env.SUPABASE_STAGING_REF||'')&&env.SUPABASE_URL===`https://${env.SUPABASE_STAGING_REF}.supabase.co`&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_PUBLISHABLE_KEY||'');

async function readJSON(source,limit,error='invalid_json'){
 if(Number(source.headers.get('content-length'))>limit)throw Error('body_too_large');
 const reader=source.body?.getReader();if(!reader)throw Error(error);
 let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('body_too_large');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error(error);}
}
function exactObject(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const actual=Object.keys(value);return actual.every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(value,k));
}
function email(value){return typeof value==='string'&&value.length>=3&&value.length<=254&&/^[^\s@]+@[^\s@]+$/.test(value);}
function password(value){return typeof value==='string'&&value.length>=1&&value.length<=1024;}
function refreshToken(value){return typeof value==='string'&&value.length>=8&&value.length<=4096&&!/\s/.test(value);}
function bearer(request){const value=request.headers.get('authorization');return /^Bearer [A-Za-z0-9_.-]+$/.test(value||'')&&value.length<=8192?value:null;}
function authResponse(body){
 if(!body||typeof body!=='object'||!/^Bearer$/i.test(body.token_type||'')||typeof body.access_token!=='string'||body.access_token.length<10||body.access_token.length>8192||typeof body.refresh_token!=='string'||body.refresh_token.length<8||body.refresh_token.length>4096||!Number.isSafeInteger(body.expires_in)||body.expires_in<1||body.expires_in>86400||!UUID.test(body.user?.id||''))throw Error('invalid_upstream');
 return {access_token:body.access_token,refresh_token:body.refresh_token,expires_in:body.expires_in,token_type:'bearer',user:{id:body.user.id}};
}
async function upstreamJSON(response,limit=1048576){
 if(!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('invalid_upstream');
 return readJSON(response,limit,'invalid_upstream');
}
function mapAuthStatus(status){
 if(status===429)return ['auth_rate_limited',429];
 if(status>=500)return ['auth_unavailable',503];
 return ['invalid_credentials',401];
}
export async function handleAuth(request,env,fetcher=fetch){
 if(env.VISION_ENV!=='staging'||!configured(env))return json({error:'backend_not_configured'},503);
 const url=new URL(request.url);
 if(request.headers.has('origin')&&request.headers.get('origin')!==url.origin)return json({error:'origin_denied'},403);
 const upstream=(path,options={})=>fetcher(env.SUPABASE_URL+path,{...options,headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json',...(options.headers||{})},redirect:'error',signal:AbortSignal.timeout(10000)});
 try{
  if(url.pathname==='/api/v1/auth/sign-in'){
   if(request.method!=='POST')return json({error:'method_not_allowed'},405);
   if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return json({error:'json_required'},415);
   const body=await readJSON(request,4096);if(!exactObject(body,['email','password'])||!email(body.email)||!password(body.password))return json({error:'invalid_credentials'},401);
   const response=await upstream('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:body.email,password:body.password})});
   const value=await upstreamJSON(response,262144);
   if(!response.ok){const [code,status]=mapAuthStatus(response.status);return json({error:code},status);}
   return json(authResponse(value));
  }
  if(url.pathname==='/api/v1/auth/refresh'){
   if(request.method!=='POST')return json({error:'method_not_allowed'},405);
   if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return json({error:'json_required'},415);
   const body=await readJSON(request,8192);if(!exactObject(body,['refresh_token'])||!refreshToken(body.refresh_token))return json({error:'invalid_refresh_token'},400);
   const response=await upstream('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:body.refresh_token})});
   const value=await upstreamJSON(response,262144);
   if(!response.ok){const [code,status]=mapAuthStatus(response.status);return json({error:code},status);}
   return json(authResponse(value));
  }
  if(url.pathname==='/api/v1/auth/context'){
   if(request.method!=='GET')return json({error:'method_not_allowed'},405);
   const authorization=bearer(request);if(!authorization)return json({error:'unauthorized'},401);
   const auth=await upstream('/auth/v1/user',{headers:{authorization}});
   if(!auth.ok)return json({error:auth.status===429||auth.status>=500?'auth_unavailable':'unauthorized'},auth.status===429||auth.status>=500?503:401);
   const identity=await upstreamJSON(auth,65536);if(!UUID.test(identity?.id||''))return json({error:'unauthorized'},401);
   const response=await upstream('/rest/v1/rpc/vision_auth_context',{method:'POST',headers:{authorization},body:'{}'});
   const value=await upstreamJSON(response,262144);
   if(!response.ok){const forbidden=value?.code==='42501'||response.status===403;return json({error:forbidden?'forbidden':'backend_unavailable'},forbidden?403:503);}
   if(!value||value.contract!=='vision-auth-context/v1'||value.user_id!==identity.id||!UUID.test(value.tenant_id||'')||!Array.isArray(value.organizations))return json({error:'backend_unavailable'},503);
   return json(value);
  }
  if(url.pathname==='/api/v1/auth/sign-out'){
   if(request.method!=='POST')return json({error:'method_not_allowed'},405);
   const authorization=bearer(request);if(!authorization)return json({error:'unauthorized'},401);
   const response=await upstream('/auth/v1/logout',{method:'POST',headers:{authorization},body:'{}'});
   if(response.status===429||response.status>=500)return json({error:'auth_unavailable'},503);
   if(response.status===401||response.status===403)return json({error:'unauthorized'},401);
   return new Response(null,{status:204,headers:security});
  }
  return json({error:'not_found'},404);
 }catch(error){
  if(error.message==='body_too_large')return json({error:'body_too_large'},413);
  if(error.message==='invalid_json')return json({error:'invalid_json'},400);
  return json({error:'auth_unavailable'},503);
 }
}
