import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {bookingActions,cleaningActions,createClient,prepareCommand} from '../ui/operations/client.mjs';
const permissions=['views.booking.manage','views.cleaning.execute','views.cleaning.verify'];
const scope={tenant:randomUUID(),organization:randomUUID()},record={id:randomUUID(),version:1};
test('unknown and prototype-named statuses never produce callable UI actions',()=>{
 for(const name of ['constructor','__proto__','toString','valueOf','unknown','']){
  assert.deepEqual(bookingActions(name,permissions),[]);
  assert.deepEqual(cleaningActions(name,permissions),[]);
 }
});
test('missing or malformed permissions fail closed',()=>{
 for(const invalid of [null,undefined,{},'views.booking.manage',42]){
  assert.deepEqual(bookingActions('PENDING',invalid),[]);
  assert.deepEqual(cleaningActions('INSPECTION',invalid),[]);
 }
});
test('nonstring statuses cannot invoke implicit coercion',()=>{
 const status={toString(){throw Error('must not coerce');}};
 assert.deepEqual(bookingActions(status,permissions),[]);
 assert.deepEqual(cleaningActions(status,permissions),[]);
});
test('invalid bearer tokens are rejected before transport',async()=>{
 let calls=0;const client=createClient({getScope:()=>scope,getToken:()=>'bad token',fetcher:async()=>{calls++;}});
 await assert.rejects(()=>client.send(prepareCommand('check_out',record,scope)),e=>e.code==='unauthorized'&&e.status===401);
 assert.equal(calls,0);
});
test('oversized streaming command response remains uncertain, not a success',async()=>{
 const client=createClient({getScope:()=>scope,getToken:()=>'synthetic.token',fetcher:async()=>new Response(' '.repeat(1048577),{headers:{'content-type':'application/json'}})});
 await assert.rejects(()=>client.send(prepareCommand('check_out',record,scope)),e=>e.code==='invalid_response'&&e.uncertain);
});
