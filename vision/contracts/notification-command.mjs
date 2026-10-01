// VERTEX VISION Notification / Escalation command contract.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEM=/^[A-Za-z0-9._:-]{1,128}$/;
const TYPES=new Set(['notification_read','notification_unread','notification_dismiss','escalation_ack']);
const allowed=new Set(['type','tenant_id','idempotency_key','notification_id','escalation_id','expected_version']);
const integer=v=>Number.isSafeInteger(v)&&v>0;

export function validateNotificationCommand(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))||!TYPES.has(input.type))throw new Error('invalid_command');
  if(!UUID.test(input.tenant_id||'')||!IDEM.test(input.idempotency_key||'')||!integer(input.expected_version))throw new Error('invalid_command');
  const out={type:input.type,tenant_id:input.tenant_id,idempotency_key:input.idempotency_key,expected_version:input.expected_version};
  if(input.type==='escalation_ack'){
    if(!UUID.test(input.escalation_id||'')||input.notification_id!=null)throw new Error('invalid_command');
    out.escalation_id=input.escalation_id;
  }else{
    if(!UUID.test(input.notification_id||'')||input.escalation_id!=null)throw new Error('invalid_command');
    out.notification_id=input.notification_id;
  }
  return Object.freeze(out);
}
export function projectNotificationCommandResponse(type,body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('upstream_invalid_response');
  const correlation=body.correlation_id;
  if(typeof correlation!=='string'||!UUID.test(correlation)||!integer(body.version)||typeof body.status!=='string')throw new Error('upstream_invalid_response');
  if(type==='escalation_ack'){
    const keys=new Set(['entity_type','escalation_id','status','version','correlation_id']);
    if(Object.keys(body).some(k=>!keys.has(k))||body.entity_type!=='escalation'||!UUID.test(body.escalation_id||''))throw new Error('upstream_invalid_response');
    return Object.freeze({entityType:'escalation',escalationId:body.escalation_id,status:body.status,version:body.version,correlationId:correlation});
  }
  const keys=new Set(['entity_type','notification_id','status','version','correlation_id']);
  if(Object.keys(body).some(k=>!keys.has(k))||body.entity_type!=='notification'||!UUID.test(body.notification_id||''))throw new Error('upstream_invalid_response');
  return Object.freeze({entityType:'notification',notificationId:body.notification_id,status:body.status,version:body.version,correlationId:correlation});
}
