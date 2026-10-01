import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkCommand,projectWorkCommandResponse,WORK_COMMAND_TYPES} from '../contracts/work-command.mjs';
import {projectWorkAssignees} from '../contracts/work-assignees.mjs';

const tenant='11111111-1111-4111-8111-111111111111';
const task='22222222-2222-4222-8222-222222222222';
const order='33333333-3333-4333-8333-333333333333';
const user='44444444-4444-4444-8444-444444444444';
const approval='55555555-5555-4555-8555-555555555555';
const corr='66666666-6666-4666-8666-666666666666';

test('Work command validator accepts only typed versioned task and approval commands',()=>{
  assert.ok(WORK_COMMAND_TYPES.includes('task_assign'));assert.ok(WORK_COMMAND_TYPES.includes('approval_reject'));
  assert.deepEqual(validateWorkCommand({type:'task_assign',tenant_id:tenant,idempotency_key:'a-1',task_id:task,expected_version:1,expected_order_version:2,assignee_user_id:user}),{
    type:'task_assign',tenant_id:tenant,idempotency_key:'a-1',expected_version:1,task_id:task,expected_order_version:2,assignee_user_id:user
  });
  assert.equal(validateWorkCommand({type:'approval_reject',tenant_id:tenant,idempotency_key:'a-2',approval_id:approval,expected_version:3,reason:'Budget mismatch'}).reason,'Budget mismatch');
  for(const bad of [
    {type:'task_assign',tenant_id:tenant,idempotency_key:'a',task_id:task,expected_version:1,expected_order_version:1},
    {type:'task_wait',tenant_id:tenant,idempotency_key:'a',task_id:task,expected_version:1,expected_order_version:1},
    {type:'approval_reject',tenant_id:tenant,idempotency_key:'a',approval_id:approval,expected_version:1},
    {type:'approval_approve',tenant_id:tenant,idempotency_key:'a',approval_id:approval,expected_version:1,admin:true}
  ])assert.throws(()=>validateWorkCommand(bad),/invalid_command/);
});

test('Work command response projector strips arbitrary data and enforces versions',()=>{
  const taskResponse=projectWorkCommandResponse('task_accept',{
    entity_type:'task',task_id:task,task_status:'IN_PROGRESS',task_version:2,
    order_id:order,order_status:'IN_PROGRESS',order_version:2,correlation_id:corr
  });
  assert.equal(taskResponse.taskVersion,2);assert.equal(taskResponse.correlationId,corr);
  const approvalResponse=projectWorkCommandResponse('approval_approve',{
    entity_type:'approval',approval_id:approval,approval_status:'APPROVED',approval_version:2,correlation_id:corr
  });
  assert.equal(approvalResponse.approvalStatus,'APPROVED');
  assert.throws(()=>projectWorkCommandResponse('approval_approve',{entity_type:'approval',approval_id:approval,approval_status:'APPROVED',approval_version:2,correlation_id:corr,secret:'x'}),/upstream_invalid_response/);
});

test('Assignee projector returns only unique id/displayName pairs',()=>{
  assert.deepEqual(projectWorkAssignees([{id:user,display_name:'Cleaner'}]),[{id:user,displayName:'Cleaner'}]);
  assert.throws(()=>projectWorkAssignees([{id:user,display_name:'Cleaner',email:'private@example.invalid'}]),/upstream_invalid_response/);
  assert.throws(()=>projectWorkAssignees([{id:user,display_name:'A'},{id:user,display_name:'B'}]),/upstream_invalid_response/);
});
