import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectNotificationFeed} from '../contracts/notification-feed.mjs';
import {validateNotificationCommand,projectNotificationCommandResponse} from '../contracts/notification-command.mjs';

const id='11111111-1111-4111-8111-111111111111';
const id2='22222222-2222-4222-8222-222222222222';
const corr='33333333-3333-4333-8333-333333333333';
const now='2026-10-01T02:00:00.000Z';

test('Notification feed projector allowlists inbox and escalation records',()=>{
  const body={
    generated_at:now,
    notifications:[{id,type:'notification',kind:'task',title:'Task assigned',body:null,severity:'INFO',status:'UNREAD',event_type:'order.assigned',entity_type:'task',entity_id:id2,correlation_id:corr,version:1,created_at:now,read_at:null,dismissed_at:null}],
    escalations:[{id:id2,type:'escalation',source_type:'TASK',source_id:id,rule_code:'TASK_SLA_BREACH',title:'Prepare unit',severity:'WARNING',status:'OPEN',assigned_user_id:id,correlation_id:corr,version:1,opened_at:now,acknowledged_at:null,resolved_at:null,severity_rank:1,can_ack:true}],
    counts:{unread:1,escalations:1}
  };
  const p=projectNotificationFeed(body);
  assert.equal(p.notifications[0].eventType,'order.assigned');
  assert.equal(p.escalations[0].canAck,true);
  assert.equal(p.counts.unread,1);
  assert.equal(Object.isFrozen(p),true);
  assert.throws(()=>projectNotificationFeed({...body,secret:'leak'}),/upstream_invalid_response/);
  assert.throws(()=>projectNotificationFeed({...body,escalations:[{...body.escalations[0],can_ack:'yes'}]}),/upstream_invalid_response/);
});

test('Notification command validator is exact, versioned and entity-scoped',()=>{
  assert.deepEqual(validateNotificationCommand({type:'notification_read',tenant_id:id,idempotency_key:'n-1',notification_id:id2,expected_version:1}),{
    type:'notification_read',tenant_id:id,idempotency_key:'n-1',expected_version:1,notification_id:id2
  });
  assert.deepEqual(validateNotificationCommand({type:'escalation_ack',tenant_id:id,idempotency_key:'e-1',escalation_id:id2,expected_version:2}),{
    type:'escalation_ack',tenant_id:id,idempotency_key:'e-1',expected_version:2,escalation_id:id2
  });
  assert.throws(()=>validateNotificationCommand({type:'notification_read',tenant_id:id,idempotency_key:'n',notification_id:id2,expected_version:1,admin:true}),/invalid_command/);
  assert.throws(()=>validateNotificationCommand({type:'escalation_ack',tenant_id:id,idempotency_key:'e',notification_id:id2,expected_version:1}),/invalid_command/);
});

test('Notification command response projector strips arbitrary upstream fields',()=>{
  const n=projectNotificationCommandResponse('notification_read',{entity_type:'notification',notification_id:id,status:'READ',version:2,correlation_id:corr});
  assert.equal(n.status,'READ');assert.equal(n.version,2);
  const e=projectNotificationCommandResponse('escalation_ack',{entity_type:'escalation',escalation_id:id2,status:'ACKNOWLEDGED',version:2,correlation_id:corr});
  assert.equal(e.entityType,'escalation');
  assert.throws(()=>projectNotificationCommandResponse('notification_read',{entity_type:'notification',notification_id:id,status:'READ',version:2,correlation_id:corr,email:'private@example.invalid'}),/upstream_invalid_response/);
});
