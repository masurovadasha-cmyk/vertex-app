import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';

test('Views RC booking, stay, maintenance and read layers are tenant-safe',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated;');
  await migrate(db);

  const tenant=randomUUID(),org=randomUUID(),actor=randomUUID(),membership=randomUUID(),role=randomUUID(),outsider=randomUUID();
  await db.query("insert into public.vision_tenants(id,code,name) values($1,'views-rc-test','Views RC Test')",[tenant]);
  await db.query("insert into public.vision_organizations(id,tenant_id,code,name,kind) values($1,$2,'views','Views Hotel & Apartments','COMPANY')",[org,tenant]);
  for(const [id,name] of [[actor,'Synthetic Views manager'],[outsider,'Synthetic outsider']])
    await db.query("insert into public.vision_users(id,tenant_id,display_name) values($1,$2,$3)",[id,tenant,name]);
  await db.query("insert into public.vision_memberships(id,tenant_id,user_id,organization_id) values($1,$2,$3,$4)",[membership,tenant,actor,org]);
  await db.query("insert into public.vision_roles(id,tenant_id,code,name) values($1,$2,'views-rc-manager','Views RC manager')",[role,tenant]);
  await db.query("insert into public.vision_membership_roles(tenant_id,membership_id,role_id) values($1,$2,$3)",[tenant,membership,role]);
  await db.query("insert into public.vision_role_permissions(role_id,permission_id) select $1,id from public.vision_permissions where code like 'views.%'",[role]);

  const as=async(user,work)=>{
    await db.exec('begin; set local role authenticated;');
    try{
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user})]);
      const value=await work();
      await db.exec('commit');
      return value;
    }catch(e){await db.exec('rollback');throw e;}
  };
  const command=async(payload)=>{
    const full={tenant_id:tenant,organization_id:org,...payload};
    const result=await as(actor,()=>db.query('select public.vision_views_command($1::jsonb) as result',[JSON.stringify(full)]));
    return result.rows[0].result;
  };

  let unit,guest,booking,maintenance;

  await t.test('manager creates unit, guest and draft booking through the command boundary',async()=>{
    unit=await command({type:'unit.create',idempotency_key:'unit-235',code:'235',name:'Apartment 235',unit_type:'APARTMENT',max_guests:4});
    guest=await command({type:'guest.create',idempotency_key:'guest-1',display_name:'Synthetic Guest'});
    booking=await command({type:'booking.create',idempotency_key:'booking-1',unit_id:unit.unit_id,guest_id:guest.guest_id,arrival:'2026-10-10',departure:'2026-10-12',adults:2,children:0,currency:'USD',total_minor:150000,source:'DIRECT'});
    assert.equal(unit.status,'ACTIVE');
    assert.equal(guest.status,'ACTIVE');
    assert.equal(booking.status,'DRAFT');
    assert.equal(booking.version,1);
  });

  await t.test('idempotent retry replays exactly and changed payload conflicts',async()=>{
    const original={type:'unit.create',tenant_id:tenant,organization_id:org,idempotency_key:'unit-retry',code:'250',name:'Apartment 250'};
    const a=await as(actor,()=>db.query('select public.vision_views_command($1::jsonb) result',[JSON.stringify(original)]));
    const b=await as(actor,()=>db.query('select public.vision_views_command($1::jsonb) result',[JSON.stringify(original)]));
    assert.deepEqual(b.rows[0].result,a.rows[0].result);
    await assert.rejects(()=>as(actor,()=>db.query('select public.vision_views_command($1::jsonb)',[JSON.stringify({...original,name:'Changed'})])),/idempotency_conflict|duplicate/i);
  });

  await t.test('booking confirm exposes calendar and finance read layer',async()=>{
    booking=await command({type:'booking.confirm',idempotency_key:'booking-confirm',booking_id:booking.booking_id,expected_version:1});
    assert.equal(booking.status,'CONFIRMED');
    assert.equal(booking.version,2);
    const calendar=await as(actor,()=>db.query('select * from public.vision_views_calendar'));
    assert.equal(calendar.rows.length,1);
    assert.equal(calendar.rows[0].unit_code,'235');
    assert.equal(calendar.rows[0].guest_name,'Synthetic Guest');
    const finance=await as(actor,()=>db.query('select * from public.vision_views_finance_monthly'));
    assert.equal(finance.rows.length,1);
    assert.equal(String(finance.rows[0].booking_gross_minor),'150000');
    assert.equal(String(finance.rows[0].booking_count),'1');
  });

  await t.test('check-in uses optimistic versioning and outsider sees no operational rows',async()=>{
    await assert.rejects(()=>command({type:'stay.check_in',idempotency_key:'bad-version',booking_id:booking.booking_id,expected_version:1}),/version_conflict|could not serialize/i);
    booking=await command({type:'stay.check_in',idempotency_key:'check-in',booking_id:booking.booking_id,expected_version:2});
    assert.equal(booking.status,'CHECKED_IN');
    assert.equal(booking.version,3);
    const rows=await as(outsider,()=>db.query('select * from public.vision_views_bookings'));
    assert.equal(rows.rows.length,0);
  });

  await t.test('overlapping confirmed booking on the same unit is rejected',async()=>{
    const draft=await command({type:'booking.create',idempotency_key:'booking-overlap',unit_id:unit.unit_id,guest_id:guest.guest_id,arrival:'2026-10-11',departure:'2026-10-13',adults:1,currency:'USD',total_minor:50000});
    await assert.rejects(()=>command({type:'booking.confirm',idempotency_key:'booking-overlap-confirm',booking_id:draft.booking_id,expected_version:1}),/booking_overlap|duplicate/i);
  });

  await t.test('maintenance workflow is versioned and visible on dashboard',async()=>{
    maintenance=await command({type:'maintenance.create',idempotency_key:'m-create',unit_id:unit.unit_id,title:'Synthetic plumbing check',category:'PLUMBING',priority:'HIGH'});
    maintenance=await command({type:'maintenance.assign',idempotency_key:'m-assign',maintenance_id:maintenance.maintenance_id,assignee_user_id:actor,expected_version:1});
    maintenance=await command({type:'maintenance.start',idempotency_key:'m-start',maintenance_id:maintenance.maintenance_id,expected_version:2});
    const dashboard=await as(actor,()=>db.query('select * from public.vision_views_dashboard'));
    assert.equal(dashboard.rows.length,1);
    assert.equal(String(dashboard.rows[0].open_maintenance),'1');
    maintenance=await command({type:'maintenance.complete',idempotency_key:'m-complete',maintenance_id:maintenance.maintenance_id,expected_version:3});
    assert.equal(maintenance.status,'COMPLETED');
    assert.equal(maintenance.version,4);
  });

  await t.test('check-out writes immutable booking history',async()=>{
    booking=await command({type:'stay.check_out',idempotency_key:'check-out',booking_id:booking.booking_id,expected_version:3});
    assert.equal(booking.status,'CHECKED_OUT');
    assert.equal(booking.version,4);
    const history=await as(actor,()=>db.query('select * from public.vision_views_booking_history where booking_id=$1 order by created_at,id',[booking.booking_id]));
    assert.deepEqual(history.rows.map(x=>x.to_status),['DRAFT','CONFIRMED','CHECKED_IN','CHECKED_OUT']);
    await assert.rejects(()=>db.query("update public.vision_views_booking_history set to_status='CANCELLED' where booking_id=$1",[booking.booking_id]),/immutable_record|permission denied/i);
  });
});
