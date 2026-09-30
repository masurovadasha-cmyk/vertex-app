import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';

test('Views Operations booking, stay and cleaning vertical slice',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated;');
  await migrate(db);
  const id=()=>randomUUID();
  const insert=async(table,fields)=>{
    const keys=Object.keys(fields);
    return db.query(`insert into public.vision_${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(fields));
  };
  const tenant=id(),views=id(),customer=id(),otherCustomer=id(),manager=id(),reviewer=id(),guest=id(),guest2=id(),property=id(),unit=id();
  await insert('tenants',{id:tenant,code:'views-ops',name:'Views Ops Test'});
  await insert('organizations',{id:views,tenant_id:tenant,code:'views',name:'Views Hotel & Apartments',kind:'COMPANY'});
  for(const [cid,name] of [[customer,'Synthetic Guest A'],[otherCustomer,'Synthetic Guest B']])await insert('customers',{id:cid,tenant_id:tenant,display_name:name});
  for(const [uid,name] of [[manager,'Synthetic Views Manager'],[reviewer,'Synthetic Quality Reviewer'],[guest,'Synthetic Guest A'],[guest2,'Synthetic Guest B']])await insert('users',{id:uid,tenant_id:tenant,display_name:name});
  for(const [uid,cid] of [[guest,customer],[guest2,otherCustomer]])await insert('guest_links',{tenant_id:tenant,user_id:uid,customer_id:cid,requester_organization_id:views});

  const membership=id(),role=id();
  await insert('memberships',{id:membership,tenant_id:tenant,user_id:manager,organization_id:views});
  await insert('roles',{id:role,tenant_id:tenant,code:'views-ops-manager',name:'Views Ops Manager'});
  await insert('membership_roles',{tenant_id:tenant,membership_id:membership,role_id:role});
  for(const code of ['views.operations.read','views.booking.create','views.booking.manage','views.cleaning.execute','views.cleaning.verify']){
    await db.query('insert into public.vision_role_permissions(role_id,permission_id) select $1,id from public.vision_permissions where code=$2',[role,code]);
  }
  await insert('module_installations',{tenant_id:tenant,organization_id:views,module_id:'views',state:'ENABLED'});
  const reviewMembership=id(),reviewRole=id();
  await insert('memberships',{id:reviewMembership,tenant_id:tenant,user_id:reviewer,organization_id:views});
  await insert('roles',{id:reviewRole,tenant_id:tenant,code:'independent-reviewer',name:'Independent Reviewer'});
  await insert('membership_roles',{tenant_id:tenant,membership_id:reviewMembership,role_id:reviewRole});
  await db.query("insert into public.vision_role_permissions(role_id,permission_id) select $1,id from public.vision_permissions where code='views.cleaning.verify'",[reviewRole]);
  await insert('views_properties',{id:property,tenant_id:tenant,organization_id:views,code:'u-tower',name:'NRG U-Tower'});
  await insert('views_units',{id:unit,tenant_id:tenant,organization_id:views,property_id:property,unit_number:'TEST-235',unit_type:'apartment'});

  async function as(user,fn){
    await db.exec('begin');
    try{
      await db.exec('set local role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(user?{sub:user}:{})]);
      const value=await fn();await db.exec('commit');return value;
    }catch(e){await db.exec('rollback');throw e;}
  }
  const command=(user,payload)=>as(user,async()=>(
    await db.query('select public.vision_views_command($1::jsonb) result',[JSON.stringify(payload)])
  ).rows[0].result);
  const key=()=>randomUUID();
  const create=(from,to,idem=key(),cid=customer)=>({
    type:'create_booking',tenant_id:tenant,idempotency_key:idem,organization_id:views,
    unit_id:unit,customer_id:cid,check_in:from,check_out:to,source:'direct',total:1200,currency:'USD'
  });
  const denied=(fn,pattern=/forbidden|permission denied/)=>assert.rejects(fn,pattern);

  let booking,cleaning;
  await t.test('manager creates idempotent booking and RLS exposes it only to scoped manager/guest',async()=>{
    const payload=create('2026-10-10','2026-10-12');
    booking=await command(manager,payload);
    assert.equal(booking.booking_status,'PENDING');assert.equal(booking.booking_version,1);
    assert.deepEqual(await command(manager,payload),booking);
    await assert.rejects(()=>command(manager,{...payload,total:1300}),/idempotency_conflict/);
    assert.equal((await as(manager,()=>db.query('select * from public.vision_views_bookings'))).rows.length,1);
    assert.equal((await as(guest,()=>db.query('select * from public.vision_views_bookings'))).rows.length,1);
    assert.equal((await as(guest2,()=>db.query('select * from public.vision_views_bookings'))).rows.length,0);
    await denied(()=>as(guest,()=>db.query("update public.vision_views_bookings set status='COMPLETED'")));
    await denied(()=>command(guest,create('2026-11-01','2026-11-02')));
  });

  await t.test('confirmation blocks overlap but permits adjacent dates',async()=>{
    booking=await command(manager,{type:'confirm_booking',tenant_id:tenant,idempotency_key:key(),booking_id:booking.booking_id,expected_version:booking.booking_version});
    assert.equal(booking.booking_status,'CONFIRMED');

    const overlap=await command(manager,create('2026-10-11','2026-10-13'));
    await assert.rejects(()=>command(manager,{type:'confirm_booking',tenant_id:tenant,idempotency_key:key(),booking_id:overlap.booking_id,expected_version:overlap.booking_version}),/booking_conflict|duplicate/i);

    let adjacent=await command(manager,create('2026-10-12','2026-10-14'));
    adjacent=await command(manager,{type:'confirm_booking',tenant_id:tenant,idempotency_key:key(),booking_id:adjacent.booking_id,expected_version:adjacent.booking_version});
    assert.equal(adjacent.booking_status,'CONFIRMED');
  });

  await t.test('check-in and check-out update stay/unit atomically and create cleaning',async()=>{
    booking=await command(manager,{type:'check_in',tenant_id:tenant,idempotency_key:key(),booking_id:booking.booking_id,expected_version:booking.booking_version});
    assert.equal(booking.booking_status,'CHECKED_IN');
    assert.equal((await db.query('select status from public.vision_views_units where id=$1',[unit])).rows[0].status,'OCCUPIED');
    assert.equal((await db.query('select status from public.vision_views_stays where booking_id=$1',[booking.booking_id])).rows[0].status,'IN_HOUSE');

    booking=await command(manager,{type:'check_out',tenant_id:tenant,idempotency_key:key(),booking_id:booking.booking_id,expected_version:booking.booking_version});
    assert.equal(booking.booking_status,'CHECKED_OUT');
    assert.equal(booking.cleaning_status,'REQUIRED');
    cleaning={id:booking.cleaning_job_id,version:booking.cleaning_version};
    assert.equal((await db.query('select status from public.vision_views_units where id=$1',[unit])).rows[0].status,'CLEANING');
    const stay=(await db.query('select status,actual_check_in,actual_check_out from public.vision_views_stays where booking_id=$1',[booking.booking_id])).rows[0];
    assert.equal(stay.status,'COMPLETED');assert.ok(stay.actual_check_in);assert.ok(stay.actual_check_out);
    assert.equal((await db.query("select count(*)::int n from public.vision_outbox_events where event_type='views.cleaning.required'")).rows[0].n,1);
  });

  await t.test('cleaning lifecycle returns unit ready and completes booking',async()=>{
    let result=await command(manager,{type:'cleaning_start',tenant_id:tenant,idempotency_key:key(),cleaning_job_id:cleaning.id,expected_version:cleaning.version});
    assert.equal(result.cleaning_status,'IN_PROGRESS');
    result=await command(manager,{type:'cleaning_submit',tenant_id:tenant,idempotency_key:key(),cleaning_job_id:cleaning.id,expected_version:result.cleaning_version});
    assert.equal(result.cleaning_status,'INSPECTION');
    await denied(()=>command(manager,{type:'cleaning_verify',tenant_id:tenant,idempotency_key:key(),cleaning_job_id:cleaning.id,expected_version:result.cleaning_version}),/independent_quality_required/);
    result=await command(reviewer,{type:'cleaning_verify',tenant_id:tenant,idempotency_key:key(),cleaning_job_id:cleaning.id,expected_version:result.cleaning_version});
    assert.equal(result.cleaning_status,'VERIFIED');assert.equal(result.booking_status,'COMPLETED');
    assert.equal((await db.query('select status from public.vision_views_units where id=$1',[unit])).rows[0].status,'READY');
  });

  await t.test('all Views operational tables are RLS protected and audit/outbox are populated',async()=>{
    const unprotected=await db.query("select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and relname like 'vision_views_%' and not relrowsecurity");
    assert.deepEqual(unprotected.rows,[]);
    const audit=(await db.query("select action from public.vision_audit_events where action like 'views.%' order by created_at")).rows;
    assert.ok(audit.some(x=>x.action==='views.booking.created'));
    assert.ok(audit.some(x=>x.action==='views.booking.checked_out'));
    assert.ok(audit.some(x=>x.action==='views.cleaning.verified'));
    const events=(await db.query("select event_type from public.vision_outbox_events where event_type like 'views.%'")).rows.map(x=>x.event_type);
    assert.ok(events.includes('views.booking.confirmed'));assert.ok(events.includes('views.cleaning.required'));assert.ok(events.includes('views.cleaning.verified'));
  });
});
