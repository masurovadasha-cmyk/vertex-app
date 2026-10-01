import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';

test('checksum migration runner can build N-1 baseline then safely catch up to current',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;');

  await migrate(db,{through:'0004_private_subject_permissions.sql'});
  let rows=(await db.query('select name from vision_private.schema_migrations order by name')).rows.map(x=>x.name);
  assert.equal(rows.length,4);assert.equal(rows.at(-1),'0004_private_subject_permissions.sql');
  assert.equal((await db.query("select to_regclass('public.vision_module_definitions') is null missing")).rows[0].missing,true);

  await migrate(db);
  rows=(await db.query('select name from vision_private.schema_migrations order by name')).rows.map(x=>x.name);
  assert.equal(rows.at(-1),'0019_external_module_delegation.sql');assert.equal(rows.length,19);
  assert.equal((await db.query("select to_regclass('public.vision_event_inbox') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regclass('public.vision_approval_requests') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regprocedure('public.vision_work_feed(uuid,uuid,integer)') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regprocedure('public.vision_work_command(jsonb)') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regprocedure('public.vision_work_assignees(uuid,uuid)') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regclass('public.vision_notifications') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regclass('public.vision_escalations') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regprocedure('public.vision_notification_feed(uuid,uuid,integer)') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regprocedure('public.vision_notification_command(jsonb)') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regprocedure('public.vision_outbox_fail(uuid,uuid)') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regprocedure('public.vision_background_scopes(integer)') is not null ok")).rows[0].ok,true);
  assert.equal((await db.query("select to_regprocedure('public.vision_session_scopes()') is not null ok")).rows[0].ok,true);

  await assert.rejects(()=>migrate(db,{through:'9999_missing.sql'}),/Unknown migration target/);
});
