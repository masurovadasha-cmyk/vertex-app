// Delivery is an injected durable transport, not a browser endpoint. No external
// adapter is configured here. The dispatcher DB principal gets only claim/ack/nack.
export class PermanentDeliveryError extends Error {}

export async function dispatchOutbox({db,deliver,maxEvents=25,timeoutMs=10000}) {
  if(typeof deliver!=='function')throw new TypeError('A durable delivery adapter is required');
  if(!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>100)throw new RangeError('maxEvents must be 1..100');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>45000)throw new RangeError('timeoutMs must be 1..45000');
  const summary={claimed:0,acknowledged:0,deferred:0,lostLease:0};
  for(let i=0;i<maxEvents;i++){
    // Claim just before delivery so no event spends its lease waiting in a batch.
    const event=(await db.query('select * from public.vision_outbox_claim(1)')).rows[0];
    if(!event)break;
    summary.claimed++;
    const controller=new AbortController();let timer;let failure;
    try{
      const result=await Promise.race([
        Promise.resolve().then(()=>deliver({id:event.id,type:event.event_type,version:event.event_version,
          tenant_id:event.tenant_id,aggregate_type:event.aggregate_type,aggregate_id:event.aggregate_id,
          aggregate_version:event.aggregate_version,correlation_id:event.correlation_id,payload:event.payload},
          {signal:controller.signal,idempotencyKey:event.id})),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('delivery_timeout'));},timeoutMs);})
      ]);
      if(result?.accepted!==true)throw new Error('durable_acceptance_required');
    }catch(error){failure=error instanceof PermanentDeliveryError?'permanent':'transient';}
    finally{clearTimeout(timer);}
    // An ack failure is ambiguous: do not turn it into a delivery failure or
    // blindly retry the external call. Stop; lease recovery handles the event.
    const result=failure
      ?await db.query('select public.vision_outbox_nack($1,$2,$3) ok',[event.id,event.lease_token,failure])
      :await db.query('select public.vision_outbox_ack($1,$2) ok',[event.id,event.lease_token]);
    if(!result.rows[0].ok)summary.lostLease++;
    else if(failure)summary.deferred++;
    else summary.acknowledged++;
  }
  return summary;
}
