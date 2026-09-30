const DEFAULT_BASE="/api/v1/engineers";

export class EngineersApiError extends Error{
  constructor(message,{status=0,code="request_failed"}={}){super(message);this.name="EngineersApiError";this.status=status;this.code=code;}
}

export function createEngineersApi({base=DEFAULT_BASE,scopeProvider,fetchImpl=fetch}={}){
  async function request(path,options={}){
    const scope=await scopeProvider?.();
    if(!scope?.tenant_id||!scope?.organization_id){
      throw new EngineersApiError("Verified staging scope is not available.",{code:"scope_unavailable"});
    }
    const headers=new Headers(options.headers||{});
    headers.set("accept","application/json");
    headers.set("x-tenant-id",scope.tenant_id);
    headers.set("x-organization-id",scope.organization_id);
    if(options.body&&!headers.has("content-type"))headers.set("content-type","application/json");
    const response=await fetchImpl(base+path,{...options,headers});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new EngineersApiError(payload.error||"Engineers API request failed.",{status:response.status});
    return payload;
  }
  return {
    projects:()=>request("/projects"),
    assets:()=>request("/assets"),
    workOrders:()=>request("/work-orders"),
    health:async()=>{
      const response=await fetchImpl(base+"/health",{headers:{accept:"application/json"}});
      if(!response.ok)throw new EngineersApiError("Engineers health request failed.",{status:response.status});
      return response.json();
    }
  };
}

export async function loadEngineersOverview(api){
  const [projects,assets,workOrders]=await Promise.all([api.projects(),api.assets(),api.workOrders()]);
  return {projects:projects.items||[],assets:assets.items||[],workOrders:workOrders.items||[]};
}
