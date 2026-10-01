import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';
import {provisionDemo,profiles,demo} from '../backend/demo.mjs';

test('session scope discovery exposes only authorized active Views workspaces',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;');
  await migrate(db);
  await provisionDemo(db);

  const ids=Object.fromEntries(profiles.map(p=>[p.key,p.id]));
  async function as(user,fn){
    await db.query('begin');
    try{
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(user?{sub:user}:{})]);
      const result=await fn();
      await db.query('commit');
      return result;
    }catch(error){await db.query('rollback');throw error;}
  }
  async function scopes(user){
    return (await as(user,()=>db.query('select public.vision_session_scopes() value'))).rows[0].value;
  }

  const guest=await scopes(ids.guest);
  assert.equal(guest.actor_id,ids.guest);
  assert.equal(guest.scopes.length,1);
  assert.equal(guest.scopes[0].tenant_id,demo.tenant_id);
  assert.equal(guest.scopes[0].organization_id,demo.views_id);
  assert.equal(guest.scopes[0].guest_linked,true);
  assert.equal(guest.scopes[0].member_authorized,false);

  const manager=await scopes(ids.views);
  assert.equal(manager.scopes.length,1);
  assert.equal(manager.scopes[0].member_authorized,true);
  assert.equal(manager.scopes[0].guest_linked,false);

  const cleaner=await scopes(ids.staff);
  assert.equal(cleaner.scopes.length,1);
  assert.equal(cleaner.scopes[0].organization_id,demo.views_id);
  assert.equal(cleaner.scopes[0].member_authorized,true);

  const dispatcher=await scopes(ids.dispatcher);
  assert.deepEqual(dispatcher.scopes,[]);

  await db.query("update public.vision_memberships set status='SUSPENDED' where user_id=$1 and organization_id=$2",[ids.views,demo.views_id]);
  assert.deepEqual((await scopes(ids.views)).scopes,[]);
  await db.query("update public.vision_memberships set status='ACTIVE' where user_id=$1 and organization_id=$2",[ids.views,demo.views_id]);

  await db.query("update public.vision_module_installations set state='SUSPENDED' where tenant_id=$1 and organization_id=$2 and module_id='views'",[demo.tenant_id,demo.views_id]);
  assert.deepEqual((await scopes(ids.views)).scopes,[]);
  assert.deepEqual((await scopes(ids.guest)).scopes,[]);

  await assert.rejects(()=>scopes(null),/forbidden/);
});
