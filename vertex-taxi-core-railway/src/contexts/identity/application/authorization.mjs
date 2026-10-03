import {can,ROLES} from "../../../contracts/roles.mjs";

export function parsePrincipal(headers={}){
  const role=String(headers["x-vertex-role"]||headers.get?.("x-vertex-role")||"").toLowerCase();
  const userId=String(headers["x-vertex-user-id"]||headers.get?.("x-vertex-user-id")||"");
  if(!ROLES.includes(role)) return null;
  if(!userId) return null;
  return Object.freeze({userId,role});
}

export function requirePermission(permission){
  return async function permissionGuard(req,reply){
    const principal=parsePrincipal(req.headers);
    if(!principal) return reply.code(401).send({error:"principal_required"});
    if(!can(principal.role,permission)) return reply.code(403).send({error:"forbidden",permission});
    req.vertexPrincipal=principal;
  };
}

export function requireSelfOr(permission,paramName){
  return async function selfOrGuard(req,reply){
    const principal=parsePrincipal(req.headers);
    if(!principal) return reply.code(401).send({error:"principal_required"});
    const target=String(req.params?.[paramName]||"");
    if(principal.userId===target || can(principal.role,permission)){
      req.vertexPrincipal=principal;
      return;
    }
    return reply.code(403).send({error:"forbidden"});
  };
}
