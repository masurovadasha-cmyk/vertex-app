import core from './registry.cjs';
import {sourceCommit} from './build-info.generated.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const metadata=()=>({service:core.name,version:core.version,revision:core.revision,sourceCommit,coreVersion:core.coreVersion,moduleCount:core.modules.length,...core.readiness()});
/** Public deployment deliberately contains NO profile impersonation or database credentials.
 * Supabase Auth/RLS integration stays in the separate staging worker until verified.
 * A metadata response is never evidence that Auth, migrations or a shared database work.
 */
export async function handle(request,env={}){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/health'||path==='/api/vision/v1/health'){
    if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'method_not_allowed'},405);
    return request.method==='HEAD'?new Response(null,{status:200,headers:{'cache-control':'no-store'}}):json(metadata());
  }
  if(path==='/readyz')return json({error:'cloud_backend_not_connected',mode:'release-candidate',activeModule:'views',authenticated:false},503);
  if(path.startsWith('/api/')){
    const origin=request.headers.get('origin');
    if(origin&&origin!==url.origin)return json({error:'origin_denied'},403);
    if(path==='/api/vision/v1/modules'){
      if(request.method!=='GET')return json({error:'method_not_allowed'},405);
      return json({platform:core.id,version:core.version,modules:core.modules});
    }
    if(['/api/vision/v1/commands','/api/vision/v1/orders','/api/vision/v1/tasks','/api/vision/v1/audit','/api/v1/context','/api/v1/work-feed','/api/v1/work-assignees','/api/v1/work/commands','/api/v1/notifications','/api/v1/notifications/commands'].includes(path)||path.startsWith('/api/v1/views/')){
      // No fallback to demo identities, privileged credentials or browser-owned roles.
      return json({error:'cloud_backend_not_connected',mode:'release-candidate',activeModule:'views',authenticated:false},503);
    }
    return json({error:'not_found'},404);
  }
  if(path==='/vision'||path.startsWith('/vision/')||path.startsWith('/.'))return json({error:'not_found'},404);
  if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(!env.ASSETS||typeof env.ASSETS.fetch!=='function')return json({error:'assets_not_configured'},503);
  return env.ASSETS.fetch(request);
}
export default {fetch:handle};
