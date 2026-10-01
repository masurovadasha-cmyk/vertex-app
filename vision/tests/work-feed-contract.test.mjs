import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectWorkFeed} from '../contracts/work-feed.mjs';

const id='11111111-1111-4111-8111-111111111111';
const now='2026-10-01T01:00:00.000Z';
const base={
  generated_at:now,
  tasks:[{id,type:'task',source:'core.task',title:'Prepare unit',status:'IN_PROGRESS',priority:'HIGH',due_at:now,assigned_to_me:true,source_id:id,created_at:now,updated_at:now,version:2,order_version:3,assigned_user_id:id,sla_state:'BREACHED',actions:['task_wait','task_submit']}],
  approvals:[{id,type:'approval',source:'vision.approval',kind:'maintenance.spend',title:'Approve repair',status:'PENDING',priority:'NORMAL',due_at:null,assigned_to_me:true,entity_type:'unit',entity_id:id,created_at:now,updated_at:now,version:1,order_version:null,assigned_user_id:id,requested_by:null,sla_state:'NONE',actions:['approval_approve','approval_reject']}],
  attention:[{id,type:'attention',source:'core.task',title:'Prepare unit',status:'IN_PROGRESS',priority:'HIGH',reason:'OVERDUE_TASK',due_at:now,assigned_to_me:null,source_id:id,created_at:now,updated_at:null,priority_rank:3}],
  requests:[{id,type:'request',source:'core.order',title:'Order VO-1',status:'NEW',priority:'NORMAL',due_at:null,assigned_to_me:null,source_id:id,created_at:now,updated_at:now}],
  counts:{tasks:1,approvals:1,attention:1,requests:1}
};

test('Unified Work Feed projector allowlists fields and converts timestamps/keys safely',()=>{
  const projected=projectWorkFeed(base);
  assert.equal(projected.tasks[0].assignedToMe,true);assert.equal(projected.tasks[0].slaState,'BREACHED');assert.deepEqual(projected.tasks[0].actions,['task_wait','task_submit']);
  assert.equal(projected.tasks[0].sourceId,id);
  assert.equal(projected.approvals[0].entityType,'unit');assert.deepEqual(projected.approvals[0].actions,['approval_approve','approval_reject']);
  assert.equal(projected.attention[0].reason,'OVERDUE_TASK');
  assert.equal(projected.counts.requests,1);
  assert.equal(Object.isFrozen(projected),true);
  assert.equal(Object.isFrozen(projected.tasks),true);
});

test('Unified Work Feed projector rejects unknown fields, count mismatches and malformed IDs',()=>{
  assert.throws(()=>projectWorkFeed({...base,secret:'leak'}),/upstream_invalid_response/);
  assert.throws(()=>projectWorkFeed({...base,counts:{...base.counts,tasks:9}}),/upstream_invalid_response/);
  assert.throws(()=>projectWorkFeed({...base,tasks:[{...base.tasks[0],id:'bad'}]}),/upstream_invalid_response/);
  assert.throws(()=>projectWorkFeed({...base,attention:[{...base.attention[0],reason:'../../root'}]}),/upstream_invalid_response/);
  assert.throws(()=>projectWorkFeed({...base,tasks:[{...base.tasks[0],actions:['delete_everything']}]}),/upstream_invalid_response/);
});
