export const MAX_LOCATION_ACCURACY_M=80;
export function validateLocation(input){
  if(!Number.isFinite(input.lat)||input.lat < -90||input.lat > 90) throw new Error("invalid_latitude");
  if(!Number.isFinite(input.lng)||input.lng < -180||input.lng > 180) throw new Error("invalid_longitude");
  if(!Number.isFinite(input.accuracyM)||input.accuracyM<=0) throw new Error("invalid_accuracy");
  if(input.accuracyM>MAX_LOCATION_ACCURACY_M) throw new Error("location_accuracy_too_low");
  return input;
}
export function isFresh(updatedAtMs,nowMs,ttlSeconds){
  return Number.isFinite(updatedAtMs)&&nowMs-updatedAtMs<=ttlSeconds*1000;
}
