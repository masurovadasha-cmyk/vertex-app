const CACHE='vertex-demo-v15';
const ASSETS=['./group.js','./group.css','./uzbekistan.css','./concierge-learning.js','./concierge-demo.js','./concierge-demo.css','./design.css','./design-modules.css','./design-shell.js','./design-interactions.js','./bali.jpg','./istanbul.jpg','./business.js','./business.css','./rentals.js','./rentals.css','./style.css','./app.js','./mobile.js','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('vertex-demo-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  // Never cache authentication redirects or HTML from the private hosting gateway.
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).catch(()=>new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Vertex · Offline</title><body style="font:18px Arial;padding:32px;background:#203a33;color:white"><h1>Vertex</h1><p>Нет подключения к интернету. Подключитесь и обновите страницу.</p><p>You are offline. Connect to the internet and reload.</p><button onclick="location.reload()" style="padding:16px">Обновить / Reload</button></body>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}})));return;
  }
  if(!ASSETS.some(path=>new URL(path,self.location.href).href===e.request.url))return;
  e.respondWith(fetch(e.request).then(response=>{if(response.ok&&!response.redirected){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return response;}).catch(async()=>await caches.match(e.request)||Response.error()));
});



