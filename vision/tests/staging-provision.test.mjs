import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';
import {provisionDemo,demo} from '../backend/demo.mjs';

test('synthetic staging identities keep manager, cleaner, quality and guest boundaries separate',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;');
  await migrate(db);
  const identities=Object.fromEntries(['guest','views','dispatcher','staff','quality','audit'].map(key=>[key,randomUUID()]));
  await provisionDemo(db,identities);

  async function context(user){
    await db.exec('begin');
    try{
      await db.exec('set local role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user})]);
      const row=(await db.query('select public.vision_session_context($1,$2) result',[demo.tenant_id,demo.views_id])).rows[0].result;
      await db.exec('commit');return row;
    }catch(e){await db.exec('rollback');throw e;}
  }

  const manager=await context(identities.views);
  const cleaner=await context(identities.staff);
  const quality=await context(identities.quality);
  const guest=await context(identities.guest);

  assert.equal(manager.capabilities.create_booking,true);
  assert.equal(manager.capabilities.manage_booking,true);
  assert.equal(manager.capabilities.execute_cleaning,false);
  assert.equal(manager.capabilities.verify_cleaning,false);
  assert.equal(cleaner.capabilities.execute_cleaning,true);
  assert.equal(cleaner.capabilities.verify_cleaning,false);
  assert.equal(cleaner.permissions.includes('views.booking.manage'),false);
  assert.equal(quality.capabilities.verify_cleaning,true);
  assert.equal(quality.capabilities.execute_cleaning,false);
  assert.equal(guest.guest_linked,true);
  assert.deepEqual(guest.permissions,[]);
  assert.equal(new Set(Object.values(identities)).size,6);
});
