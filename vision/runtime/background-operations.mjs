// VERTEX VISION Background Operations Runtime — Interface System 9.0
// Pure orchestration layer. Transport/database credentials are injected by the staging worker.
// No browser token, service-role key, or production credential is accepted here.

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64=/^[a-f0-9]{64}$/i;

function requireFn(value,name){
  if(typeof value!=='function') throw new TypeError(name+'_required');
  return value;
}
function boundedInt(value,min,max,name){
  if(!Number.isSafeInteger(value)||value<min||value>max) throw new RangeError('invalid_'+name);
  return value;
}
export function validateOutboxEvent(event){
  if(!event||typeof event!=='object'||Array.isArray(event)) throw new TypeError('invalid_outbox_event');
  const required=['id','tenant_id','event_type','aggregate_type','aggregate_id','correlation_id','lease_token','payload_sha256','payload'];
  if(required.some(k=>!(k in event))) throw new TypeError('invalid_outbox_event');
  if(!UUID.test(event.id)||!UUID.test(event.tenant_id)||!UUID.test(event.aggregate_id)||!UUID.test(event.correlation_id)||!UUID.test(event.lease_token)) throw new TypeError('invalid_outbox_event');
  if(typeof event.event_type!=='string'||!event.event_type.match(/^[a-z][a-z0-9._-]{1,127}$/)) throw new TypeError('invalid_outbox_event');
  if(typeof event.aggregate_type!=='string'||!event.aggregate_type.match(/^[a-z][a-z0-9._-]{1,63}$/)) throw new TypeError('invalid_outbox_event');
  if(typeof event.payload_sha256!=='string'||!HEX64.test(event.payload_sha256)) throw new TypeError('invalid_outbox_event');
  if(!event.payload||typeof event.payload!=='object'||Array.isArray(event.payload)) throw new TypeError('invalid_outbox_event');
  if(event.payload.event_id!==event.id||event.payload.tenant_id!==event.tenant_id||event.payload.correlation_id!==event.correlation_id) throw new TypeError('invalid_outbox_event');
  return Object.freeze({...event,payload:Object.freeze({...event.payload})});
}

export async function drainNotificationOutbox(adapter,options={}){
  const claim=requireFn(adapter?.claim,'claim');
  const consume=requireFn(adapter?.consume,'consume');
  const ack=requireFn(adapter?.ack,'ack');
  const fail=requireFn(adapter?.fail,'fail');
  const limit=boundedInt(options.limit??25,1,100,'limit');
  const claimed=await claim(limit);
  if(!Array.isArray(claimed)) throw new TypeError('invalid_claim_result');

  let processed=0,duplicates=0,failed=0;
  for(const raw of claimed){
    let event;
    try{
      event=validateOutboxEvent(raw);
      const result=await consume(event);
      if(result?.duplicate===true) duplicates++;
      else processed++;
      const acknowledged=await ack(event.id,event.lease_token);
      if(acknowledged!==true) throw new Error('outbox_ack_rejected');
    }catch(error){
      failed++;
      const id=event?.id||raw?.id;
      const leaseToken=event?.lease_token||raw?.lease_token;
      if(UUID.test(id||'')&&UUID.test(leaseToken||'')) await fail(id,leaseToken,error instanceof Error?error.message:'consumer_failed');
    }
  }
  return Object.freeze({claimed:claimed.length,processed,duplicates,failed});
}

export async function reconcileEscalationScopes(adapter,options={}){
  const listScopes=requireFn(adapter?.listScopes,'listScopes');
  const reconcile=requireFn(adapter?.reconcile,'reconcile');
  const maxScopes=boundedInt(options.maxScopes??100,1,500,'max_scopes');
  const scopes=await listScopes(maxScopes);
  if(!Array.isArray(scopes)) throw new TypeError('invalid_scope_result');

  let reconciled=0,failed=0;
  for(const scope of scopes){
    if(!scope||!UUID.test(scope.tenant_id||'')||!UUID.test(scope.organization_id||'')){
      failed++; continue;
    }
    try{ await reconcile(scope.tenant_id,scope.organization_id); reconciled++; }
    catch{ failed++; }
  }
  return Object.freeze({scopes:scopes.length,reconciled,failed});
}

export function backgroundRuntimeStatus(){
  return Object.freeze({
    version:'9.0',
    notificationConsumer:'prepared-not-connected',
    escalationScheduler:'prepared-not-connected',
    productionConnected:false
  });
}
