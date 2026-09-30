const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body,status=200,extra={}) => Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const timestamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
function parseCursor(value){
  if(!value)return null;
  try{if(value.length>256||!/^[A-Za-z0-9_-]+$/.test(value))throw Error();
    const c=JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/')));
    if(!Array.isArray(c)||c.length!==2||!timestamp.test(c[0])||Number.isNaN(Date.parse(c[0]))||!uuid.test(c[1]))throw Error();
    return c;
  }catch{throw new Error('invalid_cursor');}
}

async function boundedJSON(source,limit) {
  if(Number(source.headers.get('content-length'))>limit) throw new Error('body_too_large');
  const reader=source.body?.getReader();if(!reader)throw new Error('invalid_json');
  let length=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new Error('body_too_large');}chunks.push(value);}
  const data=new Uint8Array(length);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(data));}catch{throw new Error('invalid_json');}
}

// All data requests retain the user's verified bearer token. There is no service-role key.
export async function handle(request,env,fetcher=fetch) {
  const url=new URL(request.url);
  if(env.VISION_ENV!=='staging')return json({error:'staging_only'},503);
  if(url.pathname==='/health')return request.method==='GET'?json({service:'VERTEX VISION',environment:'staging',configured:configured(env)}):json({error:'method_not_allowed'},405);
  if(!configured(env))return json({error:'backend_not_configured'},503);
  if(request.headers.has('origin') && request.headers.get('origin')!==url.origin)return json({error:'origin_denied'},403);
  if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(url.pathname==='/auth/config' && request.method==='GET')return json({url:env.SUPABASE_URL,publishable_key:env.SUPABASE_PUBLISHABLE_KEY});
  const authorization=request.headers.get('authorization');
  if(!authorization?.match(/^Bearer [A-Za-z0-9_.-]+$/) || authorization.length>8192)return json({error:'unauthorized'},401);
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization,'content-type':'application/json'};
  const upstream=async(path,options={})=>{
    // Workerd supports manual/follow, not redirect:error. Never forward a user's
    // bearer token to a redirect target, including a different Supabase project.
    const response=await fetcher(env.SUPABASE_URL+path,{...options,headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(response.status>=300 && response.status<400){await response.body?.cancel();throw new Error('upstream_redirect');}
    return response;
  };
  try{
    const identity=await upstream('/auth/v1/user');
    if(!identity.ok)return json({error:identity.status>=500?'auth_unavailable':'unauthorized'},identity.status>=500?503:401);
    const user=await boundedJSON(identity,65536).catch(()=>{throw new Error('upstream_invalid_response');});
    if(!uuid.test(user.id||''))return json({error:'unauthorized'},401);
    let result,isFeed=false;
    if(url.pathname==='/api/session' && request.method==='GET') {
      result=await upstream('/rest/v1/rpc/vision_session',{method:'POST',body:'{}'});
    } else if(url.pathname==='/api/commands' && request.method==='POST') {
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'json_required'},415);
      const command=await boundedJSON(request,8192);
      // Unknown keys, tenant, identity, roles, state and versions are validated again in SQL.
      result=await upstream('/rest/v1/rpc/vision_command',{method:'POST',body:JSON.stringify({command})});
    } else if(request.method==='GET' && ['/api/orders','/api/tasks','/api/audit','/api/history'].includes(url.pathname)) {
      const tenant=url.searchParams.get('tenant_id');
      if(!uuid.test(tenant||''))return json({error:'tenant_id_required'},400);
      const tables={orders:'vision_orders',tasks:'vision_tasks',audit:'vision_audit_events',history:'vision_order_status_history'};
      const table=tables[url.pathname.split('/')[2]];
      const cursor=parseCursor(url.searchParams.get('cursor'));
      const params=new URLSearchParams({tenant_id:'eq.'+tenant,select:'*',limit:'51',order:'created_at.desc,id.desc'});
      if(cursor)params.set('or',`(created_at.lt.${cursor[0]},and(created_at.eq.${cursor[0]},id.lt.${cursor[1]}))`);
      isFeed=true;
      result=await upstream('/rest/v1/'+table+'?'+params);
    } else return json({error:'not_found'},404);
    const body=await boundedJSON(result,1048576).catch(()=>{throw new Error('upstream_invalid_response');});
    if(!result.ok){
      const conflicts=['23505','40001'].includes(body.code);
      const forbidden=body.code==='42501'||result.status===403;
      const invalid=['22023','22P02','23503','23502'].includes(body.code);
      return json({error:conflicts?'conflict':forbidden?'forbidden':invalid?'invalid_command':'backend_unavailable'},conflicts?409:forbidden?403:invalid?400:503);
    }
    if(isFeed){
      if(!Array.isArray(body))throw new Error('upstream_invalid_response');
      const page=body.slice(0,50),last=page.at(-1),extra={};
      if(body.length>50){
        if(!timestamp.test(last?.created_at)||!uuid.test(last?.id))throw new Error('upstream_invalid_response');
        extra['x-vision-next-cursor']=btoa(JSON.stringify([last.created_at,last.id])).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
      }
      return json(page,200,extra);
    }
    return json(body);
  } catch(e){
    if(e.message==='body_too_large')return json({error:'body_too_large'},413);
    if(e.message==='invalid_json')return json({error:'invalid_json'},400);
    if(e.message==='invalid_cursor')return json({error:'invalid_cursor'},400);
    return json({error:'backend_unavailable'},503);
  }
}

function configured(env){
  // Pin one project; reject accidental production URLs and privileged keys.
  return /^[a-z0-9]{20}$/.test(env.SUPABASE_STAGING_REF||'')
    && env.SUPABASE_URL===`https://${env.SUPABASE_STAGING_REF}.supabase.co`
    && /^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_PUBLISHABLE_KEY||'');
}
export default {fetch(request,env){return handle(request,env);}};
