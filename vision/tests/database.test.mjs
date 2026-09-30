import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {dispatchOutbox} from '../backend/outbox.mjs';
import {migrate,migrationLock} from '../backend/migrate.mjs';

test('PostgreSQL permissions, Golden Flow, rollback, retries and outbox', async t => {
  const url=process.env.VISION_TEST_DATABASE_URL;
  if (url && !new URL(url).pathname.startsWith('/vision_test')) throw new Error('Use an empty disposable vision_test database');
  const db=url?new pg.Client({connectionString:url}):new PGlite();
  if(url) await db.connect();
  const exec=sql=>url?db.query(sql):db.exec(sql);
  t.after(()=>url?db.end():db.close());
  const existing=await db.query("select tablename from pg_tables where schemaname='public'");
  assert.equal(existing.rows.length,0,'Never run this suite against an existing database');
  await exec('create role anon; create role authenticated;');
  await migrate(db);
  const id=()=>randomUUID();
  async function insert(table,fields) {
    const keys=Object.keys(fields);
    return db.query(`insert into public.vision_${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(fields));
  }
  const tenant=id(),otherTenant=id(),views=id(),cleaning=id(),otherOrg=id(),customer=id(),otherCustomer=id(),service=id();
  await insert('tenants',{id:tenant,code:'test-a',name:'Test A'});
  await insert('tenants',{id:otherTenant,code:'test-b',name:'Test B'});
  for(const [org,code,tid] of [[views,'views',tenant],[cleaning,'cleaning',tenant],[otherOrg,'other',otherTenant]])
    await insert('organizations',{id:org,tenant_id:tid,code,name:code,kind:'COMPANY'});
  for(const c of [customer,otherCustomer]) await insert('customers',{id:c,tenant_id:tenant,display_name:'Synthetic customer'});
  await insert('services',{id:service,tenant_id:tenant,code:'cleaning.guest',name:'Cleaning',provider_organization_id:cleaning});
  const guest=id(),guest2=id(),viewsManager=id(),dispatcher=id(),staff=id(),staff2=id(),quality=id(),auditor=id(),foreignUser=id();
  for(const u of [guest,guest2,viewsManager,dispatcher,staff,staff2,quality,auditor,foreignUser])
    await insert('users',{id:u,tenant_id:u===foreignUser?otherTenant:tenant,display_name:'Synthetic test user'});
  for(const [u,c] of [[guest,customer],[guest2,otherCustomer]]) await insert('guest_links',{tenant_id:tenant,user_id:u,customer_id:c,requester_organization_id:views});
  async function grant(u,org,permissions) {
    const membership=id(),role=id();
    await insert('memberships',{id:membership,tenant_id:tenant,user_id:u,organization_id:org});
    await insert('roles',{id:role,tenant_id:tenant,code:role,name:'Test role'});
    await insert('membership_roles',{tenant_id:tenant,membership_id:membership,role_id:role});
    for(const code of permissions) {
      await db.query('insert into public.vision_permissions(code) values($1) on conflict do nothing',[code]);
      await db.query('insert into public.vision_role_permissions(role_id,permission_id) select $1,id from public.vision_permissions where code=$2',[role,code]);
    }
  }
  await grant(viewsManager,views,['views.order.create','views.order.read']);
  await grant(dispatcher,cleaning,['cleaning.order.read','cleaning.order.assign']);
  for(const u of [staff,staff2]) await grant(u,cleaning,['cleaning.task.read_assigned','cleaning.task.update_assigned']);
  await grant(quality,cleaning,['cleaning.quality.review']);
  await grant(auditor,cleaning,['audit.read']);
  async function as(u,fn,client=db) {
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(u?{sub:u}:{})]);
      const r=await fn(client);await client.query('commit');return r;
    } catch(e) { await client.query('rollback');throw e; }
  }
  const command=(u,c,client=db)=>as(u,async d=>(await d.query('select public.vision_command($1::jsonb) result',[JSON.stringify(c)])).rows[0].result,client);
  const create=(key=id())=>({type:'create',tenant_id:tenant,idempotency_key:key,customer_id:customer,requester_organization_id:views,service_id:service});
  const denied=(f,pattern=/forbidden|permission denied/)=>assert.rejects(f,pattern);
  const counts=async()=> (await db.query(`select
    (select count(*)::int from public.vision_orders) orders,
    (select count(*)::int from public.vision_tasks) tasks,
    (select count(*)::int from public.vision_audit_events) audit,
    (select count(*)::int from public.vision_outbox_events) outbox,
    (select count(*)::int from public.vision_command_receipts) receipts`)).rows[0];
  let order,initial;
  await t.test('missing identity, cross-guest, cross-tenant, unauthorized organization deny',async()=>{
    await denied(()=>command(null,create()));
    await denied(()=>command(guest2,create()));
    await denied(()=>command(foreignUser,create()));
    await denied(()=>command(staff,create()));
    await denied(()=>command(viewsManager,{...create(),requester_organization_id:cleaning}));
    assert.deepEqual(await counts(),{orders:0,tasks:0,audit:0,outbox:0,receipts:0});
  });
  await t.test('create atomically emits history, task, audit, outbox and stable retry receipt',async()=>{
    initial=create();order=await command(guest,initial);
    assert.equal(order.status,'NEW');assert.equal(order.version,1);
    assert.deepEqual(await command(guest,initial),order);
    await denied(()=>command(guest,{...initial,service_id:id()}),/idempotency_conflict/);
    assert.deepEqual(await counts(),{orders:1,tasks:1,audit:1,outbox:1,receipts:1});
  });
  await t.test('RLS permits own guest and scoped staff, denies other tenants and guests',async()=>{
    for(const [user,n] of [[guest,1],[guest2,0],[foreignUser,0],[viewsManager,1],[dispatcher,1],[staff,0],[null,0]]) {
      const rows=await as(user,d=>d.query('select id from public.vision_orders'));
      assert.equal(rows.rows.length,n);
    }
    await denied(()=>as(guest,d=>d.query("update public.vision_orders set status='COMPLETED'")));
    await denied(()=>as(guest,d=>d.query("select vision_private.permitted($1,$2,'cleaning.order.assign',$3)",[tenant,cleaning,dispatcher])));
    for(const table of ['memberships','membership_roles','role_permissions','guest_links','outbox_events','command_receipts'])
      await denied(()=>as(guest,d=>d.query(`select * from public.vision_${table}`)));
    await exec('set role anon');
    try {await denied(()=>db.query('select public.vision_command($1)',[JSON.stringify(create())]));} finally {await exec('reset role');}
  });
  const step=(type,key=id(),version=order.version)=>({type,tenant_id:tenant,idempotency_key:key,order_id:order.order_id,expected_version:version});
  await t.test('assignment scoped to provider, optimistic conflict and assigned-only execution',async()=>{
    await denied(()=>command(viewsManager,{...step('assign'),assignee_user_id:staff}));
    await denied(()=>command(dispatcher,{...step('assign'),assignee_user_id:foreignUser}),/invalid_assignee/);
    const c={...step('assign'),assignee_user_id:staff};order=await command(dispatcher,c);
    assert.deepEqual(await command(dispatcher,c),order);
    await denied(()=>command(dispatcher,{...c,idempotency_key:id()}),/version_conflict/);
    assert.equal((await as(staff,d=>d.query('select * from public.vision_orders'))).rows.length,1);
    await denied(()=>command(staff2,step('start')));
    await denied(()=>command(staff,step('submit')),/invalid_transition/);
    order=await command(staff,step('start'));assert.equal(order.status,'IN_PROGRESS');
    order=await command(staff,step('submit'));assert.equal(order.status,'QUALITY');
  });
  await t.test('quality requires a different actor, rework and final pass preserve correlation',async()=>{
    // Even a staff user also granted quality permission cannot approve their own work.
    await grant(staff,views,['cleaning.quality.review']);
    const staffMembership=(await db.query('select id from public.vision_memberships where user_id=$1 and organization_id=$2',[staff,cleaning])).rows[0].id;
    await db.query(`insert into public.vision_role_permissions(role_id,permission_id)
      select mr.role_id,p.id from public.vision_membership_roles mr cross join public.vision_permissions p where mr.membership_id=$1 and p.code='cleaning.quality.review'`,[staffMembership]);
    await denied(()=>command(staff,step('pass')));
    order=await command(quality,step('reject'));assert.equal(order.status,'IN_PROGRESS');
    order=await command(staff,step('submit'));
    order=await command(quality,step('pass'));assert.equal(order.status,'COMPLETED');
    const events=(await db.query('select * from public.vision_outbox_events order by created_at')).rows;
    const contract=JSON.parse(await readFile(new URL('../contracts/events-v1.json',import.meta.url),'utf8'));
    for(const e of events) {
      assert.equal(e.correlation_id,order.correlation_id);
      for(const key of contract.events[e.event_type].required) assert.ok(e.payload[key]);
    }
    assert.equal((await as(auditor,d=>d.query('select * from public.vision_audit_events'))).rows.length,7);
    assert.equal((await as(guest,d=>d.query('select * from public.vision_audit_events'))).rows.length,0);
    await denied(()=>db.query("update public.vision_audit_events set action='tampered'"),/immutable_record/);
    await denied(()=>db.query('delete from public.vision_order_status_history'),/immutable_record/);
  });
  await t.test('revoked user cannot replay receipt',async()=>{
    await db.query("update public.vision_users set status='SUSPENDED' where id=$1",[guest]);
    await denied(()=>command(guest,initial));
    await db.query("update public.vision_users set status='ACTIVE' where id=$1",[guest]);
  });
  await t.test('all tables have RLS; suspended memberships and inactive organizations fail closed',async()=>{
    const unprotected=await db.query("select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and relname like 'vision_%' and not relrowsecurity");
    assert.equal(unprotected.rows.length,0);
    await db.query("update public.vision_memberships set status='SUSPENDED' where user_id=$1",[dispatcher]);
    assert.equal((await as(dispatcher,d=>d.query('select id from public.vision_orders'))).rows.length,0);
    await denied(()=>command(dispatcher,{...step('assign'),assignee_user_id:staff}));
    await db.query("update public.vision_memberships set status='ACTIVE' where user_id=$1",[dispatcher]);
    await db.query("update public.vision_organizations set status='INACTIVE' where id=$1",[views]);
    await denied(()=>command(guest,initial));
    await denied(()=>command(viewsManager,create()));
    await db.query("update public.vision_organizations set status='ACTIVE' where id=$1",[views]);
    await db.query('update public.vision_guest_links set active=false where user_id=$1',[guest]);
    await denied(()=>command(guest,initial));
    await db.query('update public.vision_guest_links set active=true where user_id=$1',[guest]);
  });
  await t.test('composite keys block cross-tenant privileged writes',async()=>{
    await assert.rejects(()=>insert('memberships',{tenant_id:tenant,user_id:foreignUser,organization_id:cleaning}),/foreign key/);
    await assert.rejects(()=>insert('organizations',{tenant_id:tenant,code:'bad-parent',name:'Bad',kind:'BRANCH',parent_id:otherOrg}),/foreign key/);
  });
  await t.test('failure writing outbox rolls the entire command back',async()=>{
    const before=await counts();
    await exec(`create function public.test_fail() returns trigger language plpgsql as $$ begin raise exception 'injected_failure'; end $$;
      create trigger test_fail before insert on public.vision_outbox_events for each row execute function public.test_fail();`);
    await denied(()=>command(guest,create()),/injected_failure/);
    assert.deepEqual(await counts(),before);
    await exec('drop trigger test_fail on public.vision_outbox_events; drop function public.test_fail();');
    await command(guest,create());
  });
  await t.test('outbox leases expire, stale acknowledgments fail, published events do not replay',async()=>{
    await denied(()=>as(dispatcher,d=>d.query('select * from public.vision_outbox_claim(10)')));
    const first=(await db.query('select * from public.vision_outbox_claim(100)')).rows;
    assert.ok(first.length>0);
    assert.equal((await db.query('select * from public.vision_outbox_claim(100)')).rows.length,0);
    await db.query("update public.vision_outbox_events set lease_until=now()-interval '1 second' where id=$1",[first[0].id]);
    const retry=(await db.query('select * from public.vision_outbox_claim(100)')).rows[0];
    assert.equal(retry.attempts,2);assert.notEqual(retry.lease_token,first[0].lease_token);
    assert.equal((await db.query('select public.vision_outbox_ack($1,$2) ok',[retry.id,first[0].lease_token])).rows[0].ok,false);
    assert.equal((await db.query('select public.vision_outbox_ack($1,$2) ok',[retry.id,retry.lease_token])).rows[0].ok,true);
    assert.equal((await db.query('select public.vision_outbox_ack($1,$2) ok',[retry.id,retry.lease_token])).rows[0].ok,false);
  });
  await t.test('ordered delivery backs off, isolates poison events and bounds crash retries',async()=>{
    await db.query("update public.vision_outbox_events set lease_until=clock_timestamp()-interval '1 second' where published_at is null");
    const drained=await dispatchOutbox({db,deliver:async()=>({accepted:true}),maxEvents:100});
    assert.ok(drained.acknowledged>0);
    const x=await command(guest,create());
    await command(dispatcher,{type:'assign',tenant_id:tenant,idempotency_key:id(),order_id:x.order_id,expected_version:1,assignee_user_id:staff});
    await command(staff,{type:'start',tenant_id:tenant,idempotency_key:id(),order_id:x.order_id,expected_version:2});
    const claim=async()=> (await db.query('select * from public.vision_outbox_claim(100)')).rows;
    const first=await claim();assert.equal(first.length,1);assert.equal(Number(first[0].aggregate_version),1);
    assert.equal((await claim()).length,0,'successors cannot bypass an active lease');
    await denied(()=>as(guest,d=>d.query("select public.vision_outbox_nack($1,$2,'permanent')",[first[0].id,first[0].lease_token])));
    await assert.rejects(()=>db.query('select * from public.vision_outbox_claim(0)'),/invalid_batch_size/);
    await assert.rejects(()=>db.query("select public.vision_outbox_nack($1,$2,'private error text')",[first[0].id,first[0].lease_token]),/invalid_failure_code/);
    assert.equal((await db.query("select public.vision_outbox_nack($1,$2,'transient') ok",[first[0].id,first[0].lease_token])).rows[0].ok,true);
    assert.equal((await claim()).length,0,'backoff blocks successors too');
    const y=await command(guest,create());
    const independent=await claim();assert.equal(independent.length,1);assert.equal(independent[0].aggregate_id,y.order_id);
    await db.query('select public.vision_outbox_ack($1,$2)',[independent[0].id,independent[0].lease_token]);
    await db.query("update public.vision_outbox_events set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[first[0].id]);
    const retry=(await claim())[0];assert.equal(retry.id,first[0].id);assert.equal(retry.attempts,2);
    assert.equal((await db.query('select public.vision_outbox_ack($1,$2) ok',[retry.id,first[0].lease_token])).rows[0].ok,false);
    await db.query('select public.vision_outbox_ack($1,$2)',[retry.id,retry.lease_token]);
    const second=(await claim())[0];assert.equal(Number(second.aggregate_version),2);
    await db.query("select public.vision_outbox_nack($1,$2,'permanent')",[second.id,second.lease_token]);
    assert.equal((await claim()).length,0,'quarantined predecessor blocks later versions');
    const z=await command(guest,create());const crashed=(await claim())[0];assert.equal(crashed.aggregate_id,z.order_id);
    await db.query("update public.vision_outbox_events set attempts=8,lease_until=clock_timestamp()-interval '1 second' where id=$1",[crashed.id]);
    assert.equal((await claim()).length,0);
    const dead=(await db.query('select * from public.vision_outbox_events where id=$1',[crashed.id])).rows[0];
    assert.ok(dead.quarantined_at);assert.equal(dead.failure_code,'exhausted');assert.equal(dead.lease_token,null);
    assert.equal((await db.query('select public.vision_outbox_ack($1,$2) ok',[crashed.id,crashed.lease_token])).rows[0].ok,false);
  });
  await t.test('two PostgreSQL connections serialize retries and reject stale concurrent updates',{skip:!url},async()=>{
    const a=new pg.Client({connectionString:url}),b=new pg.Client({connectionString:url});
    await Promise.all([a.connect(),b.connect()]);
    try {
      await a.query('select pg_advisory_lock($1,$2)',migrationLock);
      try{await assert.rejects(()=>migrate(b),/migration_busy/);}
      finally{await a.query('select pg_advisory_unlock($1,$2)',migrationLock);}
      assert.deepEqual((await migrate(b)).applied,[]);
      const c=create();const before=await counts();
      const pair=await Promise.all([command(guest,c,a),command(guest,c,b)]);
      assert.deepEqual(pair[0],pair[1]);assert.equal((await counts()).orders,before.orders+1);
      const assign={type:'assign',tenant_id:tenant,order_id:pair[0].order_id,expected_version:1,assignee_user_id:staff};
      const races=await Promise.allSettled([command(dispatcher,{...assign,idempotency_key:id()},a),command(dispatcher,{...assign,idempotency_key:id()},b)]);
      assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
      assert.match(races.find(r=>r.status==='rejected').reason.message,/version_conflict/);
      // Two independent workers must not claim the same currently pending event.
      for(let i=0;i<4;i++)await command(guest,create());
      await db.query("update public.vision_outbox_events set lease_until=now()-interval '1 second' where published_at is null");
      const claims=await Promise.all([a.query('select * from public.vision_outbox_claim(2)'),b.query('select * from public.vision_outbox_claim(2)')]);
      const ids=claims.flatMap(r=>r.rows.map(e=>e.id));
      assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);
      // A locked head event must not make a second worker skip ahead to a
      // later version of that same order, even before the first claim commits.
      await db.query("update public.vision_outbox_events set lease_until=clock_timestamp()-interval '1 second' where published_at is null");
      await dispatchOutbox({db,deliver:async()=>({accepted:true}),maxEvents:100});
      const ordered=await command(guest,create());
      await command(dispatcher,{type:'assign',tenant_id:tenant,idempotency_key:id(),order_id:ordered.order_id,expected_version:1,assignee_user_id:staff});
      await a.query('begin');
      try{
        const head=(await a.query('select * from public.vision_outbox_claim(100)')).rows;
        assert.equal(head.length,1);assert.equal(head[0].aggregate_id,ordered.order_id);assert.equal(Number(head[0].aggregate_version),1);
        const concurrent=(await b.query('select * from public.vision_outbox_claim(100)')).rows;
        assert.equal(concurrent.length,0);
      }finally{await a.query('rollback');}
    } finally {await Promise.all([a.end(),b.end()]);}
  });
});
