import {stagingConfig,safeSummary} from './staging-config.mjs';

const config=stagingConfig(process.env,{worker:true});
const base=config.workerUrl;
const timeout=Number(process.env.VISION_STAGING_HTTP_TIMEOUT_MS||10000);

async function request(path,options={}){
  const response=await fetch(base+path,{...options,redirect:'error',signal:AbortSignal.timeout(timeout)});
  let body=null;
  try{body=await response.json();}catch{}
  return {response,body};
}

const health=await request('/health');
if(health.response.status!==200)throw new Error('staging /health returned '+health.response.status);
if(health.body?.service!=='VERTEX VISION'||health.body?.environment!=='staging')throw new Error('unexpected staging health payload');
if(health.body?.configured!==true)throw new Error('staging worker is deployed but Supabase bindings are not configured');
if(health.response.headers.get('cache-control')!=='no-store')throw new Error('health must be no-store');

const tenantProbe='00000000-0000-4000-8000-000000000001';
const anonymous=await request('/api/orders?tenant_id='+tenantProbe);
if(anonymous.response.status!==401)throw new Error('anonymous data request must be rejected with 401');

const crossOrigin=await request('/api/orders?tenant_id='+tenantProbe,{headers:{origin:'https://external.invalid'}});
if(crossOrigin.response.status!==403)throw new Error('cross-origin data request must be rejected with 403');

const token=String(process.env.VISION_STAGING_BEARER_TOKEN||'').trim();
const tenant=String(process.env.VISION_STAGING_TENANT_ID||'').trim();
let authenticated='not-requested';
if(token||tenant){
  if(!token||!tenant)throw new Error('VISION_STAGING_BEARER_TOKEN and VISION_STAGING_TENANT_ID must be supplied together');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant))throw new Error('VISION_STAGING_TENANT_ID must be a UUID');
  const orders=await request('/api/orders?tenant_id='+encodeURIComponent(tenant),{headers:{authorization:'Bearer '+token}});
  if(orders.response.status!==200)throw new Error('authenticated staging orders probe returned '+orders.response.status);
  if(!Array.isArray(orders.body))throw new Error('authenticated orders response must be an array');
  authenticated='passed';
}

console.log(JSON.stringify({
  ok:true,
  target:safeSummary(config),
  health:'passed',
  anonymousDeny:'passed',
  crossOriginDeny:'passed',
  authenticatedRead:authenticated
},null,2));
