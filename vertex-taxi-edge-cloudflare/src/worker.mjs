const SAFE_METHODS=new Set(["GET","HEAD","OPTIONS","POST"]);
const PUBLIC_PREFIXES=["/presentation","/demo/","/health","/icon.svg","/styles.css","/app.js","/manifest.webmanifest"];

function securityHeaders(headers){
  headers.set("x-content-type-options","nosniff");
  headers.set("referrer-policy","strict-origin-when-cross-origin");
  headers.set("permissions-policy","camera=(), microphone=()");
  headers.set("x-frame-options","DENY");
  return headers;
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(!SAFE_METHODS.has(request.method)) return new Response("method not allowed",{status:405});
    if(url.pathname==="/edge/health") return Response.json({service:"vertex-taxi-edge",status:"ok"});
    const isPublic=PUBLIC_PREFIXES.some(prefix=>url.pathname===prefix||url.pathname.startsWith(prefix));
    if(!isPublic && !url.pathname.startsWith("/v1/")) return new Response("not found",{status:404});
    const origin=new URL(env.ORIGIN_BASE);
    origin.pathname=url.pathname;
    origin.search=url.search;
    const headers=new Headers(request.headers);
    headers.set("x-vertex-edge","cloudflare");
    headers.delete("cf-connecting-ip");
    const upstream=await fetch(new Request(origin.toString(),{
      method:request.method,
      headers,
      body:["GET","HEAD"].includes(request.method)?undefined:request.body,
      redirect:"manual"
    }));
    const outHeaders=securityHeaders(new Headers(upstream.headers));
    return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:outHeaders});
  }
};
