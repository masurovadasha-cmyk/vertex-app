// VERTEX VISION Unified Work Feed DTO projector.
// The backend must never forward arbitrary database JSON into the browser.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const source=/^[a-z][a-z0-9.-]{1,63}$/;
const status=/^[A-Z][A-Z0-9_]{1,63}$/;
const priority=new Set(['LOW','NORMAL','HIGH','CRITICAL']);
const reason=/^[A-Z][A-Z0-9_]{1,63}$/;
const kind=/^[a-z][a-z0-9_.-]{1,63}$/;
const type=new Set(['task','approval','request','attention']);

const rootKeys=new Set(['generated_at','tasks','approvals','attention','requests','counts']);
const countKeys=new Set(['tasks','approvals','attention','requests']);
const allowedItemKeys=new Set([
  'id','type','source','kind','title','status','priority','reason','due_at','assigned_to_me',
  'source_id','entity_type','entity_id','created_at','updated_at','priority_rank'
]);

function instant(value,nullable=true){
  if(value==null&&nullable)return null;
  if(typeof value!=='string'||Number.isNaN(Date.parse(value)))throw new Error('upstream_invalid_response');
  return value;
}
function text(value,max=240,nullable=false){
  if(value==null&&nullable)return null;
  if(typeof value!=='string'||value.length<1||value.length>max)throw new Error('upstream_invalid_response');
  return value;
}
function id(value,nullable=false){
  if(value==null&&nullable)return null;
  if(typeof value!=='string'||!uuid.test(value))throw new Error('upstream_invalid_response');
  return value;
}
function exactKeys(object,allowed){
  if(!object||typeof object!=='object'||Array.isArray(object))throw new Error('upstream_invalid_response');
  if(Object.keys(object).some(key=>!allowed.has(key)))throw new Error('upstream_invalid_response');
}
function projectItem(item,expected){
  exactKeys(item,allowedItemKeys);
  if(item.type!==expected||!type.has(item.type))throw new Error('upstream_invalid_response');
  const base={
    id:id(item.id),
    type:item.type,
    source:source.test(item.source||'')?item.source:(()=>{throw new Error('upstream_invalid_response');})(),
    title:text(item.title),
    status:status.test(item.status||'')?item.status:(()=>{throw new Error('upstream_invalid_response');})(),
    priority:priority.has(item.priority)?item.priority:(()=>{throw new Error('upstream_invalid_response');})(),
    dueAt:instant(item.due_at,true),
    assignedToMe:typeof item.assigned_to_me==='boolean'?item.assigned_to_me:null,
    sourceId:id(item.source_id,true),
    createdAt:instant(item.created_at,false),
    updatedAt:instant(item.updated_at,true)
  };
  if(expected==='approval'){
    base.kind=kind.test(item.kind||'')?item.kind:(()=>{throw new Error('upstream_invalid_response');})();
    base.entityType=text(item.entity_type,80,true);
    base.entityId=id(item.entity_id,true);
  }
  if(expected==='attention'){
    base.reason=reason.test(item.reason||'')?item.reason:(()=>{throw new Error('upstream_invalid_response');})();
  }
  return Object.freeze(base);
}
function projectList(value,expected){
  if(!Array.isArray(value)||value.length>100)throw new Error('upstream_invalid_response');
  return Object.freeze(value.map(item=>projectItem(item,expected)));
}

export function projectWorkFeed(body){
  exactKeys(body,rootKeys);
  const tasks=projectList(body.tasks,'task');
  const approvals=projectList(body.approvals,'approval');
  const attention=projectList(body.attention,'attention');
  const requests=projectList(body.requests,'request');
  exactKeys(body.counts,countKeys);
  const counts={};
  for(const key of countKeys){
    const value=body.counts[key];
    if(!Number.isSafeInteger(value)||value<0||value>100||value!==({tasks,approvals,attention,requests})[key].length)throw new Error('upstream_invalid_response');
    counts[key]=value;
  }
  return Object.freeze({
    generatedAt:instant(body.generated_at,false),
    tasks,approvals,attention,requests,
    counts:Object.freeze(counts)
  });
}
