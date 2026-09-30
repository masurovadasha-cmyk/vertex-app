import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {demo,profiles,provisionDemo} from '../backend/demo.mjs';
import {dispatchOutbox} from '../backend/outbox.mjs';

test('upgrade preserves existing order events and drains them in order-version sequence',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  const directory=new URL('../database/migrations/',import.meta.url);
  await db.exec('create role anon; create role authenticated;');
  for(const name of (await readdir(directory)).sort().filter(n=>n<'0005'))await db.exec(await readFile(new URL(name,directory),'utf8'));
  await provisionDemo(db);
  let order;
  async function command(profile,type,fields){
    await db.query('begin');
    try{
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:profiles.find(p=>p.key===profile).id})]);
      order=(await db.query('select public.vision_command($1::jsonb) result',[JSON.stringify({type,tenant_id:demo.tenant_id,idempotency_key:crypto.randomUUID(),...fields})])).rows[0].result;
      await db.query('commit');
    }catch(e){await db.query('rollback');throw e;}
  }
  await command('guest','create',{customer_id:demo.customer_id,requester_organization_id:demo.views_id,service_id:demo.service_id});
  await command('dispatcher','assign',{order_id:order.order_id,expected_version:1,assignee_user_id:demo.staff_id});
  await command('staff','start',{order_id:order.order_id,expected_version:2});
  const before=(await db.query('select id,payload from public.vision_outbox_events order by id')).rows;
  // Invert timestamps: order.version must remain the delivery sequence.
  await db.query("update public.vision_outbox_events set created_at=now() - ((payload->>'version')::integer*interval '1 hour')");
  await db.exec(await readFile(new URL('0005_ordered_outbox.sql',directory),'utf8'));
  assert.deepEqual((await db.query('select id,payload from public.vision_outbox_events order by id')).rows,before);
  const versions=[];
  const result=await dispatchOutbox({db,deliver:async e=>{versions.push(Number(e.aggregate_version));return {accepted:true};}});
  assert.deepEqual(versions,[1,2,3]);assert.equal(result.acknowledged,3);
  assert.equal((await db.query('select status from public.vision_orders')).rows[0].status,'IN_PROGRESS');
});
