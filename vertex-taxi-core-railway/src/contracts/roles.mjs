export const ROLES=Object.freeze(["client","driver","staff","moderator","admin","owner"]);
const grants={
 client:["ride:create","ride:read:self","rating:create"],
 driver:["presence:write:self","offer:respond:self","ride:operate:assigned","earnings:read:self"],
 staff:["ride:read:organization","support:work"],
 moderator:["driver:moderate","ride:read:organization","support:work"],
 admin:["organization:operate","driver:moderate","ride:read:organization","finance:read"],
 owner:["*"]
};
export function can(role,permission){
  const list=grants[role]||[];
  return list.includes("*")||list.includes(permission);
}
