import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startDev} from '../backend/dev.mjs';

test('loopback Views HTTP flow persists one checkout and requires a separate quality identity',async t=>{
 const app=await startDev({port:0});t.after(()=>app.close());
 const config=await (await fetch(app.url+'/api/profiles')).json();const d=config.demo;
 const command=async(payload,profile='views')=>{
  const r=await fetch(app.url+'/api/v1/views/commands',{method:'POST',headers:{'x-vision-profile':profile,'content-type':'application/json'},body:JSON.stringify(payload)});
  return {status:r.status,body:await r.json()};
 };
 const base=type=>({type,tenant_id:d.tenant_id,idempotency_key:randomUUID()});
 const create={...base('create_booking'),organization_id:d.views_id,unit_id:d.unit_id,customer_id:d.customer_id,check_in:'2026-10-10',check_out:'2026-10-12',total:200,currency:'USD'};
 assert.equal((await command(create,'guest')).status,403);
 let r=await command(create);assert.equal(r.status,200);let b=r.body;
 assert.deepEqual(await command(create),r);
 for(const type of ['confirm_booking','check_in','check_out']){
  const p={...base(type),booking_id:b.booking_id,expected_version:b.booking_version};
  r=await command(p);assert.equal(r.status,200);assert.deepEqual(await command(p),r);b=r.body;
 }
 assert.equal(b.booking_status,'CHECKED_OUT');assert.equal(b.cleaning_status,'REQUIRED');
 for(const type of ['cleaning_start','cleaning_submit']){
  r=await command({...base(type),cleaning_job_id:b.cleaning_job_id,expected_version:b.cleaning_version},'staff');assert.equal(r.status,200);b=r.body;
 }
 const verify={...base('cleaning_verify'),cleaning_job_id:b.cleaning_job_id,expected_version:b.cleaning_version};
 assert.equal((await command(verify)).status,403);
 r=await command(verify,'quality');assert.equal(r.status,200);assert.equal(r.body.booking_status,'COMPLETED');assert.deepEqual(await command(verify,'quality'),r);
 const denied=await fetch(app.url+'/api/v1/views/commands',{method:'POST',headers:{origin:'https://external.invalid','x-vision-profile':'views','content-type':'application/json'},body:JSON.stringify(create)});
 assert.equal(denied.status,403);
});
