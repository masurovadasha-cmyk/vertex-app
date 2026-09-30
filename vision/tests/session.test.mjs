import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';
import {provisionDemo,profiles,demo} from '../backend/demo.mjs';
test('session context exposes only verified active scope and never another guest context',async()=>{
 const db=new PGlite();try{await db.exec('create role anon;create role authenticated;');await migrate(db);await provisionDemo(db);
 async function session(subject){await db.exec('begin;set local role authenticated;');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:subject})]);return (await db.query('select public.vision_session() context')).rows[0].context;}finally{await db.exec('rollback');}}
 assert.equal(await session('11111111-1111-4111-8111-111111111111'),null);
 const guest=await session(profiles[0].id);assert.equal(guest.user_id,profiles[0].id);assert.equal(guest.tenant_id,demo.tenant_id);assert.equal(guest.request_contexts.length,1);assert.equal(guest.memberships.length,0);
 const staff=await session(profiles[3].id);assert.equal(staff.request_contexts.length,0);assert.deepEqual(staff.memberships[0].permissions.sort(),profiles[3].permissions.toSorted());
 await db.query("update public.vision_users set status='SUSPENDED' where id=$1",[profiles[0].id]);assert.equal(await session(profiles[0].id),null);
 await db.exec('set role anon');await assert.rejects(db.query('select public.vision_session()'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
