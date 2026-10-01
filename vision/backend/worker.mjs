const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body,status=200) => Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});

async function taxiFetch(env, path, request, body) {
  const correlationId = request.headers.get('x-vertex-correlation-id') || crypto.randomUUID();
  const headers = new Headers({
    'x-vertex-correlation-id': correlationId,
    'cache-control': 'no-store',
  });
  for (const name of ['authorization','x-vertex-tenant-id','x-vertex-organization-id','idempotency-key']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (env.VERTEX_TAXI_CORE && typeof env.VERTEX_TAXI_CORE.fetch === 'function') {
    if (body !== undefined) headers.set('content-type','application/json');
    const target = new Request('https://vertex-taxi-core.internal' + path, {
      method: request.method,
      headers,
      body: body === undefined ? undefined : body,
    });
    return await env.VERTEX_TAXI_CORE.fetch(target);
  }
  if (env.TAXI_INTEGRATION_URL && env.TAXI_INTEGRATION_SHARED_SECRET) {
    headers.set('x-vertex-integration-secret', env.TAXI_INTEGRATION_SHARED_SECRET);
    if (body !== undefined) headers.set('content-type','application/json');
    return await fetch(env.TAXI_INTEGRATION_URL.replace(/\\/$/,'') + path, {
      method: request.method,
      headers,
      body: body === undefined ? undefined : body,
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
    });
  }
  return null;
}

function taxiPath(pathname) {
  if (pathname === '/api/taxi/capabilities') return '/integration/v1/capabilities';
  if (pathname === '/api/taxi/health') return '/integration/v1/health';
  const ride = pathname.match(/^\/api\/taxi\/rides\/([^/]+)$/);
  if (ride) return '/integration/v1/rides/' + encodeURIComponent(ride[1]);
  if (pathname === '/api/taxi/rides') return '/integration/v1/rides';
  const command = pathname.match(/^\/api\/taxi\/rides\/([^/]+)\/commands$/);
  if (command) return '/integration/v1/rides/' + encodeURIComponent(command[1]) + '/commands';
  return null;
}

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
    const taxiTarget = taxiPath(url.pathname);
    if (taxiTarget) {
      if (!['GET','POST'].includes(request.method)) return json({error:'method_not_allowed'},405);
      let body;
      if (request.method === 'POST') {
        const mediaType=request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
        if (mediaType!=='application/json') return json({error:'json_required'},415);
        body=JSON.stringify(await boundedJSON(request,8192));
      }
      const taxiResponse=await taxiFetch(env,taxiTarget,request,body);
      if (!taxiResponse) return json({error:'taxi_integration_not_configured'},503);
      const taxiBody=await upstreamJSON(taxiResponse,1048576);
      return json(taxiBody,taxiResponse.status);
    }
    if(url.pathname==='/api/commands' && request.method==='POST') {
      const mediaType=request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
      if(mediaType!=='application/json')return json({error:'json_required'},415);
      const command=await boundedJSON(request,8192);
      // Unknown keys, tenant, identity, roles, state and versions are validated again in SQL.
      result=await upstream('/rest/v1/rpc/vision_command',{method:'POST',body:JSON.stringify({command})});
    } else if(request.method==='GET' && ['/api/orders','/api/tasks','/api/audit','/api/history'].includes(url.pathname)) {
      const tenant=url.searchParams.get('tenant_id');
      if(!uuid.test(tenant||''))return json({error:'tenant_id_required'},400);
      const tables={orders:'vision_orders',tasks:'vision_tasks',audit:'vision_audit_events',history:'vision_order_status_history'};
      const table=tables[url.pathname.split('/')[2]];
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
