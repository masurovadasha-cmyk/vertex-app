import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveSessionEntries,assertRequestedEntry} from '../contracts/session-entry.mjs';

test('workspace entries are derived only from server context',()=>{
  assert.deepEqual(deriveSessionEntries({guestLinked:true,permissions:[]}),['guest']);
  assert.deepEqual(deriveSessionEntries({guestLinked:false,permissions:['views.operations.read']}),['hotel-staff']);
  assert.deepEqual(deriveSessionEntries({guestLinked:true,permissions:['vision.admin','vision.owner']}),['guest','admin','owner']);
});

test('client cannot self-assign privileged workspace',()=>{
  const available=deriveSessionEntries({guestLinked:false,permissions:['views.operations.read']});
  assert.equal(assertRequestedEntry(available,'hotel-staff'),'hotel-staff');
  for(const role of ['guest','admin','owner'])assert.throws(()=>assertRequestedEntry(available,role),/entry_forbidden/);
  for(const role of ['driver','partner','restaurant-staff','super-admin'])assert.throws(()=>assertRequestedEntry(available,role),/entry_forbidden/);
});

test('unknown permissions do not create browser capabilities',()=>{
  assert.deepEqual(deriveSessionEntries({guestLinked:false,permissions:['admin','role:owner','*','../../root']}),[]);
  assert.throws(()=>deriveSessionEntries({guestLinked:false,permissions:[42]}),/invalid_session_context/);
});
