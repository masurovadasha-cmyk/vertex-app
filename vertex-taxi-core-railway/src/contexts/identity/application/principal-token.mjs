import crypto from "node:crypto";
import {ROLES} from "../../../contracts/roles.mjs";

function b64url(input){return Buffer.from(input).toString("base64url")}
function signPart(value,secret){return crypto.createHmac("sha256",secret).update(value).digest("base64url")}

export function issuePrincipalToken({userId,role,ttlSeconds=900,audience="vertex-taxi-core"},secret,now=Math.floor(Date.now()/1000)){
  if(!secret) throw new Error("principal signing secret required");
  if(!userId||!ROLES.includes(role)) throw new Error("invalid principal");
  const header=b64url(JSON.stringify({alg:"HS256",typ:"VTX"}));
  const payload=b64url(JSON.stringify({sub:userId,role,aud:audience,iat:now,exp:now+ttlSeconds}));
  const input=header+"."+payload;
  return input+"."+signPart(input,secret);
}

export function verifyPrincipalToken(token,secret,{audience="vertex-taxi-core",now=Math.floor(Date.now()/1000)}={}){
  if(!secret||!token) return null;
  const parts=String(token).split(".");
  if(parts.length!==3)return null;
  const input=parts[0]+"."+parts[1];
  const expected=Buffer.from(signPart(input,secret));
  const actual=Buffer.from(parts[2]);
  if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return null;
  try{
    const header=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    const payload=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
    if(header.alg!=="HS256"||header.typ!=="VTX")return null;
    if(payload.aud!==audience||!ROLES.includes(payload.role)||!payload.sub)return null;
    if(!Number.isFinite(payload.exp)||payload.exp<=now)return null;
    return Object.freeze({userId:String(payload.sub),role:payload.role,exp:payload.exp});
  }catch{return null}
}
