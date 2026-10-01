const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function taxiRoute(pathname){
  if(pathname==='/api/taxi/capabilities')return '/integration/v1/capabilities';
  if(pathname==='/api/taxi/health')return '/integration/v1/health';
  if(pathname==='/api/taxi/rides')return '/integration/v1/rides';
  const ride=pathname.match(/^\/api\/taxi\/rides\/([^/]+)$/);
  if(ride)return '/integration/v1/rides/'+encodeURIComponent(ride[1]);
  const command=pathname.match(/^\/api\/taxi\/rides\/([^/]+)\/commands$/);
  if(command)return '/integration/v1/rides/'+encodeURIComponent(command[1])+'/commands';
  return null;
}

export function taxiContext(request){
  const tenantId=request.headers.get('x-vertex-tenant-id')||'';
  const organizationId=request.headers.get('x-vertex-organization-id')||'';
  if(!UUID.test(tenantId)||!UUID.test(organizationId))throw new Error('tenant_context_required');
  const correlation=request.headers.get('x-vertex-correlation-id')||crypto.randomUUID();
  if(!UUID.test(correlation))throw new Error('invalid_correlation_id');
  return Object.freeze({tenantId,organizationId,correlation});
}

export function taxiScopeAllowed(scopes,context){
  return Boolean(scopes?.scopes?.some(scope=>
    scope.tenantId===context.tenantId
    && scope.organizationId===context.organizationId
    && scope.memberAuthorized===true
  ));
}

function headersFor(request,context,userId){
  const headers=new Headers({
    'authorization':request.headers.get('authorization')||'',
    'x-vertex-user-id':userId,
    'x-vertex-tenant-id':context.tenantId,
    'x-vertex-organization-id':context.organizationId,
    'x-vertex-correlation-id':context.correlation,
    'x-vertex-caller':'vertex-vision',
    'x-vertex-integration-version':'1',
    'cache-control':'no-store'
  });
  const idem=request.headers.get('idempotency-key');
  if(idem)headers.set('idempotency-key',idem);
  return headers;
}

export async function taxiForward(env,path,request,body,userId,context,fetcher=fetch){
  const headers=headersFor(request,context,userId);
  const retryable=request.method==='GET'||Boolean(request.headers.get('idempotency-key'));
  const attempts=retryable?3:1;
  let lastError;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      let response;
      if(env.VERTEX_TAXI_CORE&&typeof env.VERTEX_TAXI_CORE.fetch==='function'){
        if(body!==undefined)headers.set('content-type','application/json');
        response=await env.VERTEX_TAXI_CORE.fetch(new Request('https://vertex-taxi-core.internal'+path,{
          method:request.method,headers,body:body===undefined?undefined:body
        }));
      }else if(/^https:\/\//.test(env.TAXI_INTEGRATION_URL||'')&&env.TAXI_INTEGRATION_SHARED_SECRET){
        headers.set('x-vertex-integration-secret',env.TAXI_INTEGRATION_SHARED_SECRET);
        if(body!==undefined)headers.set('content-type','application/json');
        response=await fetcher(env.TAXI_INTEGRATION_URL.replace(/\/$/,'')+path,{
          method:request.method,headers,body:body===undefined?undefined:body,
          redirect:'error',signal:AbortSignal.timeout(2500)
        });
      }else return null;
      if(!retryable||![502,503,504].includes(response.status)||attempt===attempts-1)return response;
    }catch(error){
      lastError=error;
      if(!retryable||attempt===attempts-1)throw error;
    }
    await new Promise(resolve=>setTimeout(resolve,75*(attempt+1)));
  }
  throw lastError||new Error('taxi_integration_unavailable');
}
