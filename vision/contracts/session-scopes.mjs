const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function projectSessionScopes(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('upstream_invalid_response');
  if(!UUID.test(body.actor_id||'')||body.module!=='views'||!Array.isArray(body.scopes)||body.scopes.length>100)throw new Error('upstream_invalid_response');
  const seen=new Set();
  const scopes=body.scopes.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('upstream_invalid_response');
    const keys=Object.keys(row);
    const allowed=['tenant_id','organization_id','organization_name','member_authorized','guest_linked'];
    if(keys.some(k=>!allowed.includes(k)))throw new Error('upstream_invalid_response');
    if(!UUID.test(row.tenant_id||'')||!UUID.test(row.organization_id||''))throw new Error('upstream_invalid_response');
    if(typeof row.organization_name!=='string'||row.organization_name.length<1||row.organization_name.length>200)throw new Error('upstream_invalid_response');
    if(typeof row.member_authorized!=='boolean'||typeof row.guest_linked!=='boolean'||(!row.member_authorized&&!row.guest_linked))throw new Error('upstream_invalid_response');
    const key=row.tenant_id+':'+row.organization_id;if(seen.has(key))throw new Error('upstream_invalid_response');seen.add(key);
    return Object.freeze({
      tenantId:row.tenant_id,
      organizationId:row.organization_id,
      organizationName:row.organization_name,
      memberAuthorized:row.member_authorized,
      guestLinked:row.guest_linked
    });
  });
  return Object.freeze({actorId:body.actor_id,module:'views',scopes:Object.freeze(scopes)});
}
