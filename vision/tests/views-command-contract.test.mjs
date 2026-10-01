import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateViewsCommand,viewsCommandTypes} from '../modules/views/command-contract.mjs';

const tenant='11111111-1111-4111-8111-111111111111';
const org='22222222-2222-4222-8222-222222222222';
const unit='33333333-3333-4333-8333-333333333333';
const customer='44444444-4444-4444-8444-444444444444';
const booking='55555555-5555-4555-8555-555555555555';
const cleaning='66666666-6666-4666-8666-666666666666';
const base={tenant_id:tenant,idempotency_key:'req-123'};

test('Views command registry contains exactly the reviewed v1 command surface',()=>{
  assert.deepEqual(viewsCommandTypes,[
    'create_booking','confirm_booking','check_in','check_out','cancel_booking',
    'cleaning_start','cleaning_submit','cleaning_verify'
  ]);
});

test('create booking validates identifiers, real dates and bounded money',()=>{
  const input={...base,type:'create_booking',organization_id:org,unit_id:unit,customer_id:customer,check_in:'2026-10-10',check_out:'2026-10-12',source:'direct',total:'1200.50',currency:'USD'};
  assert.deepEqual(validateViewsCommand(input),input);
  for(const patch of [
    {check_in:'2026-02-30'},
    {check_out:'2026-10-10'},
    {organization_id:'bad'},
    {source:'direct/../../x'},
    {currency:'usd'},
    {total:'NaN'},
    {total:-1},
    {total:0.001},
    {admin:true}
  ])assert.throws(()=>validateViewsCommand({...input,...patch}),/invalid_command/);
});

test('state-transition commands require exact positive integer version and exact id field',()=>{
  for(const type of ['confirm_booking','check_in','check_out','cancel_booking']){
    const input={...base,type,booking_id:booking,expected_version:2};
    assert.deepEqual(validateViewsCommand(input),input);
    assert.throws(()=>validateViewsCommand({...input,expected_version:0}),/invalid_command/);
    assert.throws(()=>validateViewsCommand({...input,expected_version:1.5}),/invalid_command/);
    assert.throws(()=>validateViewsCommand({...input,cleaning_job_id:cleaning}),/invalid_command/);
  }
  for(const type of ['cleaning_start','cleaning_submit','cleaning_verify']){
    const input={...base,type,cleaning_job_id:cleaning,expected_version:3};
    assert.deepEqual(validateViewsCommand(input),input);
    assert.throws(()=>validateViewsCommand({...input,booking_id:booking}),/invalid_command/);
  }
});

test('unknown commands, missing fields and unsafe idempotency keys fail closed',()=>{
  assert.throws(()=>validateViewsCommand(null),/invalid_command/);
  assert.throws(()=>validateViewsCommand({...base,type:'refund_everything'}),/invalid_command/);
  assert.throws(()=>validateViewsCommand({...base,type:'check_in',booking_id:booking}),/invalid_command/);
  assert.throws(()=>validateViewsCommand({...base,type:'check_in',booking_id:booking,expected_version:1,idempotency_key:'x y'}),/invalid_command/);
});
