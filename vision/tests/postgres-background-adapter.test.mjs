import test from 'node:test';
import assert from 'node:assert/strict';
import {payloadSha256,createPostgresBackgroundAdapter} from '../runtime/postgres-background-adapter.mjs';

test('payload hash is stable across object key order',()=>{
  assert.equal(payloadSha256({b:2,a:{d:4,c:3}}),payloadSha256({a:{c:3,d:4},b:2}));
  assert.match(payloadSha256({x:1}),/^[a-f0-9]{64}$/);
});

test('postgres adapter uses narrow background RPC surface',async()=>{
  const calls=[];
  const db={query:async(sql,args)=>{
    calls.push([sql,args]);
    if(sql.includes('vision_outbox_claim')) return {rows:[{
      id:'11111111-1111-4111-8111-111111111111',
      tenant_id:'22222222-2222-4222-8222-222222222222',
      event_type:'task.completed',
      aggregate_type:'task',
      aggregate_id:'33333333-3333-4333-8333-333333333333',
      correlation_id:'44444444-4444-4444-8444-444444444444',
      lease_token:'99999999-9999-4999-8999-999999999999',
      payload:{event_id:'11111111-1111-4111-8111-111111111111',tenant_id:'22222222-2222-4222-8222-222222222222',correlation_id:'44444444-4444-4444-8444-444444444444'}
    }]};
    if(sql.includes('vision_notification_consume')) return {rows:[{value:{processed:true,duplicate:false}}]};
    if(sql.includes('vision_outbox_ack')) return {rows:[{value:true}]};
    if(sql.includes('vision_outbox_fail')) return {rows:[{value:true}]};
    if(sql.includes('vision_background_scopes')) return {rows:[{tenant_id:'22222222-2222-4222-8222-222222222222',organization_id:'55555555-5555-4555-8555-555555555555'}]};
    if(sql.includes('vision_reconcile_escalations')) return {rows:[{value:{upserted:1,resolved:0}}]};
    throw new Error('unexpected sql');
  }};
  const adapter=createPostgresBackgroundAdapter(db);
  const claimed=await adapter.claim(25);
  assert.equal(claimed.length,1);
  assert.match(claimed[0].payload_sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(await adapter.consume(claimed[0]),{processed:true,duplicate:false});
  assert.equal(await adapter.ack(claimed[0].id,claimed[0].lease_token),true);
  assert.equal(await adapter.fail(claimed[0].id,claimed[0].lease_token),true);
  assert.equal((await adapter.listScopes(10)).length,1);
  assert.deepEqual(await adapter.reconcile('22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555'),{upserted:1,resolved:0});
  assert.ok(calls.every(([sql])=>/^select /.test(sql)));
});
