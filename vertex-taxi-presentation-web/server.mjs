import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT=Number(process.env.PORT||3000);
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"public");
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json",".svg":"image/svg+xml"};

const server=http.createServer(async(req,res)=>{
  if(req.url==="/health"){
    res.writeHead(200,{"content-type":"application/json"});
    return res.end(JSON.stringify({service:"vertex-taxi-presentation",status:"ok",version:"0.4.0"}));
  }
  let pathname=new URL(req.url,"http://local").pathname;
  if(pathname==="/") pathname="/index.html";
  const candidate=path.normalize(path.join(root,pathname));
  if(!candidate.startsWith(root)) {res.writeHead(403);return res.end("forbidden");}
  try{
    const data=await fs.readFile(candidate);
    res.writeHead(200,{"content-type":types[path.extname(candidate)]||"application/octet-stream","cache-control":pathname==="/index.html"?"no-cache":"public, max-age=300"});
    res.end(data);
  }catch{
    try{
      const data=await fs.readFile(path.join(root,"index.html"));
      res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-cache"});
      res.end(data);
    }catch{
      res.writeHead(404);res.end("not found");
    }
  }
});
server.listen(PORT,"0.0.0.0",()=>console.log("Vertex Taxi Presentation listening",PORT));
