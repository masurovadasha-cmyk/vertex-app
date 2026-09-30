import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';

const id=()=>randomUUID();
const sqlCode=code=>e=>e.code===code;
async function fixture(db){
  const insert=async(table,fields,client=db)=>{
    const keys=Object.keys(fields);
    return client.query(`insert into public.vision_${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(fields));
  };
  const tenant=id(),org=id(),otherOrg=id(),customer=id(),manager=id(),reviewer=id(),executor2=id(),property=id();
  await insert('tenants',{id:tenant,code:id(),name:'Synthetic integrity tests'});
  for(const oid of [org,otherOrg])await insert('organizations',{id:oid,tenant_id:tenant,code:oid,name:'Synthetic organization',kind:'COMPANY'});
  await insert('customers',{id:customer,tenant_id:tenant,display_name:'Synthetic customer'});
  let managerMembership;
  for(const [user,permissions] of [[manager,['views.operations.read','views.booking.create','views.booking.manage','views.cleaning.execute','views.cleaning.verify']],[reviewer,['views.cleaning.verify']],[executor2,['views.cleaning.execute']]]){
    await insert('users',{id:user,tenant_id:tenant,display_name:'Synthetic operator'});
    const membership=id(),role=id();
    if(user===manager)managerMembership=membership;
    await insert('memberships',{id:membership,tenant_id:tenant,user_id:user,organization_id:org});
    await insert('roles',{id:role,tenant_id:tenant,code:role,name:'Synthetic role'});
    await insert('membership_roles',{tenant_id:tenant,membership_id:membership,role_id:role});
    for(const code of permissions)await db.query('insert into public.vision_role_permissions(role_id,permission_id) select $1,id from public.vision_permissions where code=$2',[role,code]);
  }
  await insert('module_installations',{tenant_id:tenant,organization_id:org,module_id:'views',state:'ENABLED'});
  await insert('views_properties',{id:property,tenant_id:tenant,organization_id:org,code:id(),name:'Synthetic property'});
  const unit=async()=> (await insert('views_units',{id:id(),tenant_id:tenant,organization_id:org,property_id:property,unit_number:id()})).rows[0].id;
  const as=async(user,work,client=db)=>{
    await client.query('begin');
    try{
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user})]);
      const result=await work(client);await client.query('commit');return result;
    }catch(e){await client.query('rollback');throw e;}
  };
  const command=(payload,user=manager,client=db)=>as(user,async c=>(await c.query('select public.vision_views_command($1::jsonb) result',[JSON.stringify(payload)])).rows[0].result,client);
  const create=(uid,extra={})=>({type:'create_booking',tenant_id:tenant,organization_id:org,idempotency_key:id(),unit_id:uid,customer_id:customer,check_in:'2026-10-10',check_out:'2026-10-13',total:'300.00',currency:'USD',...extra});
  const transition=(b,type)=>({type,tenant_id:tenant,idempotency_key:id(),booking_id:b.booking_id,expected_version:b.booking_version});
  const cleaning=(b,type)=>({type,tenant_id:tenant,idempotency_key:id(),cleaning_job_id:b.cleaning_job_id,expected_version:b.cleaning_version});
  const direct=(uid,extra={},client=db)=>insert('views_bookings',{id:id(),tenant_id:tenant,organization_id:org,unit_id:uid,customer_id:customer,public_no:id(),check_in:'2026-10-10',check_out:'2026-10-13',status:'CONFIRMED',created_by:manager,...extra},client);
  return {db,insert,tenant,org,otherOrg,customer,manager,reviewer,executor2,managerMembership,property,unit,as,command,create,transition,cleaning,direct};
}

async function makeDatabase(t){
  const input=process.env.VISION_TEST_DATABASE_URL;
  if(!input){const db=new PGlite();t.after(()=>db.close());return {db,native:false};}
  const url=new URL(input);
  assert.ok(['localhost','127.0.0.1','postgres'].includes(url.hostname),'Tests only accept a disposable local PostgreSQL service');
  assert.match(url.pathname,/^\/vision_test[a-zA-Z0-9_]*$/);
  const {default:pg}=await import('pg');
  const admin=new pg.Client({connectionString:input});await admin.connect();
  const name='vision_test_integrity_'+randomUUID().replaceAll('-','');
  await admin.query('create database '+name); // generated identifier; never an existing database
  url.pathname='/'+name;
  const db=new pg.Client({connectionString:url.toString()});await db.connect();db.exec=sql=>db.query(sql);
  t.after(async()=>{await db.end();await admin.query('drop database '+name+' with (force)');await admin.end();});
  return {db,native:true,client:async()=>{const c=new pg.Client({connectionString:url.toString()});await c.connect();return c;}};
}

test('Views next stage: booking integrity, SQL capability gates and independent quality',async t=>{
  const runtime=await makeDatabase(t),db=runtime.db;
  await db.exec("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;");
  await migrate(db);const f=await fixture(db);
  const count=async(table,where='true')=>(await db.query('select count(*)::int n from public.vision_'+table+' where '+where)).rows[0].n;
  await t.test('pending is not inventory; confirmation reserves exact half-open nights',async()=>{
    const u=await f.unit();let b=await f.command(f.create(u));
    assert.equal(await count('views_inventory_nights'),0);
    b=await f.command(f.transition(b,'confirm_booking'));
    const rows=(await db.query("select stay_date::text d from public.vision_views_inventory_nights where unit_id=$1 order by stay_date",[u])).rows;
    assert.deepEqual(rows.map(x=>x.d),['2026-10-10','2026-10-11','2026-10-12']);
    await assert.rejects(()=>f.direct(u),sqlCode('23505'));
    await f.direct(u,{check_in:'2026-10-13',check_out:'2026-10-14'});
  });
  await t.test('direct status update cannot bypass the inventory constraint',async()=>{
    const u=await f.unit();await f.direct(u);
    const b=await f.command(f.create(u));
    await assert.rejects(()=>db.query("update public.vision_views_bookings set status='CONFIRMED' where id=$1",[b.booking_id]),sqlCode('23505'));
    assert.equal((await db.query('select status from public.vision_views_bookings where id=$1',[b.booking_id])).rows[0].status,'PENDING');
  });
  await t.test('failed rebooking keeps the original inventory; cancellation releases it',async()=>{
    const u=await f.unit();let b=await f.command(f.create(u));b=await f.command(f.transition(b,'confirm_booking'));
    await f.direct(u,{check_in:'2026-10-13',check_out:'2026-10-16'});
    await assert.rejects(()=>db.query("update public.vision_views_bookings set check_out='2026-10-14' where id=$1",[b.booking_id]),sqlCode('23505'));
    assert.equal((await db.query('select count(*)::int n from public.vision_views_inventory_nights where booking_id=$1',[b.booking_id])).rows[0].n,3);
    b=await f.command(f.transition(b,'cancel_booking'));
    assert.equal((await db.query('select count(*)::int n from public.vision_views_inventory_nights where booking_id=$1',[b.booking_id])).rows[0].n,0);
    await f.direct(u);
  });
  await t.test('cross-organization property/unit and booking links are rejected',async()=>{
    await assert.rejects(()=>f.insert('views_units',{tenant_id:f.tenant,organization_id:f.otherOrg,property_id:f.property,unit_number:id()}),sqlCode('23503'));
    await assert.rejects(async()=>f.direct(await f.unit(),{organization_id:f.otherOrg}),sqlCode('23503'));
  });
  await t.test('finite dates, bounded ranges and finite amounts are required',async()=>{
    const u=await f.unit();
    for(const values of [{check_out:'infinity'},{check_out:'2040-01-01'},{check_in:'2026-10-13',check_out:'2026-10-13'},{total:'NaN'}])await assert.rejects(()=>f.direct(u,values));
  });
  await t.test('module installation and release state gate SQL commands and direct reads',async()=>{
    const u=await f.unit(),p=f.create(u);await f.command(p);
    await db.query("update public.vision_module_installations set state='REGISTERED' where tenant_id=$1",[f.tenant]);
    await assert.rejects(()=>f.command(p),/module_not_enabled/);
    assert.equal((await f.as(f.manager,c=>c.query('select id from public.vision_views_bookings'))).rows.length,0);
    await assert.rejects(()=>f.as(f.manager,c=>c.query('select vision_private.vision_views_command($1::jsonb)',[JSON.stringify(p)])),/permission denied/);
    await db.query("update public.vision_module_installations set state='ENABLED' where tenant_id=$1",[f.tenant]);
    await db.query("update public.vision_module_definitions set release_state='DISABLED' where id='views'");
    await assert.rejects(()=>f.command(p),/module_not_enabled/);
    await db.query("update public.vision_module_definitions set release_state='ACTIVE' where id='views'");
    await f.command(p);
  });
  await t.test('receipt replay respects revoked membership and never repeats the command',async()=>{
    const p=f.create(await f.unit());const first=await f.command(p),n=await count('views_bookings');
    assert.deepEqual(await f.command(p),first);assert.equal(await count('views_bookings'),n);
    await assert.rejects(()=>f.command({...p,total:100}),/idempotency_conflict/);
    await db.query("update public.vision_memberships set status='SUSPENDED' where id=$1",[f.managerMembership]);
    await assert.rejects(()=>f.command(p),/forbidden/);
    await db.query("update public.vision_memberships set status='ACTIVE' where id=$1",[f.managerMembership]);
  });
  await t.test('checkout event failure rolls back stay, inventory, unit, cleaning and receipt',async()=>{
    const u=await f.unit();let b=await f.command(f.create(u));b=await f.command(f.transition(b,'confirm_booking'));b=await f.command(f.transition(b,'check_in'));
    const p=f.transition(b,'check_out'),before=await count('views_cleaning_jobs');
    await db.exec("create function public.fail_checkout_test() returns trigger language plpgsql as $$ begin if NEW.event_type='views.cleaning.required' then raise exception 'injected_outbox_failure'; end if; return NEW; end $$; create trigger fail_checkout_test before insert on public.vision_outbox_events for each row execute function public.fail_checkout_test();");
    await assert.rejects(()=>f.command(p),/injected_outbox_failure/);
    assert.equal((await db.query('select status from public.vision_views_bookings where id=$1',[b.booking_id])).rows[0].status,'CHECKED_IN');
    assert.equal((await db.query('select status from public.vision_views_units where id=$1',[u])).rows[0].status,'OCCUPIED');
    assert.equal(await count('views_cleaning_jobs'),before);
    assert.equal((await db.query('select count(*)::int n from public.vision_views_inventory_nights where booking_id=$1',[b.booking_id])).rows[0].n,3);
    await db.exec('drop trigger fail_checkout_test on public.vision_outbox_events; drop function public.fail_checkout_test();');
    const done=await f.command(p);assert.deepEqual(await f.command(p),done);assert.equal(await count('views_cleaning_jobs'),before+1);
  });
  await t.test('only the executor can submit; an independent reviewer cannot overwrite maintenance',async()=>{
    const u=await f.unit();let b=await f.command(f.create(u));
    for(const type of ['confirm_booking','check_in','check_out'])b=await f.command(f.transition(b,type));
    b=await f.command(f.cleaning(b,'cleaning_start'));
    await assert.rejects(()=>f.command(f.cleaning(b,'cleaning_submit'),f.executor2),/cleaning_not_executor/);
    b=await f.command(f.cleaning(b,'cleaning_submit'));
    await assert.rejects(()=>f.command(f.cleaning(b,'cleaning_verify')),/independent_quality_required/);
    await db.query("update public.vision_views_units set status='MAINTENANCE' where id=$1",[u]);
    await assert.rejects(()=>f.command(f.cleaning(b,'cleaning_verify'),f.reviewer),/unit_not_in_cleaning/);
    assert.equal((await db.query('select status from public.vision_views_units where id=$1',[u])).rows[0].status,'MAINTENANCE');
    await db.query("update public.vision_views_units set status='CLEANING' where id=$1",[u]);
    const p=f.cleaning(b,'cleaning_verify');b=await f.command(p,f.reviewer);
    assert.equal(b.cleaning_status,'VERIFIED');assert.deepEqual(await f.command(p,f.reviewer),b);
    const job=(await db.query('select started_by,submitted_by,verified_by from public.vision_views_cleaning_jobs where id=$1',[b.cleaning_job_id])).rows[0];
    assert.deepEqual(job,{started_by:f.manager,submitted_by:f.manager,verified_by:f.reviewer});
  });
  await t.test('new inventory cannot be changed or read by unrelated identities',async()=>{
    await assert.rejects(()=>f.as(f.manager,c=>c.query('delete from public.vision_views_inventory_nights')),/permission denied/);
    assert.equal((await f.as(f.executor2,c=>c.query('select * from public.vision_views_inventory_nights'))).rows.length,0);
  });
  await t.test('PostgreSQL: simultaneous confirmations have one winner',{skip:!runtime.native},async()=>{
    const c1=await runtime.client(),c2=await runtime.client();
    try{
      const u=await f.unit(),a=await f.command(f.create(u)),b=await f.command(f.create(u));
      const r=await Promise.allSettled([f.command(f.transition(a,'confirm_booking'),f.manager,c1),f.command(f.transition(b,'confirm_booking'),f.manager,c2)]);
      assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
      assert.equal(r.find(x=>x.status==='rejected').reason.code,'23505');
    }finally{await c1.end();await c2.end();}
  });
  await t.test('PostgreSQL: simultaneous direct imports cannot bypass nightly uniqueness',{skip:!runtime.native},async()=>{
    const c1=await runtime.client(),c2=await runtime.client();
    try{
      const u=await f.unit();const r=await Promise.allSettled([f.direct(u,{},c1),f.direct(u,{},c2)]);
      assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.code,'23505');
      assert.equal((await db.query('select count(*)::int n from public.vision_views_bookings where unit_id=$1',[u])).rows[0].n,1);
    }finally{await c1.end();await c2.end();}
  });
  await t.test('PostgreSQL: simultaneous retries return one booking and one receipt',{skip:!runtime.native},async()=>{
    const c1=await runtime.client(),c2=await runtime.client();
    try{
      const p=f.create(await f.unit());const [a,b]=await Promise.all([f.command(p,f.manager,c1),f.command(p,f.manager,c2)]);
      assert.deepEqual(a,b);assert.equal((await db.query('select count(*)::int n from public.vision_command_receipts where tenant_id=$1 and idempotency_key=$2',[f.tenant,p.idempotency_key])).rows[0].n,1);
    }finally{await c1.end();await c2.end();}
  });
});

test('upgrade preflight refuses existing overlaps without deleting bookings or changing prior migrations',async t=>{
  const db=new PGlite();t.after(()=>db.close());await db.exec('create role anon;create role authenticated;');
  const dir=new URL('../database/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&n<'0008').sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  const f=await fixture(db),u=await f.unit();await f.direct(u);await f.direct(u);
  const sql=await readFile(new URL('0008_views_integrity.sql',dir),'utf8');
  await assert.rejects(()=>db.exec(sql),sqlCode('23505'));await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from public.vision_views_bookings')).rows[0].n,2);
  assert.equal((await db.query("select to_regclass('public.vision_views_inventory_nights') t")).rows[0].t,null);
});
