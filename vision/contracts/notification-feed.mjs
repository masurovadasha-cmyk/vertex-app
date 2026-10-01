// VERTEX VISION Notifications / Escalations DTO projector.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const status=/^[A-Z][A-Z0-9_]{1,63}$/;
const severity=new Set(['INFO','SUCCESS','WARNING','CRITICAL']);
const sourceType=new Set(['TASK','APPROVAL','ORDER','CLEANING']);
const kind=/^[a-z][a-z0-9._-]{1,63}$/;
const eventType=/^[a-z][a-z0-9._-]{1,127}$/;
const entityType=/^[a-z][a-z0-9._-]{1,63}$/;
const rootKeys=new Set(['generated_at','notifications','escalations','counts']);
const notificationKeys=new Set(['id','type','kind','title','body','severity','status','event_type','entity_type','entity_id','correlation_id','version','created_at','read_at','dismissed_at']);
const escalationKeys=new Set(['id','type','source_type','source_id','rule_code','title','severity','status','assigned_user_id','correlation_id','version','opened_at','acknowledged_at','resolved_at','severity_rank']);
const countKeys=new Set(['unread','escalations']);

function exactKeys(value,allowed){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.has(key)))throw new Error('upstream_invalid_response');
}
function id(value,nullable=false){
  if(value==null&&nullable)return null;
  if(typeof value!=='string'||!UUID.test(value))throw new Error('upstream_invalid_response');
  return value;
}
function text(value,max,nullable=false){
  if(value==null&&nullable)return null;
  if(typeof value!=='string'||value.length<1||value.length>max)throw new Error('upstream_invalid_response');
  return value;
}
function instant(value,nullable=true){
  if(value==null&&nullable)return null;
  if(typeof value!=='string'||Number.isNaN(Date.parse(value)))throw new Error('upstream_invalid_response');
  return value;
}
function version(value){if(!Number.isSafeInteger(value)||value<1)throw new Error('upstream_invalid_response');return value;}

function projectNotification(item){
  exactKeys(item,notificationKeys);
  if(item.type!=='notification'||!kind.test(item.kind||'')||!severity.has(item.severity)||!status.test(item.status||'')||!eventType.test(item.event_type||''))throw new Error('upstream_invalid_response');
  return Object.freeze({
    id:id(item.id),type:'notification',kind:item.kind,title:text(item.title,240),body:text(item.body,1000,true),
    severity:item.severity,status:item.status,eventType:item.event_type,
    entityType:item.entity_type==null?null:(entityType.test(item.entity_type)?item.entity_type:(()=>{throw new Error('upstream_invalid_response');})()),
    entityId:id(item.entity_id,true),correlationId:id(item.correlation_id),version:version(item.version),
    createdAt:instant(item.created_at,false),readAt:instant(item.read_at,true),dismissedAt:instant(item.dismissed_at,true)
  });
}
function projectEscalation(item){
  exactKeys(item,escalationKeys);
  if(item.type!=='escalation'||!sourceType.has(item.source_type)||!status.test(item.status||'')||!['WARNING','CRITICAL'].includes(item.severity)||!status.test(item.rule_code||''))throw new Error('upstream_invalid_response');
  return Object.freeze({
    id:id(item.id),type:'escalation',sourceType:item.source_type,sourceId:id(item.source_id),ruleCode:item.rule_code,
    title:text(item.title,240),severity:item.severity,status:item.status,assignedUserId:id(item.assigned_user_id,true),
    correlationId:id(item.correlation_id),version:version(item.version),openedAt:instant(item.opened_at,false),
    acknowledgedAt:instant(item.acknowledged_at,true),resolvedAt:instant(item.resolved_at,true)
  });
}
export function projectNotificationFeed(body){
  exactKeys(body,rootKeys);
  if(!Array.isArray(body.notifications)||body.notifications.length>100||!Array.isArray(body.escalations)||body.escalations.length>100)throw new Error('upstream_invalid_response');
  const notifications=Object.freeze(body.notifications.map(projectNotification));
  const escalations=Object.freeze(body.escalations.map(projectEscalation));
  exactKeys(body.counts,countKeys);
  if(!Number.isSafeInteger(body.counts.unread)||body.counts.unread<0||!Number.isSafeInteger(body.counts.escalations)||body.counts.escalations<0||body.counts.escalations!==escalations.length)throw new Error('upstream_invalid_response');
  return Object.freeze({
    generatedAt:instant(body.generated_at,false),
    notifications,escalations,
    counts:Object.freeze({unread:body.counts.unread,escalations:body.counts.escalations})
  });
}
