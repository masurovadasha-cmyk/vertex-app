// Transport-independent, allowlisted read contract. No DB credentials or browser state.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const fields={
  bookings:['id','organization_id','unit_id','customer_id','public_no','source','check_in','check_out','status','currency','total','amount_paid','version','created_at'],
  units:['id','organization_id','property_id','unit_number','unit_type','status','version','created_at'],
  cleaning:['id','organization_id','unit_id','booking_id','status','version','started_by','submitted_by','created_at']
};
const tables={bookings:'vision_views_bookings',units:'vision_views_units',cleaning:'vision_views_cleaning_jobs'};
const fail=()=>{throw new Error('invalid_page_query');};
function validateCursor(value){
  if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||!timestamp.test(value[0])||!Number.isFinite(Date.parse(value[0]))||!uuid.test(value[1]))fail();
  return value;
}
export function readPlan(url){
  const resource=url.pathname.match(/^\/api\/v1\/views\/(bookings|units|cleaning)$/)?.[1];
  if(!resource)return null;
  const tenant=url.searchParams.get('tenant_id');
  if(!uuid.test(tenant||''))throw new Error('tenant_id_required');
  for(const name of ['tenant_id','limit','cursor'])if(url.searchParams.getAll(name).length>1)fail();
  const raw=url.searchParams.get('limit')??'50';
  if(!/^[1-9]\d{0,2}$/.test(raw)||Number(raw)>100)fail();
  const limit=Number(raw),encoded=url.searchParams.get('cursor');let cursor=null;
  if(encoded!==null){
    if(!/^[A-Za-z0-9_-]{1,384}$/.test(encoded))fail();
    try{cursor=validateCursor(JSON.parse(atob(encoded.replaceAll('-','+').replaceAll('_','/'))));}catch{fail();}
  }
  const select=fields[resource].join(',');
  const params=new URLSearchParams({tenant_id:'eq.'+tenant,select,limit:String(limit+1),order:'created_at.desc,id.desc'});
  if(cursor)params.set('or',`(created_at.lt.${cursor[0]},and(created_at.eq.${cursor[0]},id.lt.${cursor[1]}))`);
  return Object.freeze({resource,table:tables[resource],fields:Object.freeze([...fields[resource]]),tenant,limit,cursor,params});
}
export function readPage(body,plan){
  if(!Array.isArray(body)||body.length>plan.limit+1)throw new Error('upstream_invalid_response');
  const items=body.slice(0,plan.limit).map(row=>{
    try{validateCursor([row?.created_at,row?.id]);}catch{throw new Error('upstream_invalid_response');}
    const projected={};
    for(const field of plan.fields){
      if(!Object.hasOwn(row,field))continue;
      const value=row[field];
      if(value!==null&&!['string','number','boolean'].includes(typeof value))throw new Error('upstream_invalid_response');
      if(typeof value==='number'&&!Number.isFinite(value))throw new Error('upstream_invalid_response');
      projected[field]=value;
    }
    return projected;
  });
  let nextCursor=null;
  if(body.length>plan.limit){const last=items.at(-1);nextCursor=btoa(JSON.stringify([last.created_at,last.id])).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
  return {items,nextCursor};
}
