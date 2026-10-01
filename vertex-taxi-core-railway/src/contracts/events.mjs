export const EVENT_SCHEMA_VERSION=1;
export function domainEvent({type,aggregateType,aggregateId,aggregateVersion,organizationId,payload,correlationId,causationId=null,eventId,occurredAt}){
  if(!type||!aggregateType||!aggregateId||!organizationId||!eventId) throw new Error("event_identity_required");
  return Object.freeze({
    eventId,type,schemaVersion:EVENT_SCHEMA_VERSION,aggregateType,aggregateId,
    aggregateVersion,organizationId,correlationId,causationId,
    occurredAt:occurredAt||new Date().toISOString(),payload:Object.freeze({...payload})
  });
}
