import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectViewsCommandResponse} from '../modules/views/response-contract.mjs';

const booking='11111111-1111-4111-8111-111111111111';
const unit='22222222-2222-4222-8222-222222222222';
const correlation='33333333-3333-4333-8333-333333333333';
const cleaning='44444444-4444-4444-8444-444444444444';
const base={booking_id:booking,unit_id:unit,correlation_id:correlation,booking_version:2};

test('Views command responses expose only allowlisted fields',()=>{
  const raw={...base,booking_status:'CONFIRMED',private_note:'never',jwt:'never'};
  const projected=projectViewsCommandResponse('confirm_booking',raw);
  assert.deepEqual(projected,{...base,booking_status:'CONFIRMED'});
  assert.equal(Object.hasOwn(projected,'private_note'),false);
  assert.equal(Object.hasOwn(projected,'jwt'),false);
  assert.equal(Object.isFrozen(projected),true);
});

test('checkout and cleaning responses require exact lifecycle states',()=>{
  const checkout=projectViewsCommandResponse('check_out',{
    ...base,booking_status:'CHECKED_OUT',cleaning_job_id:cleaning,cleaning_status:'REQUIRED',cleaning_version:1
  });
  assert.equal(checkout.cleaning_job_id,cleaning);
  assert.equal(projectViewsCommandResponse('cleaning_start',{...checkout,cleaning_status:'IN_PROGRESS',cleaning_version:2}).cleaning_status,'IN_PROGRESS');
  assert.equal(projectViewsCommandResponse('cleaning_submit',{...checkout,cleaning_status:'INSPECTION',cleaning_version:3}).cleaning_status,'INSPECTION');
  assert.equal(projectViewsCommandResponse('cleaning_verify',{...checkout,booking_status:'COMPLETED',booking_version:3,cleaning_status:'VERIFIED',cleaning_version:4}).booking_status,'COMPLETED');
});

test('unexpected status, missing correlation or cleaning fields fail closed',()=>{
  assert.throws(()=>projectViewsCommandResponse('confirm_booking',{...base,booking_status:'COMPLETED'}),/upstream_invalid_response/);
  assert.throws(()=>projectViewsCommandResponse('confirm_booking',{...base,booking_status:'CONFIRMED',correlation_id:null}),/upstream_invalid_response/);
  assert.throws(()=>projectViewsCommandResponse('check_out',{...base,booking_status:'CHECKED_OUT'}),/upstream_invalid_response/);
  assert.throws(()=>projectViewsCommandResponse('create_booking',{...base,booking_status:'PENDING',cleaning_job_id:cleaning}),/upstream_invalid_response/);
  assert.throws(()=>projectViewsCommandResponse('unknown',{...base,booking_status:'PENDING'}),/upstream_invalid_response/);
});
