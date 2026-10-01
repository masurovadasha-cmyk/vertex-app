import {createHash} from 'node:crypto';

function stable(value){
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
}
export function payloadSha256(payload){
  return createHash('sha256').update(stable(payload)).digest('hex');
}
function rows(result){
  if(!result||!Array.isArray(result.rows)) throw new TypeError('invalid_database_result');
  return result.rows;
}
export function createPostgresBackgroundAdapter(db){
  if(!db||typeof db.query!=='function') throw new TypeError('database_query_required');
  return Object.freeze({
    async claim(limit){
      const result=await db.query('select * from public.vision_outbox_claim($1)',[limit]);
      return rows(result).map(row=>({
        id:row.id,
        tenant_id:row.tenant_id,
        event_type:row.event_type,
        aggregate_type:row.aggregate_type,
        aggregate_id:row.aggregate_id,
        correlation_id:row.correlation_id,
        lease_token:row.lease_token,
        payload_sha256:payloadSha256(row.payload),
        payload:row.payload
      }));
    },
    async consume(event){
      const result=await db.query(
        'select public.vision_notification_consume($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as value',
        [event.tenant_id,event.id,event.event_type,event.aggregate_type,event.aggregate_id,event.correlation_id,event.payload_sha256,JSON.stringify(event.payload)]
      );
      return rows(result)[0]?.value;
    },
    async ack(id,leaseToken){
      const result=await db.query('select public.vision_outbox_ack($1,$2) as value',[id,leaseToken]);
      return rows(result)[0]?.value===true;
    },
    async fail(id,leaseToken){
      const result=await db.query('select public.vision_outbox_fail($1,$2) as value',[id,leaseToken]);
      return rows(result)[0]?.value===true;
    },
    async listScopes(limit){
      const result=await db.query('select * from public.vision_background_scopes($1)',[limit]);
      return rows(result).map(row=>({tenant_id:row.tenant_id,organization_id:row.organization_id}));
    },
    async reconcile(tenantId,organizationId){
      const result=await db.query('select public.vision_reconcile_escalations($1,$2) as value',[tenantId,organizationId]);
      return rows(result)[0]?.value;
    }
  });
}
