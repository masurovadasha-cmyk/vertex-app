import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionState,sessionStatus,acceptRefresh,requireStepUp,markStepUp,logout} from '../contracts/session-lifecycle.mjs';
const actor='00000000-0000-4000-8000-000000000011';
const now=Date.parse('2026-10-01T20:00:00Z');
const iso=ms=>new Date(now+ms).toISOString();

test('session lifecycle expires and refreshes only forward',()=>{
  const current=createSessionState({actorId:actor,expiresAt:iso(30*60*1000),generation:1,entries:['hotel-staff']},now);
  assert.equal(sessionStatus(current,now),'active');
  assert.equal(sessionStatus(current,now+26*60*1000),'refresh-required');
  assert.equal(sessionStatus(current,now+31*60*1000),'expired');
  const next={actorId:actor,expiresAt:iso(50*60*1000),generation:2,entries:['hotel-staff']};
  assert.equal(acceptRefresh(current,next,now).generation,2);
  assert.throws(()=>acceptRefresh(current,{...next,generation:1},now),/stale_session/);
  assert.throws(()=>acceptRefresh(current,{...next,actorId:'other'},now),/stale_session/);
});

test('privileged workspace requires recent step-up while normal workspace does not',()=>{
  const session=createSessionState({actorId:actor,expiresAt:iso(30*60*1000),generation:1,entries:['hotel-staff','admin']},now);
  assert.equal(requireStepUp(session,'hotel-staff',now),false);
  assert.equal(requireStepUp(session,'admin',now),true);
  const verified=markStepUp(session,new Date(now).toISOString());
  assert.equal(requireStepUp(verified,'admin',now+5*60*1000),false);
  assert.equal(requireStepUp(verified,'admin',now+11*60*1000),true);
});

test('session state is bounded and logout wipes in-memory authority',()=>{
  assert.throws(()=>createSessionState({actorId:actor,expiresAt:iso(2*60*60*1000),generation:1,entries:[]},now),/invalid_session/);
  const session=createSessionState({actorId:actor,expiresAt:iso(30*60*1000),generation:1,entries:['guest','guest']},now);
  assert.deepEqual(session.entries,['guest']);
  assert.equal(logout(session),null);
});
