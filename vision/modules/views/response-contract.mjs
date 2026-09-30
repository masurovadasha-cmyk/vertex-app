// VERTEX VISION / Views command response contract v1.
// Prevents accidental database fields from crossing the API boundary.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bookingStatuses=new Set(['PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','COMPLETED','CANCELLED','NO_SHOW']);
const cleaningStatuses=new Set(['REQUIRED','IN_PROGRESS','INSPECTION','VERIFIED']);
const expected=Object.freeze({
  create_booking:Object.freeze({booking:'PENDING'}),
  confirm_booking:Object.freeze({booking:'CONFIRMED'}),
  check_in:Object.freeze({booking:'CHECKED_IN'}),
  check_out:Object.freeze({booking:'CHECKED_OUT',cleaning:'REQUIRED'}),
  cancel_booking:Object.freeze({booking:'CANCELLED'}),
  cleaning_start:Object.freeze({booking:'CHECKED_OUT',cleaning:'IN_PROGRESS'}),
  cleaning_submit:Object.freeze({booking:'CHECKED_OUT',cleaning:'INSPECTION'}),
  cleaning_verify:Object.freeze({booking:'COMPLETED',cleaning:'VERIFIED'})
});
const invalid=()=>{throw new Error('upstream_invalid_response');};
const version=value=>Number.isSafeInteger(value)&&value>=1;

export function projectViewsCommandResponse(type,body){
  const rule=expected[type];if(!rule||!body||typeof body!=='object'||Array.isArray(body))invalid();
  if(!uuid.test(body.booking_id||'')||!uuid.test(body.unit_id||'')||!uuid.test(body.correlation_id||''))invalid();
  if(!bookingStatuses.has(body.booking_status)||!version(body.booking_version)||body.booking_status!==rule.booking)invalid();

  const requiresCleaning=Object.hasOwn(rule,'cleaning');
  const cleaningPresent=['cleaning_job_id','cleaning_status','cleaning_version'].some(key=>Object.hasOwn(body,key));
  if(requiresCleaning){
    if(!uuid.test(body.cleaning_job_id||'')||!cleaningStatuses.has(body.cleaning_status)||!version(body.cleaning_version)||body.cleaning_status!==rule.cleaning)invalid();
  }else if(cleaningPresent)invalid();

  const result={
    booking_id:body.booking_id,
    booking_status:body.booking_status,
    booking_version:body.booking_version,
    unit_id:body.unit_id,
    correlation_id:body.correlation_id
  };
  if(requiresCleaning)Object.assign(result,{
    cleaning_job_id:body.cleaning_job_id,
    cleaning_status:body.cleaning_status,
    cleaning_version:body.cleaning_version
  });
  return Object.freeze(result);
}
