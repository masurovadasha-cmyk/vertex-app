import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudClient} from '../public/cloud-client.mjs';
const url='https://abcdefghijklmnopqrst.supabase.co';
const profile={user_id:'11111111-1111-4111-8111-111111111111',tenant_id:'22222222-2222-4222-8222-222222222222'};
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};};
const respond=(path)=>path==='/auth/config'?Response.json({url,publishable_key:'sb_publishable_test'}):path.includes('/token?')?Response.json({access_token:'test.jwt.token',expires_in:3600}):path==='/api/session'?Response.json(profile):Response.json([]);
test('cloud login uses publishable key; only user bearer reaches the API; tokens never persist',async()=>{
 const s=storage(),calls=[];const client=createCloudClient({storage:s,fetcher:async(p,o)=>{calls.push([p,o]);return respond(p);}});
 await client.configure();await client.login('test@example.invalid','not-a-real-secret');await client.orders();
 assert.equal(calls[1][1].headers.apikey,'sb_publishable_test');assert.equal(calls[2][1].headers.authorization,'Bearer test.jwt.token');
 assert.equal(s.data.size,0);assert.ok(calls.every(([,o])=>o.credentials==='omit'));await client.logout();assert.equal(client.scope,undefined);
});
test('uncertain command keeps actor-scoped idempotency across a new login and cannot be duplicated by changed form data',async()=>{
 const s=storage(),commands=[];let fail=true;
 const fetcher=async(p,o)=>{if(p==='/api/commands'){commands.push(JSON.parse(o.body));if(fail)throw new Error('network');return Response.json({order_id:'id',version:1});}return respond(p);};
 let c=createCloudClient({storage:s,fetcher,uuid:()=> 'stable'});await c.configure();await c.login('a','b');
 await assert.rejects(c.createRequest({customer_id:'first'}));assert.equal(s.data.size,1);
 c=createCloudClient({storage:s,fetcher,uuid:()=> 'new'});await c.configure();await c.login('a','b');fail=false;
 await c.createRequest({customer_id:'changed'});assert.deepEqual(commands[0],commands[1]);assert.equal(s.data.size,0);
});
test('expired session and missing provisioning fail closed',async()=>{
 let time=0;const c=createCloudClient({storage:storage(),now:()=>time,fetcher:async p=>respond(p)});await c.configure();await c.login('a','b');time=3600001;
 await assert.rejects(c.orders(),/Сеанс/);assert.equal(c.scope,undefined);
 const d=createCloudClient({storage:storage(),fetcher:async p=>p==='/api/session'?Response.json(null):respond(p)});await d.configure();await assert.rejects(d.login('a','b'),/не назначен/);assert.equal(d.scope,undefined);
});
test('failure to persist a pending command never sends it',async()=>{
 let sent=false;const c=createCloudClient({storage:{getItem:()=>null,setItem(){throw Error('storage');}},fetcher:async p=>{if(p==='/api/commands')sent=true;return respond(p);}});
 await c.configure();await c.login('a','b');await assert.rejects(c.createRequest({}));assert.equal(sent,false);
});
test('logout while authentication is pending cannot resurrect a session',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve;});
 const c=createCloudClient({storage:storage(),fetcher:async p=>p.includes('/token?')?pending:respond(p)});
 await c.configure();const login=c.login('a','b');await c.logout();release(respond('/token?'));
 await assert.rejects(login,/Сеанс изменился/);assert.equal(c.scope,undefined);
});
test('pagination forwards opaque cursor and returns the continuation header',async()=>{
 let requested;const c=createCloudClient({storage:storage(),fetcher:async p=>{
  if(p.startsWith('/api/orders')){requested=p;return Response.json([{id:'one'}],{headers:{'x-vision-next-cursor':'next'}});}return respond(p);
 }});await c.configure();await c.login('a','b');
 assert.deepEqual(await c.orders('previous'),{orders:[{id:'one'}],nextCursor:'next'});assert.ok(requested.endsWith('&cursor=previous'));
});
