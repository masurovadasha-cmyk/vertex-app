import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';

test('guest isolation, automatic welcome, live delivery and revocation',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vertex-concierge-test-'));
  const root=path.dirname(fileURLToPath(import.meta.url));
  const port=19000+Math.floor(Math.random()*20000),origin=`http://127.0.0.1:${port}`;
  const password=randomBytes(24).toString('hex');
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:origin,OPERATOR_PASSWORD:password,DATA_DIR:dir},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let abort;
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),15000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});});
    async function request(route,data,cookie,providedOrigin=origin){const response=await fetch(origin+'/api'+route,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json','Origin':providedOrigin}),...(cookie?{Cookie:cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {response,status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
    assert.equal((await request('/rooms')).status,401);
    assert.equal((await request('/login',{password},null,'https://wrong.invalid')).status,403);
    const login=await request('/login',{password});assert.equal(login.status,200);const operator=login.cookie;
    const created=await request('/rooms',{guest:'Test Guest',title:'Test Apartment',expires:new Date(Date.now()+3600000).toISOString(),doorCode:'DEMO-ONLY',wifiName:'DemoNetwork',wifiPassword:'DEMO-ONLY'},operator);assert.equal(created.status,201);const id=created.data.room.id;
    assert.equal(created.data.room.messages[0].side,'system');assert.equal(created.data.room.info.doorCode,'DEMO-ONLY');
    const invite=new URLSearchParams(new URL(created.data.inviteUrl).hash.slice(1)).get('invite');
    const guestLogin=await request('/guest-login',{token:invite});assert.equal(guestLogin.status,200);const guest=guestLogin.cookie;
    assert.equal((await request('/rooms',{},guest)).status,403);
    const other=await request('/rooms',{guest:'Other Guest',title:'Other apartment',expires:new Date(Date.now()+3600000).toISOString()},operator);assert.equal((await request('/rooms/'+other.data.room.id,undefined,guest)).status,404);
    abort=new AbortController();const stream=await fetch(origin+'/api/events',{headers:{Cookie:guest},signal:abort.signal});const reader=stream.body.getReader();await reader.read();
    assert.equal((await request('/rooms/'+id+'/messages',{text:'Welcome, actual server message'},operator)).status,201);
    const event=await Promise.race([reader.read(),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Live event timeout')),5000);t.unref();})]);assert.match(new TextDecoder().decode(event.value),/"type":"message"/);
    const history=await request('/rooms/'+id,undefined,guest);assert.equal(history.data.room.messages.at(-1).text,'Welcome, actual server message');
    assert.equal((await request('/rooms/'+id+'/revoke',{},operator)).status,200);
    assert.equal((await request('/rooms/'+id,undefined,guest)).status,401);
    assert.equal((await request('/guest-login',{token:invite})).status,401);
  }finally{abort?.abort();child.kill();await new Promise(resolve=>child.once('exit',resolve));await rm(dir,{recursive:true,force:true});}
});
