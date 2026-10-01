import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';

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
  for(const file of (await readdir(new URL('../database/migrations/',import.meta.url))).sort())
    await exec(await readFile(new URL('../database/migrations/'+file,import.meta.url),'utf8'));
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
  const workCommand=(u,c,client=db)=>as(u,async d=>(await d.query('select public.vision_work_command($1::jsonb) result',[JSON.stringify(c)])).rows[0].result,client);
  const notificationCommand=(u,c,client=db)=>as(u,async d=>(await d.query('select public.vision_notification_command($1::jsonb) result',[JSON.stringify(c)])).rows[0].result,client);
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
  await t.test('Unified Work Feed obeys RLS and derives only real tasks, requests, approvals and attention',async()=>{
    const approval=id();
    await db.query(`insert into public.vision_approval_requests(
      id,tenant_id,organization_id,kind,title,status,priority,assigned_user_id,due_at,entity_type,entity_id
    ) values($1,$2,$3,'maintenance.spend','Approve synthetic repair','PENDING','HIGH',$4,now()-interval '1 hour','order',$5)`,
      [approval,tenant,views,viewsManager,order.order_id]);

    const managerFeed=(await as(viewsManager,d=>d.query(
      'select public.vision_work_feed($1,$2,50) feed',[tenant,views]
    ))).rows[0].feed;
    assert.equal(managerFeed.approvals.length,1);
    assert.equal(managerFeed.approvals[0].id,approval);
    assert.ok(managerFeed.requests.some(x=>x.source_id===order.order_id));
    assert.ok(managerFeed.attention.some(x=>x.reason==='OVERDUE_APPROVAL'&&x.id===approval));
    assert.equal(managerFeed.counts.approvals,managerFeed.approvals.length);

    const dispatcherFeed=(await as(dispatcher,d=>d.query(
      'select public.vision_work_feed($1,$2,50) feed',[tenant,cleaning]
    ))).rows[0].feed;
    assert.ok(dispatcherFeed.tasks.some(x=>x.source==='core.task'));
    assert.ok(dispatcherFeed.requests.some(x=>x.source_id===order.order_id));

    const guestFeed=(await as(guest,d=>d.query(
      'select public.vision_work_feed($1,$2,50) feed',[tenant,views]
    ))).rows[0].feed;
    assert.equal(guestFeed.approvals.length,0);
    assert.ok(guestFeed.requests.some(x=>x.source_id===order.order_id));

    await db.query("update public.vision_memberships set status='SUSPENDED' where user_id=$1 and organization_id=$2",[viewsManager,views]);
    const suspendedFeed=(await as(viewsManager,d=>d.query(
      'select public.vision_work_feed($1,$2,50) feed',[tenant,views]
    ))).rows[0].feed;
    assert.equal(suspendedFeed.approvals.length,0);
    assert.equal(suspendedFeed.requests.length,0);
    await db.query("update public.vision_memberships set status='ACTIVE' where user_id=$1 and organization_id=$2",[viewsManager,views]);

    await denied(()=>as(viewsManager,d=>d.query(
      `insert into public.vision_approval_requests(tenant_id,organization_id,kind,title,assigned_user_id)
       values($1,$2,'manual','forbidden',$3)`,[tenant,views,viewsManager]
    )),/permission denied|row-level security/);
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
    const events=(await db.query('select * from public.vision_outbox_events where correlation_id=$1 order by created_at',[order.correlation_id])).rows;
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
  await t.test('Work Actions enforce assignment, SLA, idempotency, approval SoD and audit',async()=>{
    const created=await command(guest,create());
    const task=(await db.query('select * from public.vision_tasks where order_id=$1',[created.order_id])).rows[0];
    await db.query("update public.vision_tasks set due_at=now()-interval '15 minutes' where id=$1",[task.id]);

    const dispatcherFeed=(await as(dispatcher,d=>d.query('select public.vision_work_feed($1,$2,50) feed',[tenant,cleaning]))).rows[0].feed;
    const candidate=dispatcherFeed.tasks.find(x=>x.id===task.id);
    assert.equal(candidate.sla_state,'BREACHED');
    assert.deepEqual(candidate.actions,['task_assign']);
    const assignees=(await as(dispatcher,d=>d.query('select public.vision_work_assignees($1,$2) list',[tenant,cleaning]))).rows[0].list;
    assert.ok(assignees.some(x=>x.id===staff));
    assert.deepEqual((await as(staff,d=>d.query('select public.vision_work_assignees($1,$2) list',[tenant,cleaning]))).rows[0].list,[]);

    let current=await workCommand(dispatcher,{type:'task_assign',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:1,expected_order_version:1,assignee_user_id:staff});
    assert.equal(current.task_status,'ASSIGNED');assert.equal(current.task_version,2);assert.equal(current.order_version,2);
    await denied(()=>workCommand(staff2,{type:'task_accept',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:2,expected_order_version:2}));

    const accept={type:'task_accept',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:2,expected_order_version:2};
    current=await workCommand(staff,accept);assert.equal(current.task_status,'IN_PROGRESS');
    const waiting=await workCommand(staff,{type:'task_wait',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:3,expected_order_version:3,reason:'Waiting for access'});
    assert.equal(waiting.task_status,'WAITING');assert.equal(waiting.order_version,3);
    current=await workCommand(staff,{type:'task_resume',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:4,expected_order_version:3});
    assert.equal(current.task_status,'IN_PROGRESS');
    current=await workCommand(staff,{type:'task_submit',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:5,expected_order_version:3});
    assert.equal(current.task_status,'QUALITY');assert.equal(current.order_status,'QUALITY');

    current=await workCommand(quality,{type:'quality_reject',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:6,expected_order_version:4,reason:'Rework required'});
    assert.equal(current.task_status,'IN_PROGRESS');assert.equal(current.order_status,'IN_PROGRESS');
    current=await workCommand(staff,{type:'task_submit',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:7,expected_order_version:5});
    assert.equal(current.task_status,'QUALITY');
    current=await workCommand(quality,{type:'quality_pass',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:8,expected_order_version:6});
    assert.equal(current.task_status,'COMPLETED');assert.equal(current.order_status,'COMPLETED');
    await denied(()=>workCommand(quality,{type:'quality_pass',tenant_id:tenant,idempotency_key:id(),task_id:task.id,expected_version:8,expected_order_version:6}),/invalid_transition|version_conflict/);

    await db.query(`insert into public.vision_role_permissions(role_id,permission_id)
      select mr.role_id,p.id
      from public.vision_memberships m
      join public.vision_membership_roles mr on (mr.tenant_id,mr.membership_id)=(m.tenant_id,m.id)
      cross join public.vision_permissions p
      where m.tenant_id=$1 and m.organization_id=$2 and m.user_id=$3 and p.code='vision.approval.decide'
      on conflict do nothing`,[tenant,cleaning,quality]);

    const approval=id();
    await db.query(`insert into public.vision_approval_requests(
      id,tenant_id,organization_id,kind,title,status,priority,assigned_user_id,requested_by,due_at,entity_type,entity_id
    ) values($1,$2,$3,'maintenance.spend','Approve repair','PENDING','HIGH',$4,$5,now()-interval '1 hour','order',$6)`,
      [approval,tenant,cleaning,quality,staff,created.order_id]);
    const approvalFeed=(await as(quality,d=>d.query('select public.vision_work_feed($1,$2,50) feed',[tenant,cleaning]))).rows[0].feed;
    const decision=approvalFeed.approvals.find(x=>x.id===approval);
    assert.deepEqual(decision.actions,['approval_approve','approval_reject']);assert.equal(decision.sla_state,'BREACHED');

    const reject={type:'approval_reject',tenant_id:tenant,idempotency_key:id(),approval_id:approval,expected_version:1,reason:'Insufficient evidence'};
    const rejected=await workCommand(quality,reject);
    assert.equal(rejected.approval_status,'REJECTED');assert.equal(rejected.approval_version,2);
    assert.deepEqual(await workCommand(quality,reject),rejected);

    const selfApproval=id();
    await db.query(`insert into public.vision_approval_requests(
      id,tenant_id,organization_id,kind,title,assigned_user_id,requested_by
    ) values($1,$2,$3,'maintenance.spend','Self approval blocked',$4,$4)`,[selfApproval,tenant,cleaning,quality]);
    await denied(()=>workCommand(quality,{type:'approval_approve',tenant_id:tenant,idempotency_key:id(),approval_id:selfApproval,expected_version:1}));
    await denied(()=>as(quality,d=>d.query("update public.vision_approval_requests set status='APPROVED' where id=$1",[selfApproval])));

    const actions=(await db.query("select action from public.vision_audit_events where entity_type in ('task','approval') order by created_at")).rows.map(x=>x.action);
    for(const required of ['order.assigned','task.started','task.waiting','task.resumed','task.completed','quality.rejected','quality.passed','approval.rejected'])assert.ok(actions.includes(required),required);
  });

  await t.test('Notifications deduplicate events, isolate recipients and acknowledge reconciled escalations',async()=>{
    await db.query(`insert into public.vision_role_permissions(role_id,permission_id)
      select mr.role_id,p.id
      from public.vision_memberships m
      join public.vision_membership_roles mr on (mr.tenant_id,mr.membership_id)=(m.tenant_id,m.id)
      cross join public.vision_permissions p
      where m.tenant_id=$1 and m.organization_id=$2 and m.user_id=$3 and p.code in ('vision.escalation.read','vision.escalation.ack')
      on conflict do nothing`,[tenant,cleaning,dispatcher]);

    const approval=id();
    await db.query(`insert into public.vision_approval_requests(
      id,tenant_id,organization_id,kind,title,status,priority,assigned_user_id,requested_by,due_at,entity_type,entity_id
    ) values($1,$2,$3,'maintenance.spend','Approval notification','PENDING','HIGH',$4,$5,now()+interval '1 hour','order',$6)`,
      [approval,tenant,cleaning,quality,staff,order.order_id]);
    const event=(await db.query("select * from public.vision_outbox_events where aggregate_type='approval' and aggregate_id=$1 and event_type='approval.requested' order by created_at desc limit 1",[approval])).rows[0];
    assert.ok(event);

    const consumeArgs=[tenant,event.id,event.event_type,event.aggregate_type,event.aggregate_id,event.correlation_id,'a'.repeat(64),event.payload];
    const first=(await db.query('select public.vision_notification_consume($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result',consumeArgs)).rows[0].result;
    assert.equal(first.processed,true);assert.ok(first.notifications_created>=1);
    const duplicate=(await db.query('select public.vision_notification_consume($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result',consumeArgs)).rows[0].result;
    assert.equal(duplicate.duplicate,true);

    const qualityFeed=(await as(quality,d=>d.query('select public.vision_notification_feed($1,$2,50) feed',[tenant,cleaning]))).rows[0].feed;
    assert.equal(qualityFeed.counts.unread,1);
    const notification=qualityFeed.notifications.find(x=>x.event_type==='approval.requested');
    assert.ok(notification);assert.equal(notification.status,'UNREAD');
    const staffFeed=(await as(staff,d=>d.query('select public.vision_notification_feed($1,$2,50) feed',[tenant,cleaning]))).rows[0].feed;
    assert.equal(staffFeed.notifications.length,0);

    const read={type:'notification_read',tenant_id:tenant,idempotency_key:id(),notification_id:notification.id,expected_version:1};
    const readResult=await notificationCommand(quality,read);
    assert.equal(readResult.status,'READ');assert.equal(readResult.version,2);
    assert.deepEqual(await notificationCommand(quality,read),readResult);
    await denied(()=>notificationCommand(staff,{type:'notification_read',tenant_id:tenant,idempotency_key:id(),notification_id:notification.id,expected_version:2}));
    await denied(()=>as(quality,d=>d.query("update public.vision_notifications set status='DISMISSED' where id=$1",[notification.id])));

    const escalationOrder=await command(guest,create());
    const escalationTask=(await db.query('select * from public.vision_tasks where order_id=$1',[escalationOrder.order_id])).rows[0];
    await db.query("update public.vision_tasks set due_at=now()-interval '30 minutes' where id=$1",[escalationTask.id]);
    const reconciled=(await db.query('select public.vision_reconcile_escalations($1,$2) result',[tenant,cleaning])).rows[0].result;
    assert.ok(reconciled.upserted>=1);

    const dispatcherNotifications=(await as(dispatcher,d=>d.query('select public.vision_notification_feed($1,$2,50) feed',[tenant,cleaning]))).rows[0].feed;
    const escalation=dispatcherNotifications.escalations.find(x=>x.source_id===escalationTask.id&&x.rule_code==='TASK_SLA_BREACH');
    assert.ok(escalation);assert.equal(escalation.status,'OPEN');assert.equal(escalation.can_ack,true);

    const ack={type:'escalation_ack',tenant_id:tenant,idempotency_key:id(),escalation_id:escalation.id,expected_version:escalation.version};
    const acked=await notificationCommand(dispatcher,ack);
    assert.equal(acked.status,'ACKNOWLEDGED');
    assert.deepEqual(await notificationCommand(dispatcher,ack),acked);
    await denied(()=>notificationCommand(guest,{type:'escalation_ack',tenant_id:tenant,idempotency_key:id(),escalation_id:escalation.id,expected_version:acked.version}));

    await db.query("update public.vision_tasks set status='CANCELLED' where id=$1",[escalationTask.id]);
    const resolved=(await db.query('select public.vision_reconcile_escalations($1,$2) result',[tenant,cleaning])).rows[0].result;
    assert.ok(resolved.resolved>=1);
    const row=(await db.query('select status from public.vision_escalations where id=$1',[escalation.id])).rows[0];
    assert.equal(row.status,'RESOLVED');

    await denied(()=>as(quality,d=>d.query('select public.vision_notification_consume($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',consumeArgs)));
    await denied(()=>as(dispatcher,d=>d.query('select public.vision_reconcile_escalations($1,$2)',[tenant,cleaning])));
  });

  await t.test('two PostgreSQL connections serialize retries and reject stale concurrent updates',{skip:!url},async()=>{
    const a=new pg.Client({connectionString:url}),b=new pg.Client({connectionString:url});
    await Promise.all([a.connect(),b.connect()]);
    try {
      const c=create();const before=await counts();
      const pair=await Promise.all([command(guest,c,a),command(guest,c,b)]);
      assert.deepEqual(pair[0],pair[1]);assert.equal((await counts()).orders,before.orders+1);
      const assign={type:'assign',tenant_id:tenant,order_id:pair[0].order_id,expected_version:1,assignee_user_id:staff};
      const races=await Promise.allSettled([command(dispatcher,{...assign,idempotency_key:id()},a),command(dispatcher,{...assign,idempotency_key:id()},b)]);
      assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
      assert.match(races.find(r=>r.status==='rejected').reason.message,/version_conflict/);
      // Two independent workers must not claim the same currently pending event.
      await db.query("update public.vision_outbox_events set lease_until=now()-interval '1 second' where published_at is null");
      const claims=await Promise.all([a.query('select * from public.vision_outbox_claim(2)'),b.query('select * from public.vision_outbox_claim(2)')]);
      const ids=claims.flatMap(r=>r.rows.map(e=>e.id));
      assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);
    } finally {await Promise.all([a.end(),b.end()]);}
  });
});
