const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body,status=200) => Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});

const integrationUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function taxiIntegrationHeaders(request, correlationId, userId) {
  const headers = new Headers({
    'x-vertex-correlation-id': correlationId,
    'x-vertex-caller': 'vertex-vision',
    'x-vertex-integration-version': '1',
    'x-vertex-user-id': userId,
    'cache-control': 'no-store',
  });
  for (const name of ['authorization','x-vertex-tenant-id','x-vertex-organization-id','idempotency-key']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function b64url(bytes) {
  let binary='';
  for (const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

function exactBuffer(bytes) {
  const copy=new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function taxiDigest(value) {
  const bytes=typeof value==='string' ? new TextEncoder().encode(value) : value;
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',exactBuffer(bytes))));
}

async function signTaxiHeaders(env,path,method,headers,body) {
  if (!env.TAXI_INTEGRATION_PRIVATE_JWK || !env.TAXI_INTEGRATION_KEY_ID) return null;
  let jwk;
  try { jwk=JSON.parse(env.TAXI_INTEGRATION_PRIVATE_JWK); }
  catch { return null; }
  if (jwk?.kty!=='EC' || jwk?.crv!=='P-256' || !jwk?.d || !jwk?.x || !jwk?.y) return null;
  const key=await crypto.subtle.importKey(
    'jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']
  );
  const timestamp=String(Math.floor(Date.now()/1000));
  const authorization=headers.get('authorization')||'';
  const canonical=[
    method.toUpperCase(),
    path,
    timestamp,
    headers.get('x-vertex-tenant-id')||'',
    headers.get('x-vertex-organization-id')||'',
    headers.get('x-vertex-user-id')||'',
    headers.get('x-vertex-correlation-id')||'',
    headers.get('x-vertex-caller')||'',
    await taxiDigest(authorization),
    await taxiDigest(new TextEncoder().encode(body??'')),
  ].join('\n');
  const signature=new Uint8Array(await crypto.subtle.sign(
    {name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(canonical)
  ));
  headers.set('x-vertex-key-id',env.TAXI_INTEGRATION_KEY_ID);
  headers.set('x-vertex-timestamp',timestamp);
  headers.set('x-vertex-signature',b64url(signature));
  return headers;
}

function taxiHttpOrigin(value) {
  if (!value) return null;
  try {
    const url=new URL(value);
    if (url.protocol!=='https:' || url.username || url.password || url.search || url.hash) return null;
    if (url.pathname!=='/' && url.pathname!=='') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function taxiHttpPath(prefix,path) {
  if (prefix===undefined || prefix===null || prefix==='') return path;
  if (prefix!=='/_api') return null;
  return prefix + path;
}

function taxiHttpAdapter(prefix,path,body) {
  if (prefix===undefined || prefix===null || prefix==='') return {path,body};
  if (prefix!=='/_api') return null;
  if (path==='/integration/v1/capabilities') return {path:'/_api/integration/v1/capabilities',body};
  if (path==='/integration/v1/health') return {path:'/_api/integration/v1/health',body};
  if (path==='/integration/v1/rides') return {path:'/_api/integration/v1/rides',body};
  const ride=path.match(/^\/integration\/v1\/rides\/([^/]+)$/);
  if (ride) {
    return {path:'/_api/integration/v1/ride?rideId='+encodeURIComponent(decodeURIComponent(ride[1])),body};
  }
  const command=path.match(/^\/integration\/v1\/rides\/([^/]+)\/commands$/);
  if (command) {
    let payload;
    try { payload=body===undefined?{}:JSON.parse(body); }
    catch { return null; }
    return {
      path:'/_api/integration/v1/commands',
      body:JSON.stringify({...payload,rideId:decodeURIComponent(command[1])}),
    };
  }
  return null;
}

async function taxiFetch(env, path, request, body, userId) {
  const correlationId = request.headers.get('x-vertex-correlation-id') || crypto.randomUUID();
  const baseHeaders = taxiIntegrationHeaders(request, correlationId, userId);
  if (body !== undefined) baseHeaders.set('content-type','application/json');

  let mode;
  let targetPath=path;
  let origin=null;
  if (env.VERTEX_TAXI_CORE && typeof env.VERTEX_TAXI_CORE.fetch === 'function') {
    mode='binding';
  } else if (env.TAXI_INTEGRATION_URL) {
    origin=taxiHttpOrigin(env.TAXI_INTEGRATION_URL);
    const adapted=taxiHttpAdapter(env.TAXI_INTEGRATION_PATH_PREFIX,path,body);
    if (!origin || !adapted) return null;
    targetPath=adapted.path;
    body=adapted.body;
    mode='http';
  } else {
    return null;
  }

  const headers=new Headers(baseHeaders);
  if (!(await signTaxiHeaders(env,targetPath,request.method,headers,body))) return null;
  const retryable = request.method === 'GET' || Boolean(request.headers.get('idempotency-key'));
  const maxAttempts = retryable ? 3 : 1;
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (mode==='binding') {
        const target = new Request('https://vertex-taxi-core.internal' + targetPath, {
          method: request.method,
          headers,
          body: body === undefined ? undefined : body,
        });
        const response = await env.VERTEX_TAXI_CORE.fetch(target);
        if (!retryable || ![502,503,504].includes(response.status) || attempt === maxAttempts - 1) return response;
      } else {
        const response = await fetch(origin + targetPath, {
          method: request.method,
          headers,
          body: body === undefined ? undefined : body,
          redirect: 'error',
          signal: AbortSignal.timeout(2500),
        });
        if (!retryable || ![502,503,504].includes(response.status) || attempt === maxAttempts - 1) return response;
      }
    } catch (error) {
      lastError = error;
      if (!retryable || attempt === maxAttempts - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
  }
  throw lastError ?? new Error('taxi_integration_unavailable');
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
      const tenantId = request.headers.get('x-vertex-tenant-id') || '';
      const organizationId = request.headers.get('x-vertex-organization-id') || '';
      const correlation = request.headers.get('x-vertex-correlation-id') || '';
      if (!integrationUuid.test(tenantId) || !integrationUuid.test(organizationId)) return json({error:'tenant_context_required'},400);
      if (correlation.length > 128) return json({error:'correlation_id_too_long'},400);
      const delegation=await upstream('/rest/v1/rpc/vision_external_module_context_allowed',{
        method:'POST',
        body:JSON.stringify({t:tenantId,org:organizationId,module_id:'taxi'}),
      });
      if(!delegation.ok)return json({error:'backend_unavailable'},503);
      if((await upstreamJSON(delegation,65536))!==true)return json({error:'forbidden'},403);
      const mutation = request.method === 'POST';
      if (mutation && !request.headers.get('idempotency-key')) return json({error:'idempotency_required'},400);
      let body;
      if (mutation) {
        const mediaType=request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
        if (mediaType!=='application/json') return json({error:'json_required'},415);
        body=JSON.stringify(await boundedJSON(request,8192));
      }
      const taxiResponse=await taxiFetch(env,taxiTarget,request,body,user.id);
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
