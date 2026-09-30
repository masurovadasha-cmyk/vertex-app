import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchOutbox,PermanentDeliveryError} from '../backend/outbox.mjs';

const event={id:'event-1',lease_token:'lease-1',event_type:'order.created',event_version:1,tenant_id:'tenant-1',aggregate_type:'order',aggregate_id:'order-1',aggregate_version:1,correlation_id:'correlation-1',payload:{version:1}};
function database({ack=true,ackError=false}={}){
  const calls=[];let claimed=false;
  return {calls,query:async(sql,args)=>{
    calls.push({sql,args});
    if(sql.includes('claim')){const rows=claimed?[]:[event];claimed=true;return {rows};}
    if(ackError&&sql.includes('_ack'))throw new Error('connection_lost');
    return {rows:[{ok:ack}]};
  }};
}
test('dispatcher requires durable acceptance and passes a stable deduplication key without its lease',async()=>{
  const db=database();let received;
  const summary=await dispatchOutbox({db,deliver:async(envelope,options)=>{received={envelope,options};return {accepted:true};}});
  assert.equal(summary.acknowledged,1);assert.equal(received.options.idempotencyKey,event.id);
  assert.equal(received.envelope.tenant_id,event.tenant_id);assert.equal(received.envelope.lease_token,undefined);
  assert.ok(db.calls[1].sql.includes('_ack'));assert.deepEqual(db.calls[1].args,[event.id,event.lease_token]);
});
test('failed or absent acceptance is negatively acknowledged using bounded non-sensitive codes',async()=>{
  for(const [deliver,code] of [[async()=>undefined,'transient'],[async()=>{throw new Error('secret upstream detail');},'transient'],[async()=>{throw new PermanentDeliveryError('bad event');},'permanent']]){
    const db=database();const summary=await dispatchOutbox({db,deliver});
    assert.equal(summary.deferred,1);assert.ok(db.calls[1].sql.includes('_nack'));
    assert.equal(db.calls[1].args[2],code);assert.ok(!JSON.stringify(db.calls).includes('secret'));
  }
});
test('timeout aborts the adapter, records retry, and never acknowledges an unfinished delivery',async()=>{
  const db=database();let signal;
  const summary=await dispatchOutbox({db,timeoutMs:15,deliver:async(_,options)=>{signal=options.signal;return new Promise(()=>{});}});
  assert.equal(signal.aborted,true);assert.equal(summary.acknowledged,0);assert.equal(summary.deferred,1);
});
test('stale lease is reported; ambiguous ack failure stops without a second delivery or nack',async()=>{
  const db=database({ack:false});assert.equal((await dispatchOutbox({db,deliver:async()=>({accepted:true})})).lostLease,1);
  const failing=database({ackError:true});let deliveries=0;
  await assert.rejects(()=>dispatchOutbox({db:failing,deliver:async()=>{deliveries++;return {accepted:true};}}),/connection_lost/);
  assert.equal(deliveries,1);assert.equal(failing.calls.length,2);assert.ok(!failing.calls.some(c=>c.sql.includes('_nack')));
});
test('invalid runtime budgets fail before claiming events',async()=>{
  for(const config of [{maxEvents:0},{maxEvents:101},{timeoutMs:60000},{timeoutMs:0}]){
    const db=database();await assert.rejects(()=>dispatchOutbox({db,deliver:async()=>({accepted:true}),...config}),RangeError);assert.equal(db.calls.length,0);
  }
});
