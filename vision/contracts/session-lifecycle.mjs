const MAX_TTL_MS=60*60*1000;
const REFRESH_WINDOW_MS=5*60*1000;
const privileged=new Set(['admin','owner']);

export function createSessionState({actorId,expiresAt,generation=1,entries=[]},now=Date.now()){
  const expiry=Date.parse(expiresAt);
  if(typeof actorId!=='string'||!actorId||!Number.isFinite(expiry)||expiry<=now||expiry-now>MAX_TTL_MS||!Number.isInteger(generation)||generation<1||!Array.isArray(entries))throw new Error('invalid_session');
  return Object.freeze({actorId,expiresAt:new Date(expiry).toISOString(),generation,entries:Object.freeze([...new Set(entries)]),stepUpAt:null});
}
export function sessionStatus(session,now=Date.now()){
  if(!session)return 'signed-out';
  const remaining=Date.parse(session.expiresAt)-now;
  if(remaining<=0)return 'expired';
  if(remaining<=REFRESH_WINDOW_MS)return 'refresh-required';
  return 'active';
}
export function acceptRefresh(current,next,now=Date.now()){
  if(sessionStatus(current,now)==='expired'||!next||next.actorId!==current.actorId||next.generation<=current.generation)throw new Error('stale_session');
  return createSessionState(next,now);
}
export function requireStepUp(session,entry,now=Date.now(),maxAgeMs=10*60*1000){
  if(!privileged.has(entry))return false;
  if(!session?.stepUpAt)return true;
  const age=now-Date.parse(session.stepUpAt);
  return !Number.isFinite(age)||age<0||age>maxAgeMs;
}
export function markStepUp(session,at=new Date().toISOString()){
  if(!session||sessionStatus(session,Date.parse(at))==='expired')throw new Error('invalid_session');
  return Object.freeze({...session,stepUpAt:new Date(at).toISOString()});
}
export function logout(){return null;}
