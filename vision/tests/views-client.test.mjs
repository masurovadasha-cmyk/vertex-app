import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCommandClient} from '../modules/views/command-client.mjs';
const store=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const accepted=()=>Response.json({order_id:'11111111-1111-4111-8111-111111111111',version:1});
test('an ambiguous send retains the identical command across page reload, then clears on acknowledgment',async()=>{
  const storage=store(),bodies=[];
  const client=createCommandClient({storage,uuid:()=> 'stable-key',fetcher:async(_,o)=>{bodies.push(o.body);throw new Error('network_lost_after_commit');}});
  await assert.rejects(()=>client.submit({tenant_id:'tenant-a'}),/network_lost/);assert.equal(client.pending,true);
  const reloaded=createCommandClient({storage,uuid:()=> 'must-not-be-used',fetcher:async(_,o)=>{bodies.push(o.body);return accepted();}});
  await reloaded.submit({tenant_id:'changed-input'});assert.equal(bodies[0],bodies[1]);assert.equal(reloaded.pending,false);
});
test('double submission is prevented and persistence failure never sends a request',async()=>{
  let finish,calls=0;const client=createCommandClient({storage:store(),fetcher:async()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  const pending=client.submit({});await assert.rejects(()=>client.submit({}),/уже отправляется/);finish(accepted());await pending;assert.equal(calls,1);
  const blocked=createCommandClient({storage:{getItem:()=>null,setItem:()=>{throw new Error('storage_full');}},fetcher:async()=>{calls++;}});
  await assert.rejects(()=>blocked.submit({}),/storage_full/);assert.equal(calls,1);
});
test('uncertain server and malformed success responses keep the key, definitive denial clears it',async()=>{
  for(const status of [408,409,429,500,503]){
    const client=createCommandClient({storage:store(),fetcher:async()=>new Response('',{status})});await assert.rejects(()=>client.submit({}));assert.equal(client.pending,true);
  }
  const denied=createCommandClient({storage:store(),fetcher:async()=>new Response('',{status:403})});await assert.rejects(()=>denied.submit({}));assert.equal(denied.pending,false);
  const malformed=createCommandClient({storage:store(),fetcher:async()=>Response.json({})});await assert.rejects(()=>malformed.submit({}));assert.equal(malformed.pending,true);
});
