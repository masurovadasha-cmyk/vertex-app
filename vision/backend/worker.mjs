const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body,status=200) => Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});

async function boundedJSON(source,limit) {
  if(Number(source.headers.get('content-length'))>limit) throw new Error('body_too_large');
  const reader=source.body?.getReader();if(!reader)throw new Error('invalid_json');
  let length=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new Error('body_too_large');}chunks.push(value);}
  const data=new Uint8Array(length);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(data));}catch{throw new Error('invalid_json');}
}

// Dependency parsing failures are not errors in the caller's request body.
async function upstreamJSON(response,limit) {
  try{return await boundedJSON(response,limit);}
  catch{throw new Error('upstream_invalid_response');}
}

// All data requests retain the user's verified bearer token. There is no service-role key.
export async function handle(request,env,fetcher=fetch) {
  const url=new URL(request.url);
  if(env.VISION_ENV!=='staging')return json({error:'staging_only'},503);
  if(url.pathname==='/health')return json({service:'VERTEX VISION',environment:'staging',configured:configured(env)});
  if(!url.pathname.startsWith('/api/')){
    if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
    if(!env.ASSETS||typeof env.ASSETS.fetch!=='function')return json({error:'assets_not_configured'},503);
    return env.ASSETS.fetch(request);
  }
  if(!configured(env))return json({error:'backend_not_configured'},503);
  if(request.headers.has('origin') && request.headers.get('origin')!==url.origin)return json({error:'origin_denied'},403);
  if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
  const authorization=request.headers.get('authorization');
  if(!authorization?.match(/^Bearer [A-Za-z0-9_.-]+$/) || authorization.length>8192)return json({error:'unauthorized'},401);
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization,'content-type':'application/json'};
  const upstream=(path,options={})=>fetcher(env.SUPABASE_URL+path,{...options,headers,redirect:'error',signal:AbortSignal.timeout(10000)});
  try{
    const identity=await upstream('/auth/v1/user');
    if(!identity.ok){
      const unavailable=identity.status===429||identity.status>=500;
      return json({error:unavailable?'auth_unavailable':'unauthorized'},unavailable?503:401);
    }
    const user=await upstreamJSON(identity,65536);
    if(!uuid.test(user.id||''))return json({error:'unauthorized'},401);
    let result;
    if((url.pathname==='/api/commands'||url.pathname==='/api/v1/views/commands') && request.method==='POST') {
      const mediaType=request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
      if(mediaType!=='application/json')return json({error:'json_required'},415);
      const command=await boundedJSON(request,8192);
      // Unknown keys, tenant, identity, roles, state and versions are validated again in SQL.
      const rpc=url.pathname==='/api/v1/views/commands'?'vision_views_command':'vision_command';
      result=await upstream('/rest/v1/rpc/'+rpc,{method:'POST',body:JSON.stringify({command})});
    } else if(request.method==='GET' && [
      '/api/orders','/api/tasks','/api/audit','/api/history',
      '/api/v1/views/bookings','/api/v1/views/units','/api/v1/views/cleaning'
    ].includes(url.pathname)) {
      const tenant=url.searchParams.get('tenant_id');
      if(!uuid.test(tenant||''))return json({error:'tenant_id_required'},400);
      const tables={
        '/api/orders':'vision_orders','/api/tasks':'vision_tasks','/api/audit':'vision_audit_events','/api/history':'vision_order_status_history',
        '/api/v1/views/bookings':'vision_views_bookings','/api/v1/views/units':'vision_views_units','/api/v1/views/cleaning':'vision_views_cleaning_jobs'
      };
      const table=tables[url.pathname];
      const params=new URLSearchParams({tenant_id:'eq.'+tenant,select:'*',limit:'50',order:'created_at.desc,id.desc'});
      result=await upstream('/rest/v1/'+table+'?'+params);
    } else return json({error:'not_found'},404);
    const body=await upstreamJSON(result,1048576);
    if(!result.ok){
      const conflicts=['23505','40001'].includes(body.code);
      const forbidden=body.code==='42501'||result.status===403;
      const invalid=['22023','22P02','23503','23502'].includes(body.code);
      return json({error:conflicts?'conflict':forbidden?'forbidden':invalid?'invalid_command':'backend_unavailable'},conflicts?409:forbidden?403:invalid?400:503);
    }
    return json(body);
  } catch(e){
    if(e.message==='body_too_large')return json({error:'body_too_large'},413);
    if(e.message==='invalid_json')return json({error:'invalid_json'},400);
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
