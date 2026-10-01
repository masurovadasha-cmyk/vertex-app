// VERTEX VISION / Views command contract v1.
// Transport validation only. PostgreSQL re-authorizes and re-validates all business state.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
const idem=/^[A-Za-z0-9._:-]{1,128}$/;
const source=/^[A-Za-z0-9_-]{1,32}$/;
const currency=/^[A-Z]{3}$/;
const decimal=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

const definitions=Object.freeze({
  create_booking:Object.freeze({
    required:Object.freeze(['type','tenant_id','idempotency_key','organization_id','unit_id','customer_id','check_in','check_out']),
    optional:Object.freeze(['source','total','currency'])
  }),
  confirm_booking:Object.freeze({required:Object.freeze(['type','tenant_id','idempotency_key','booking_id','expected_version']),optional:Object.freeze([])}),
  check_in:Object.freeze({required:Object.freeze(['type','tenant_id','idempotency_key','booking_id','expected_version']),optional:Object.freeze([])}),
  check_out:Object.freeze({required:Object.freeze(['type','tenant_id','idempotency_key','booking_id','expected_version']),optional:Object.freeze([])}),
  cancel_booking:Object.freeze({required:Object.freeze(['type','tenant_id','idempotency_key','booking_id','expected_version']),optional:Object.freeze([])}),
  cleaning_start:Object.freeze({required:Object.freeze(['type','tenant_id','idempotency_key','cleaning_job_id','expected_version']),optional:Object.freeze([])}),
  cleaning_submit:Object.freeze({required:Object.freeze(['type','tenant_id','idempotency_key','cleaning_job_id','expected_version']),optional:Object.freeze([])}),
  cleaning_verify:Object.freeze({required:Object.freeze(['type','tenant_id','idempotency_key','cleaning_job_id','expected_version']),optional:Object.freeze([])})
});

const invalid=()=>{throw new Error('invalid_command');};
const validDate=value=>{
  if(typeof value!=='string'||!date.test(value))return false;
  const [y,m,d]=value.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;
};
const validMoney=value=>{
  if(typeof value==='number')return Number.isFinite(value)&&value>=0&&value<=999999999999.99&&Math.round(value*100)===value*100;
  return typeof value==='string'&&decimal.test(value)&&Number(value)<=999999999999.99;
};

export function validateViewsCommand(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype)invalid();
  const type=input.type,definition=definitions[type];if(!definition)invalid();
  const allowed=new Set([...definition.required,...definition.optional]);
  const keys=Object.keys(input);
  if(keys.some(key=>!allowed.has(key))||definition.required.some(key=>!Object.hasOwn(input,key)))invalid();
  if(!uuid.test(input.tenant_id||'')||!idem.test(input.idempotency_key||''))invalid();

  if(type==='create_booking'){
    if(!uuid.test(input.organization_id||'')||!uuid.test(input.unit_id||'')||!uuid.test(input.customer_id||''))invalid();
    if(!validDate(input.check_in)||!validDate(input.check_out)||input.check_out<=input.check_in)invalid();
    if(Object.hasOwn(input,'source')&&(typeof input.source!=='string'||!source.test(input.source)))invalid();
    if(Object.hasOwn(input,'currency')&&(typeof input.currency!=='string'||!currency.test(input.currency)))invalid();
    if(Object.hasOwn(input,'total')&&!validMoney(input.total))invalid();
  }else{
    const idField=type.startsWith('cleaning_')?'cleaning_job_id':'booking_id';
    if(!uuid.test(input[idField]||'')||!Number.isSafeInteger(input.expected_version)||input.expected_version<1)invalid();
  }
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,input[key]])));
}

export const viewsCommandTypes=Object.freeze(Object.keys(definitions));
