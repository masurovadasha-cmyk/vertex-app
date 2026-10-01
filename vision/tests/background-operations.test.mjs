import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOutboxEvent,
  drainNotificationOutbox,
  reconcileEscalationScopes,
  backgroundRuntimeStatus
} from '../runtime/background-operations.mjs';

const event={
  id:'11111111-1111-4111-8111-111111111111',
  tenant_id:'22222222-2222-4222-8222-222222222222',
  event_type:'task.completed',
  aggregate_type:'task',
  aggregate_id:'33333333-3333-4333-8333-333333333333',
  correlation_id:'44444444-4444-4444-8444-444444444444',
  lease_token:'99999999-9999-4999-8999-999999999999',
  payload_sha256:'a'.repeat(64),
  payload:{
    event_id:'11111111-1111-4111-8111-111111111111',
    tenant_id:'22222222-2222-4222-8222-222222222222',
    correlation_id:'44444444-4444-4444-8444-444444444444',
    organization_id:'55555555-5555-4555-8555-555555555555'
  }
};

test('background runtime validates canonical outbox envelope',()=>{
  const value=validateOutboxEvent(event);
  assert.equal(value.event_type,'task.completed');
  assert.throws(()=>validateOutboxEvent({...event,payload_sha256:'bad'}),/invalid_outbox_event/);
  assert.throws(()=>validateOutboxEvent({...event,payload:{...event.payload,event_id:'66666666-6666-4666-8666-666666666666'}}),/invalid_outbox_event/);
});

test('notification drain isolates failures and only acknowledges handled events',async()=>{
  const acked=[],failed=[];
  const second={...event,id:'77777777-7777-4777-8777-777777777777',payload:{...event.payload,event_id:'77777777-7777-4777-8777-777777777777'}};
  const result=await drainNotificationOutbox({
    claim:async()=>[event,second],
    consume:async value=>{ if(value.id===second.id) throw new Error('boom'); return {processed:true,duplicate:false}; },
    ack:async(id,token)=>{acked.push([id,token]);return true;},
    fail:async(id,token,reason)=>failed.push([id,token,reason])
  });
  assert.deepEqual(result,{claimed:2,processed:1,duplicates:0,failed:1});
  assert.deepEqual(acked,[[event.id,event.lease_token]]);
  assert.equal(failed[0][0],second.id);
  assert.equal(failed[0][1],second.lease_token);
});

test('duplicate notification delivery is acknowledged without double-processing count',async()=>{
  const acked=[];
  const result=await drainNotificationOutbox({
    claim:async()=>[event],
    consume:async()=>({processed:false,duplicate:true,status:'PROCESSED'}),
    ack:async(id,token)=>{acked.push([id,token]);return true;},
    fail:async()=>assert.fail('fail should not run')
  });
  assert.deepEqual(result,{claimed:1,processed:0,duplicates:1,failed:0});
  assert.deepEqual(acked,[[event.id,event.lease_token]]);
});

test('escalation reconciliation is tenant and organization scoped',async()=>{
  const calls=[];
  const result=await reconcileEscalationScopes({
    listScopes:async()=>[
      {tenant_id:event.tenant_id,organization_id:'55555555-5555-4555-8555-555555555555'},
      {tenant_id:'bad',organization_id:'55555555-5555-4555-8555-555555555555'}
    ],
    reconcile:async(...args)=>calls.push(args)
  });
  assert.deepEqual(result,{scopes:2,reconciled:1,failed:1});
  assert.deepEqual(calls,[[event.tenant_id,'55555555-5555-4555-8555-555555555555']]);
});

test('background runtime remains disconnected until staging transport is provisioned',()=>{
  assert.deepEqual(backgroundRuntimeStatus(),{
    version:'9.0',
    notificationConsumer:'prepared-not-connected',
    escalationScheduler:'prepared-not-connected',
    productionConnected:false
  });
});
