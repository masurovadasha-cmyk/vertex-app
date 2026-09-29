import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtomicStore} from './atomic-store.mjs';

test('failed writes roll back and do not poison the write queue',async()=>{
  let fail=true, disk;
  const store=createAtomicStore({initial:{rooms:[]},file:'unused',write:async(_file,json)=>{if(fail)throw Error('Disk unavailable');disk=JSON.parse(json);}});
  await assert.rejects(store.transact(draft=>draft.rooms.push({id:'failed'})),/Disk unavailable/);
  assert.deepEqual(store.read(),{rooms:[]});
  fail=false;
  await store.transact(draft=>draft.rooms.push({id:'saved'}));
  assert.deepEqual(store.read(),{rooms:[{id:'saved'}]});
  assert.deepEqual(disk,store.read());
});
test('concurrent mutations serialize without lost updates',async()=>{
  const store=createAtomicStore({initial:{value:0},file:'unused',write:async()=>{await new Promise(resolve=>setTimeout(resolve,1));}});
  await Promise.all(Array.from({length:20},()=>store.transact(draft=>{draft.value++;})));
  assert.equal(store.read().value,20);
});
test('readers never see uncommitted state',async()=>{
  let resume;
  const store=createAtomicStore({initial:{value:0},file:'unused',write:()=>new Promise(resolve=>{resume=resolve;})});
  const pending=store.transact(draft=>{draft.value=1;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.read().value,0);resume();await pending;assert.equal(store.read().value,1);
});
test('mutating a read result cannot mutate committed state',()=>{
  const store=createAtomicStore({initial:{rooms:[{id:'original'}]},file:'unused',write:async()=>{}});
  store.read().rooms[0].id='changed';assert.equal(store.read().rooms[0].id,'original');
});
test('validation failure does not persist or prevent the next operation',async()=>{
  let calls=0;
  const store=createAtomicStore({initial:{value:0},file:'unused',write:async()=>{calls++;}});
  await assert.rejects(store.transact(()=>{throw Error('Validation');}),/Validation/);
  assert.equal(calls,0);await store.transact(draft=>{draft.value=2;});assert.equal(calls,1);
});
