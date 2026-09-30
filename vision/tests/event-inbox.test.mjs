import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';

test('event inbox deduplicates at-least-once delivery and enforces lease ownership',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;');
  await migrate(db);

  const tenant=randomUUID(),event=randomUUID(),aggregate=randomUUID(),correlation=randomUUID();
  await db.query('insert into public.vision_tenants(id,code,name) values($1,$2,$3)',[tenant,'inbox-test','Inbox Test']);
  const args=[tenant,'views.projection',event,'views.booking.checked_out','booking',aggregate,correlation,'a'.repeat(64)];

  const begin=async(values=args)=>(await db.query(
    'select public.vision_inbox_begin($1,$2,$3,$4,$5,$6,$7,$8) result',values
  )).rows[0].result;

  const first=await begin();
  assert.equal(first.claimed,true);assert.equal(first.status,'PROCESSING');assert.equal(first.attempts,1);
  assert.match(first.lease_token,/^[0-9a-f-]{36}$/i);

  const duplicate=await begin();
  assert.equal(duplicate.claimed,false);assert.equal(duplicate.status,'PROCESSING');assert.equal(duplicate.attempts,2);assert.equal(duplicate.lease_token,null);

  assert.equal((await db.query('select public.vision_inbox_complete($1,$2,$3,$4) ok',[tenant,'views.projection',event,randomUUID()])).rows[0].ok,false);
  assert.equal((await db.query('select public.vision_inbox_complete($1,$2,$3,$4) ok',[tenant,'views.projection',event,first.lease_token])).rows[0].ok,true);

  const processed=await begin();
  assert.equal(processed.claimed,false);assert.equal(processed.status,'PROCESSED');assert.equal(processed.attempts,3);

  const changed=[...args];changed[7]='b'.repeat(64);
  await assert.rejects(()=>begin(changed),error=>error.code==='23505');

  const event2=randomUUID(),args2=[tenant,'views.projection',event2,'views.cleaning.required','cleaning_job',randomUUID(),correlation,'c'.repeat(64)];
  const started=await begin(args2);
  assert.equal((await db.query('select public.vision_inbox_fail($1,$2,$3,$4,$5) ok',[tenant,'views.projection',event2,started.lease_token,'UPSTREAM_TIMEOUT'])).rows[0].ok,true);
  const retry=await begin(args2);
  assert.equal(retry.claimed,true);assert.equal(retry.status,'PROCESSING');assert.equal(retry.attempts,2);assert.notEqual(retry.lease_token,started.lease_token);

  await db.exec('set role authenticated');
  try{
    await assert.rejects(()=>db.query('select * from public.vision_event_inbox'),/permission denied/);
    await assert.rejects(()=>db.query('select public.vision_inbox_begin($1,$2,$3,$4,$5,$6,$7,$8)',args),/permission denied/);
  }finally{await db.exec('reset role');}
});
