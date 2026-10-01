export function idempotencyKey({organizationId,actorId,command,key}){
  if(!organizationId||!actorId||!command||!key) throw new Error("idempotency_fields_required");
  return [organizationId,actorId,command,key].map(String).join(":");
}
export function requestFingerprint(value){
  const canonical=JSON.stringify(sortValue(value));
  let h=2166136261;
  for(let i=0;i<canonical.length;i++){h^=canonical.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16).padStart(8,"0");
}
function sortValue(value){
  if(Array.isArray(value)) return value.map(sortValue);
  if(value&&typeof value==="object") return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortValue(value[k])]));
  return value;
}
