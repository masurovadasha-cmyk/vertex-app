// VERTEX VISION Application Kernel: declared API surface and server-authoritative context contract.
import {LIMITS} from './http.mjs';
import {readPlan} from '../modules/views/read-contract.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const permission=/^[a-z][a-z0-9.-]{0,127}$/;
const role=/^[a-z][a-z0-9-]{0,127}$/;

const legacyReads=Object.freeze({
  '/api/orders':'vision_orders',
  '/api/tasks':'vision_tasks',
  '/api/audit':'vision_audit_events',
  '/api/history':'vision_order_status_history'
});
const viewsReads=Object.freeze({
  '/api/v1/views/bookings':'vision_views_bookings',
  '/api/v1/views/units':'vision_views_units',
  '/api/v1/views/cleaning':'vision_views_cleaning_jobs'
});

export function routePlan(url,method){
  const key=String(method||'').toUpperCase()+' '+url.pathname;
  if(key==='POST /api/commands')return Object.freeze({kind:'command',rpc:'vision_command',bodyLimit:LIMITS.commandBytes,module:'core'});
  if(key==='POST /api/v1/views/commands')return Object.freeze({kind:'command',rpc:'vision_views_command',bodyLimit:LIMITS.commandBytes,module:'views'});
  if(key==='GET /api/v1/context'){
    const tenant=url.searchParams.get('tenant_id'),organization=url.searchParams.get('organization_id');
    if(url.searchParams.size!==2||url.searchParams.getAll('tenant_id').length!==1||url.searchParams.getAll('organization_id').length!==1||!uuid.test(tenant||'')||!uuid.test(organization||''))throw new Error('invalid_context_query');
    return Object.freeze({kind:'context',rpc:'vision_session_context',module:'views',tenant,organization});
  }
  if(method==='GET'&&Object.hasOwn(legacyReads,url.pathname)){
    const tenant=url.searchParams.get('tenant_id');
    if(!uuid.test(tenant||''))throw new Error('tenant_id_required');
    return Object.freeze({kind:'legacy-read',table:legacyReads[url.pathname],tenant});
  }
  if(method==='GET'&&Object.hasOwn(viewsReads,url.pathname)){
    const read=readPlan(url);
    return Object.freeze({kind:'views-read',table:viewsReads[url.pathname],module:'views',read});
  }
  return null;
}

export function projectSessionContext(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('upstream_invalid_response');
  if(!uuid.test(body.actor_id||'')||!uuid.test(body.tenant_id||'')||!uuid.test(body.organization_id||''))throw new Error('upstream_invalid_response');
  if(body.module!=='views'||body.module_enabled!==true||typeof body.guest_linked!=='boolean')throw new Error('upstream_invalid_response');
  if(!Array.isArray(body.permissions)||body.permissions.length>128||body.permissions.some(x=>typeof x!=='string'||!permission.test(x)))throw new Error('upstream_invalid_response');
  if(!Array.isArray(body.roles)||body.roles.length>32||body.roles.some(x=>typeof x!=='string'||!role.test(x)))throw new Error('upstream_invalid_response');
  const capabilities=body.capabilities;
  if(!capabilities||typeof capabilities!=='object'||Array.isArray(capabilities))throw new Error('upstream_invalid_response');
  const allowed=['read_operations','create_booking','manage_booking','execute_cleaning','verify_cleaning'];
  if(Object.keys(capabilities).some(k=>!allowed.includes(k))||allowed.some(k=>typeof capabilities[k]!=='boolean'))throw new Error('upstream_invalid_response');
  return Object.freeze({
    actorId:body.actor_id,
    tenantId:body.tenant_id,
    organizationId:body.organization_id,
    module:'views',
    moduleEnabled:true,
    guestLinked:body.guest_linked,
    roles:Object.freeze([...new Set(body.roles)]),
    permissions:Object.freeze([...new Set(body.permissions)]),
    capabilities:Object.freeze(Object.fromEntries(allowed.map(k=>[k,capabilities[k]])))
  });
}
