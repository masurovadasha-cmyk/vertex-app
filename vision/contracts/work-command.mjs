// VERTEX VISION Work command contract.
// Browser payloads are validated before they can reach PostgreSQL.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEM=/^[A-Za-z0-9._:-]{1,128}$/;
const taskTypes=new Set(['task_assign','task_accept','task_wait','task_resume','task_submit','quality_pass','quality_reject']);
const approvalTypes=new Set(['approval_approve','approval_reject']);
const allowedByType=Object.freeze({
  task_assign:new Set(['type','tenant_id','idempotency_key','task_id','expected_version','expected_order_version','assignee_user_id']),
  task_accept:new Set(['type','tenant_id','idempotency_key','task_id','expected_version','expected_order_version']),
  task_wait:new Set(['type','tenant_id','idempotency_key','task_id','expected_version','expected_order_version','reason']),
  task_resume:new Set(['type','tenant_id','idempotency_key','task_id','expected_version','expected_order_version']),
  task_submit:new Set(['type','tenant_id','idempotency_key','task_id','expected_version','expected_order_version']),
  quality_pass:new Set(['type','tenant_id','idempotency_key','task_id','expected_version','expected_order_version']),
  quality_reject:new Set(['type','tenant_id','idempotency_key','task_id','expected_version','expected_order_version','reason']),
  approval_approve:new Set(['type','tenant_id','idempotency_key','approval_id','expected_version','reason']),
  approval_reject:new Set(['type','tenant_id','idempotency_key','approval_id','expected_version','reason'])
});
const integer=value=>Number.isSafeInteger(value)&&value>0;
const reason=value=>typeof value==='string'&&value.trim().length>=1&&value.trim().length<=500;

export function validateWorkCommand(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid_command');
  const type=input.type,allowed=allowedByType[type];
  if(!allowed||Object.keys(input).some(key=>!allowed.has(key)))throw new Error('invalid_command');
  if(!UUID.test(input.tenant_id||'')||!IDEM.test(input.idempotency_key||'')||!integer(input.expected_version))throw new Error('invalid_command');
  const output={type,tenant_id:input.tenant_id,idempotency_key:input.idempotency_key,expected_version:input.expected_version};
  if(taskTypes.has(type)){
    if(!UUID.test(input.task_id||'')||!integer(input.expected_order_version))throw new Error('invalid_command');
    output.task_id=input.task_id;output.expected_order_version=input.expected_order_version;
    if(type==='task_assign'){
      if(!UUID.test(input.assignee_user_id||''))throw new Error('invalid_command');
      output.assignee_user_id=input.assignee_user_id;
    }
  }else if(approvalTypes.has(type)){
    if(!UUID.test(input.approval_id||''))throw new Error('invalid_command');
    output.approval_id=input.approval_id;
  }
  if(Object.hasOwn(input,'reason')){
    if(input.reason!=null&&!reason(input.reason))throw new Error('invalid_command');
    if(reason(input.reason))output.reason=input.reason.trim();
  }
  if(['task_wait','quality_reject','approval_reject'].includes(type)&&!reason(output.reason))throw new Error('invalid_command');
  return Object.freeze(output);
}

const STATUS=/^[A-Z][A-Z0-9_]{1,63}$/;
function id(value){if(typeof value!=='string'||!UUID.test(value))throw new Error('upstream_invalid_response');return value;}
function version(value){if(!integer(value))throw new Error('upstream_invalid_response');return value;}
export function projectWorkCommandResponse(type,body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('upstream_invalid_response');
  const correlation=id(body.correlation_id);
  if(taskTypes.has(type)){
    const allowed=new Set(['entity_type','task_id','task_status','task_version','order_id','order_status','order_version','correlation_id']);
    if(Object.keys(body).some(key=>!allowed.has(key))||body.entity_type!=='task'||!STATUS.test(body.task_status||'')||!STATUS.test(body.order_status||''))throw new Error('upstream_invalid_response');
    return Object.freeze({
      entityType:'task',taskId:id(body.task_id),taskStatus:body.task_status,taskVersion:version(body.task_version),
      orderId:id(body.order_id),orderStatus:body.order_status,orderVersion:version(body.order_version),correlationId:correlation
    });
  }
  if(approvalTypes.has(type)){
    const allowed=new Set(['entity_type','approval_id','approval_status','approval_version','correlation_id']);
    if(Object.keys(body).some(key=>!allowed.has(key))||body.entity_type!=='approval'||!STATUS.test(body.approval_status||''))throw new Error('upstream_invalid_response');
    return Object.freeze({
      entityType:'approval',approvalId:id(body.approval_id),approvalStatus:body.approval_status,
      approvalVersion:version(body.approval_version),correlationId:correlation
    });
  }
  throw new Error('upstream_invalid_response');
}

export const WORK_COMMAND_TYPES=Object.freeze([...taskTypes,...approvalTypes]);
