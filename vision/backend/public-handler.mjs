import {handle as api} from './worker.mjs';
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
export function publicHandler(assets){return async(request,env)=>{
  if(env.VISION_ENV!=='staging')return Response.json({error:'staging_only'},{status:503,headers});
  const path=new URL(request.url).pathname;
  if(['/api/profiles','/api/modules','/dev.js'].includes(path))return new Response('Not found',{status:404,headers});
  if(path==='/health'||path.startsWith('/api/'))return api(request,env);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,allow:'GET, HEAD'}});
  if(path==='/download/android')return new Response(null,{status:302,headers:{...headers,location:'https://vertex-app.masurovadasha.workers.dev/Vertex-Latest.apk'}});
  const asset=Object.hasOwn(assets,path)?assets[path]:null;
  if(!asset)return new Response('Not found',{status:404,headers});
  return new Response(request.method==='HEAD'?null:asset.body,{headers:{...headers,'content-type':asset.type}});
};}
