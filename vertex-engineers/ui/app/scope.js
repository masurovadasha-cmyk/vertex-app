const STORAGE_KEY="vertex.engineers.staging.scope.v1";

function clean(value){return typeof value==="string"&&value.trim()?value.trim():null;}

export function readStagingScope(){
  // Preview-only bridge. Production must derive this from verified VERTEX VISION identity.
  try{
    const raw=sessionStorage.getItem(STORAGE_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    const tenant_id=clean(parsed.tenant_id),organization_id=clean(parsed.organization_id);
    return tenant_id&&organization_id?{tenant_id,organization_id}:null;
  }catch{return null;}
}

export function setPreviewScope(scope){
  const tenant_id=clean(scope?.tenant_id),organization_id=clean(scope?.organization_id);
  if(!tenant_id||!organization_id)throw new Error("tenant_id and organization_id are required");
  sessionStorage.setItem(STORAGE_KEY,JSON.stringify({tenant_id,organization_id}));
}

export function clearPreviewScope(){sessionStorage.removeItem(STORAGE_KEY);}
