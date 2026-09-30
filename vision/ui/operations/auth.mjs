export class AuthError extends Error{
 constructor(code,status=0){super(code);this.name='AuthError';this.code=code;this.status=status;}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function parse(response){
 if(response.status===204)return null;
 if(!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type')||''))throw new AuthError('invalid_response');
 const reader=response.body?.getReader();if(!reader)throw new AuthError('invalid_response');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw new AuthError('invalid_response');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AuthError('invalid_response');}
}
function validateSession(data){
 if(!data||typeof data.access_token!=='string'||data.access_token.length<10||data.access_token.length>8192||typeof data.refresh_token!=='string'||data.refresh_token.length<8||data.refresh_token.length>4096||!Number.isSafeInteger(data.expires_in)||data.expires_in<1||!UUID.test(data.user?.id||''))throw new AuthError('invalid_response');
 return Object.freeze({accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+data.expires_in*1000,userId:data.user.id});
}
function validateContext(data,userId){
 if(!data||data.contract!=='vision-auth-context/v1'||data.user_id!==userId||!UUID.test(data.tenant_id||'')||!Array.isArray(data.organizations))throw new AuthError('invalid_response');
 const seen=new Set();
 const organizations=data.organizations.map(item=>{
  if(!item||!UUID.test(item.id||'')||typeof item.name!=='string'||typeof item.code!=='string'||!Array.isArray(item.permissions)||seen.has(item.id)||item.permissions.some(p=>typeof p!=='string'||!p.startsWith('views.')))throw new AuthError('invalid_response');
  seen.add(item.id);return Object.freeze({id:item.id,code:item.code,name:item.name,kind:item.kind||'',permissions:Object.freeze([...new Set(item.permissions)].sort())});
 });
 return Object.freeze({tenantId:data.tenant_id,userId,organizations:Object.freeze(organizations)});
}
export function createAuthClient({fetcher=fetch,isOnline=()=>globalThis.navigator?.onLine!==false,timeoutMs=12000}={}){
 async function request(path,{method='GET',body,token}={}){
  if(!isOnline())throw new AuthError('offline');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetcher(path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
   const data=await parse(response);
   if(!response.ok){const code=typeof data?.error==='string'?data.error:'request_failed';throw new AuthError(code,response.status);}
   return data;
  }catch(error){if(error instanceof AuthError)throw error;throw new AuthError(controller.signal.aborted?'request_aborted':'network_error');}
  finally{clearTimeout(timer);}
 }
 return Object.freeze({
  async signIn(email,password){
   if(typeof email!=='string'||email.length<3||email.length>254||!/^[^\s@]+@[^\s@]+$/.test(email)||typeof password!=='string'||password.length<1||password.length>1024)throw new AuthError('invalid_credentials',401);
   return validateSession(await request('/api/v1/auth/sign-in',{method:'POST',body:{email,password}}));
  },
  async refresh(refreshToken){
   if(typeof refreshToken!=='string'||refreshToken.length<8||refreshToken.length>4096||/\s/.test(refreshToken))throw new AuthError('invalid_refresh_token',400);
   return validateSession(await request('/api/v1/auth/refresh',{method:'POST',body:{refresh_token:refreshToken}}));
  },
  async context(session){return validateContext(await request('/api/v1/auth/context',{token:session.accessToken}),session.userId);},
  async signOut(session){return request('/api/v1/auth/sign-out',{method:'POST',token:session.accessToken});}
 });
}
