import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';

test('verified JWT subject resolves tenant and Views organizations without client-supplied scope',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create role anon; create role authenticated;');await migrate(db);
 const id=()=>randomUUID(),tenant=id(),otherTenant=id(),views=id(),otherOrg=id(),user=id(),otherUser=id();
 const insert=async(table,fields)=>{const keys=Object.keys(fields);return db.query(`insert into public.vision_${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(fields));};
 await insert('tenants',{id:tenant,code:'auth-a',name:'Auth A'});await insert('tenants',{id:otherTenant,code:'auth-b',name:'Auth B'});
 await insert('organizations',{id:views,tenant_id:tenant,code:'views',name:'Views',kind:'COMPANY'});
 await insert('organizations',{id:otherOrg,tenant_id:otherTenant,code:'foreign',name:'Foreign',kind:'COMPANY'});
 await insert('users',{id:user,tenant_id:tenant,display_name:'Synthetic Manager'});await insert('users',{id:otherUser,tenant_id:otherTenant,display_name:'Foreign User'});
 const membership=id(),role=id();await insert('memberships',{id:membership,tenant_id:tenant,user_id:user,organization_id:views});
 await insert('roles',{id:role,tenant_id:tenant,code:'views-manager',name:'Views Manager'});await insert('membership_roles',{tenant_id:tenant,membership_id:membership,role_id:role});
 for(const code of ['views.operations.read','views.booking.manage','audit.read'])await db.query('insert into public.vision_role_permissions(role_id,permission_id) select $1,id from public.vision_permissions where code=$2',[role,code]);
 const as=async(actor,work)=>{await db.exec('begin;set local role authenticated;');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(actor?{sub:actor}:{})]);const v=await work();await db.exec('commit');return v;}catch(e){await db.exec('rollback');throw e;}};
 const context=(actor)=>as(actor,async()=> (await db.query('select public.vision_auth_context() data')).rows[0].data);
 const value=await context(user);
 assert.equal(value.contract,'vision-auth-context/v1');assert.equal(value.user_id,user);assert.equal(value.tenant_id,tenant);
 assert.equal(value.organizations.length,1);assert.equal(value.organizations[0].id,views);
 assert.deepEqual([...value.organizations[0].permissions].sort(),['views.booking.manage','views.operations.read']);
 await assert.rejects(()=>context(null),/forbidden/);
 await db.query("update public.vision_users set status='SUSPENDED' where id=$1",[user]);await assert.rejects(()=>context(user),/forbidden/);
 await db.query("update public.vision_users set status='ACTIVE' where id=$1",[user]);await db.query("update public.vision_memberships set status='SUSPENDED' where id=$1",[membership]);
 assert.deepEqual((await context(user)).organizations,[]);
});
