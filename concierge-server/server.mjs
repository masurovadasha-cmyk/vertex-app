import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
const host=process.env.HOST||'127.0.0.1', port=Number(process.env.PORT||8787);
const origin=process.env.PUBLIC_ORIGIN||`http://${host}:${port}`;
const secure=origin.startsWith('https:');
const password=process.env.OPERATOR_PASSWORD||'';
if(password.length<16||password==='replace-with-a-unique-long-password')throw Error('Set a unique OPERATOR_PASSWORD with at least 16 characters.');
const passwordHash=scryptSync(password,'vertex-operator-v1',32);
const directory=path.resolve(root,process.env.DATA_DIR||'.data');
await fs.mkdir(directory,{recursive:true,mode:0o700});
const statePath=path.join(directory,'state.json');
let state={rooms:[]};
try{state=JSON.parse(await fs.readFile(statePath,'utf8'));if(!Array.isArray(state.rooms))throw Error('Invalid state');}catch(e){if(e.code!=='ENOENT')throw e;}
let writing=Promise.resolve();
function save(){const json=JSON.stringify(state);writing=writing.then(async()=>{await fs.writeFile(statePath+'.tmp',json,{mode:0o600});await fs.rename(statePath+'.tmp',statePath);});return writing;}
const sessions=new Map(),streams=new Set(),attempts=new Map();
const token=()=>randomBytes(32).toString('base64url');
const digest=s=>createHash('sha256').update(s).digest('hex');
function session(req){const match=(req.headers.cookie||'').match(/(?:^|;\s*)vertex_session=([A-Za-z0-9_-]+)/);const s=match&&sessions.get(digest(match[1]));if(!s||s.expires<Date.now())return null;if(s.role==='guest'&&!state.rooms.some(r=>r.id===s.room&&r.status==='ready'&&Date.parse(r.expires)>Date.now()))return null;return s;}
function setSession(res,role,room){const raw=token();const s={id:token(),role,room,expires:Date.now()+12*3600000};sessions.set(digest(raw),s);res.setHeader('Set-Cookie',`vertex_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure?'; Secure':''}`);return s;}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
function fail(status,message){const e=Error(message);e.status=status;throw e;}
async function body(req){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>32768)fail(413,'Request too large');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail(400,'Invalid JSON');}}
const text=(value,max=2000)=>typeof value==='string'?value.trim().slice(0,max):'';
function roomFor(id,s){const room=state.rooms.find(r=>r.id===id);if(!room||s.role==='guest'&&s.room!==id)fail(404,'Room not found');if(room.status!=='ready'||Date.parse(room.expires)<=Date.now())fail(410,'Guest access expired');return room;}
function notify(room,event,exclude){for(const stream of streams){if(stream.s.id===exclude)continue;if(stream.s.role==='operator'||stream.s.room===room)stream.res.write(`data: ${JSON.stringify({room,...event})}\n\n`);}}
function view(room){return {id:room.id,guest:room.guest,title:room.title,status:room.status,expires:room.expires,info:room.info,messages:room.messages};}
const api=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'");
  try{
    const url=new URL(req.url,origin),route=url.pathname;
    if(req.method==='GET'&&['/','/app.js','/style.css'].includes(route)){const name=route==='/'?'index.html':route.slice(1);const type=name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html';res.setHeader('Content-Type',type+'; charset=utf-8');res.end(await fs.readFile(path.join(root,'public',name)));return;}
    if(!route.startsWith('/api/'))fail(404,'Not found');
    if(req.method==='POST'&&req.headers.origin!==origin)fail(403,'Invalid origin');
    if(req.method==='POST'&&(route==='/api/login'||route==='/api/guest-login')){
      const ip=req.socket.remoteAddress;let counter=attempts.get(ip);if(!counter||counter.until<Date.now()){counter={count:0,until:Date.now()+15*60000};attempts.set(ip,counter);}if(++counter.count>15)fail(429,'Too many attempts; try later');
      const b=await body(req);
      if(route==='/api/login'){if(!timingSafeEqual(scryptSync(text(b.password,256),'vertex-operator-v1',32),passwordHash))fail(401,'Invalid credentials');setSession(res,'operator');}
      else{const room=state.rooms.find(r=>r.inviteHash===digest(text(b.token,100))&&r.status==='ready'&&Date.parse(r.expires)>Date.now());if(!room)fail(401,'Invalid or expired invitation');setSession(res,'guest',room.id);}
      json(res,200,{ok:true});return;
    }
    const s=session(req);if(!s)fail(401,'Sign in required');
    if(req.method==='GET'&&route==='/api/me'){json(res,200,{role:s.role,room:s.room||null});return;}
    if(req.method==='POST'&&route==='/api/logout'){for(const [k,v]of sessions)if(v.id===s.id)sessions.delete(k);for(const stream of streams)if(stream.s.id===s.id)stream.res.end();res.setHeader('Set-Cookie',`vertex_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);json(res,200,{ok:true});return;}
    if(req.method==='GET'&&route==='/api/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('data: {"type":"connected"}\n\n');const stream={s,res};streams.add(stream);const heartbeat=setInterval(()=>{if(!session(req)){res.end();return;}res.write(': heartbeat\n\n');},20000);req.on('close',()=>{clearInterval(heartbeat);streams.delete(stream);});return;
    }
    if(req.method==='GET'&&route==='/api/rooms'){json(res,200,{rooms:state.rooms.filter(r=>s.role==='operator'||r.id===s.room).map(r=>({id:r.id,guest:r.guest,title:r.title,status:r.status,expires:r.expires}))});return;}
    if(req.method==='POST'&&route==='/api/rooms'){
      if(s.role!=='operator')fail(403,'Operator only');const b=await body(req);const guest=text(b.guest,100),title=text(b.title,120),expires=text(b.expires,40);if(!guest||!title||!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now())fail(400,'Guest, apartment and future expiry are required');
      const invite=token();const room={id:token().slice(0,16),guest,title,expires,status:'ready',inviteHash:digest(invite),info:{address:text(b.address,300),floor:text(b.floor,20),apartment:text(b.apartment,30),doorCode:text(b.doorCode,100),wifiName:text(b.wifiName,100),wifiPassword:text(b.wifiPassword,100),instructions:text(b.instructions,4000),phone:text(b.phone,100)},messages:[{id:token().slice(0,12),side:'system',text:'Здравствуйте! Апартаменты готовы. Памятка заселения доступна в разделе «Данные проживания». По вопросам напишите консьержу.',at:new Date().toISOString()}]};state.rooms.push(room);await save();notify(room.id,{type:'rooms'});json(res,201,{room:view(room),inviteUrl:origin+'/#invite='+invite});return;
    }
    const match=route.match(/^\/api\/rooms\/([A-Za-z0-9_-]+)(?:\/(messages|signal|revoke))?$/);
    if(match){const room=roomFor(match[1],s),action=match[2];
      if(req.method==='GET'&&!action){json(res,200,{room:view(room)});return;}
      if(req.method==='POST'&&action==='messages'){const b=await body(req),message=text(b.text,2000);if(!message)fail(400,'Empty message');if(room.messages.length>=5000)fail(409,'Conversation limit reached');room.messages.push({id:token().slice(0,12),side:s.role,text:message,at:new Date().toISOString()});await save();notify(room.id,{type:'message'});json(res,201,{ok:true});return;}
      if(req.method==='POST'&&action==='revoke'){if(s.role!=='operator')fail(403,'Operator only');room.status='revoked';await save();notify(room.id,{type:'revoked'});for(const stream of streams)if(stream.s.room===room.id)stream.res.end();json(res,200,{ok:true});return;}
      if(req.method==='POST'&&action==='signal'){const b=await body(req);if(!['offer','answer','ice','hangup','decline'].includes(b.type))fail(400,'Invalid signal');const listeners=[...streams].filter(x=>x.s.id!==s.id&&(s.role==='guest'?x.s.role==='operator':x.s.role==='guest'&&x.s.room===room.id));for(const target of listeners)target.res.write(`data: ${JSON.stringify({type:'signal',room:room.id,signal:b,from:s.role})}\n\n`);json(res,200,{online:listeners.length>0});return;}
    }
    if(req.method==='GET'&&route==='/api/ice'){const servers=[];if(process.env.TURN_URL&&process.env.TURN_USERNAME&&process.env.TURN_PASSWORD)servers.push({urls:process.env.TURN_URL,username:process.env.TURN_USERNAME,credential:process.env.TURN_PASSWORD});json(res,200,{iceServers:servers,turnConfigured:servers.length>0});return;}
    fail(404,'Not found');
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Server error'});else res.end();if(!e.status)console.error('Request failed:',e.code||e.name);}
});
api.listen(port,host,()=>console.log('Vertex concierge listening on '+origin));
setInterval(()=>{for(const[k,v]of sessions)if(v.expires<Date.now())sessions.delete(k);for(const[k,v]of attempts)if(v.until<Date.now())attempts.delete(k);},60000).unref();
