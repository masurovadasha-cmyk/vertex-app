// VERTEX VISION Work assignee DTO projector.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function projectWorkAssignees(body){
  if(!Array.isArray(body)||body.length>100)throw new Error('upstream_invalid_response');
  const seen=new Set();
  return Object.freeze(body.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['id','display_name'].includes(key)))throw new Error('upstream_invalid_response');
    if(typeof row.id!=='string'||!UUID.test(row.id)||seen.has(row.id)||typeof row.display_name!=='string'||row.display_name.length<1||row.display_name.length>160)throw new Error('upstream_invalid_response');
    seen.add(row.id);
    return Object.freeze({id:row.id,displayName:row.display_name});
  }));
}
