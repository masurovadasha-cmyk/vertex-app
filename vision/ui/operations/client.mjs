// Same-origin, memory-only client. No automatic retries of business commands.
export class OperationsError extends Error {
 constructor(code,status=0,uncertain=false){super(code);this.name='OperationsError';this.code=code;this.status=status;this.uncertain=uncertain;}
}
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function validateRange(from,to){if(!validDate(from)||!validDate(to)||to<=from||Date.parse(to)-Date.parse(from)>31*86400000)throw new OperationsError('invalid_date_range');}
export function bookingActions(status,permissions){if(!permissions.includes('views.booking.manage'))return [];return ({PENDING:['confirm_booking','cancel_booking'],CONFIRMED:['check_in','cancel_booking'],CHECKED_IN:['check_out']})[status]||[];}
export function cleaningActions(status,permissions){if(status==='INSPECTION')return permissions.includes('views.cleaning.verify')?['cleaning_verify']:[];if(!permissions.includes('views.cleaning.execute'))return [];return ({REQUIRED:['cleaning_start'],IN_PROGRESS:['cleaning_submit']})[status]||[];}
export function prepareCommand(type,record,scope,fields={},key=crypto.randomUUID()){
 if(!UUID.test(scope?.tenant)||!UUID.test(scope?.organization)||!UUID.test(key))throw new OperationsError('invalid_scope');
 const base={type,tenant_id:scope.tenant,organization_id:scope.organization,idempotency_key:key};
 if(type==='create_booking'){
  if(!UUID.test(fields.unit_id)||!UUID.test(fields.customer_id)||!validDate(fields.check_in)||!validDate(fields.check_out)||fields.check_out<=fields.check_in)throw new OperationsError('invalid_booking');
  const amount=String(fields.total??'0');if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)||!/^[A-Z]{3}$/.test(fields.currency??'USD'))throw new OperationsError('invalid_booking');
  return Object.freeze({...base,unit_id:fields.unit_id,customer_id:fields.customer_id,check_in:fields.check_in,check_out:fields.check_out,total:amount,currency:fields.currency??'USD',source:'direct'});
 }
 if(!['confirm_booking','cancel_booking','check_in','check_out','cleaning_start','cleaning_submit','cleaning_verify'].includes(type)||!UUID.test(record?.id)||!Number.isSafeInteger(record?.version)||record.version<1)throw new OperationsError('invalid_command');
 return Object.freeze({...base,[type.startsWith('cleaning_')?'cleaning_job_id':'booking_id']:record.id,expected_version:record.version});
}
export function validateSnapshot(data,scope){
 if(!data||data.contract!=='views-operations-ui/v1'||data.tenant_id!==scope.tenant||data.organization_id!==scope.organization||!Array.isArray(data.permissions)||data.permissions.some(p=>typeof p!=='string')||!Array.isArray(data.modules)||!data.modules.some(m=>m.id==='views'))throw new OperationsError('invalid_response');
 const ids=new Set();for(const m of data.modules){if(!/^[a-z][a-z0-9-]*$/.test(m.id)||ids.has(m.id)||typeof m.name!=='string'||!['ACTIVE','COMING_SOON','DISABLED'].includes(m.state)||m.id!=='views'&&m.state==='ACTIVE')throw new OperationsError('invalid_response');ids.add(m.id);}
 for(const name of ['units','bookings','cleaning']){
  const section=data[name];if(!section||typeof section.available!=='boolean'||!Array.isArray(section.items)||section.limit!==200||section.items.length>200||!Number.isSafeInteger(section.total)||section.total<section.items.length||section.truncated!==(section.total>200)||!section.available&&(section.total!==0||section.items.length!==0))throw new OperationsError('invalid_response');
  for(const item of section.items){if(!UUID.test(item.id)||!Number.isSafeInteger(item.version)||item.version<1||typeof item.status!=='string')throw new OperationsError('invalid_response');}
 }
 return data;
}
async function parse(response){
 if(!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type')||''))throw new OperationsError('invalid_response');
 if(Number(response.headers.get('content-length'))>1048576)throw new OperationsError('invalid_response');
 const reader=response.body?.getReader();if(!reader)throw new OperationsError('invalid_response');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw new OperationsError('invalid_response');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new OperationsError('invalid_response');}
}
export function createClient({getToken,getScope,fetcher=fetch,isOnline=()=>globalThis.navigator?.onLine!==false,timeoutMs=12000}){
 async function request(path,command,signal){
  const token=getToken();if(!token||!/^[A-Za-z0-9_.-]+$/.test(token)||token.length>8185)throw new OperationsError('unauthorized',401);
  if(!isOnline())throw new OperationsError('offline');
  const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(abort,timeoutMs);
  try{
   const response=await fetcher(path,{method:command?'POST':'GET',headers:{authorization:'Bearer '+token,accept:'application/json',...(command?{'content-type':'application/json'}:{})},...(command?{body:JSON.stringify(command)}:{}),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
   const data=await parse(response);
   if(!response.ok){const code=typeof data?.error==='string'&&/^[a-z_]{1,60}$/.test(data.error)?data.error:'request_failed';throw new OperationsError(code,response.status,!!command&&response.status>=500);}
   return data;
  }catch(error){if(error instanceof OperationsError){if(command&&error.code==='invalid_response')error.uncertain=true;throw error;}throw new OperationsError(controller.signal.aborted?'request_aborted':'network_error',0,!!command);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 return Object.freeze({
  async load({from,to,signal}={}){validateRange(from,to);const scope={...getScope()};if(!UUID.test(scope.tenant)||!UUID.test(scope.organization))throw new OperationsError('invalid_scope');const params=new URLSearchParams({tenant_id:scope.tenant,organization_id:scope.organization,from,to});return validateSnapshot(await request('/api/v1/views/operations?'+params,null,signal),scope);},
  async send(command){const scope=getScope();if(command.tenant_id!==scope.tenant||command.organization_id!==scope.organization)throw new OperationsError('session_changed');const data=await request('/api/v1/views/commands',command);if(!data||!UUID.test(data.booking_id)||!Number.isSafeInteger(data.booking_version)||data.booking_version<1)throw new OperationsError('invalid_response',0,true);return data;}
 });
}
