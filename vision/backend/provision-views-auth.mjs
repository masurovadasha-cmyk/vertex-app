import {randomUUID} from 'node:crypto';
import {demo} from './demo.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const actors={
 manager:{name:'Views Staging Manager',role:'staging-views-manager',permissions:['views.operations.read','views.booking.create','views.booking.manage']},
 cleaner:{name:'Views Staging Cleaner',role:'staging-views-cleaner',permissions:['views.cleaning.execute']},
 quality:{name:'Views Staging Quality',role:'staging-views-quality',permissions:['views.operations.read','views.cleaning.verify']}
};
export async function provisionViewsAuth(db,identities){
 if(!identities||Object.keys(actors).some(key=>!valid(identities[key]))||new Set(Object.values(identities)).size!==3)throw new Error('invalid_auth_identities');
 await db.query('begin');
 try{
  const insert=async(table,fields)=>{
   const keys=Object.keys(fields);
   await db.query(`insert into public.vision_${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict do nothing`,Object.values(fields));
  };
  await insert('tenants',{id:demo.tenant_id,code:'vision-staging',name:'VERTEX VISION Staging'});
  await insert('organizations',{id:demo.views_id,tenant_id:demo.tenant_id,code:'views',name:'Views Hotel & Apartments',kind:'COMPANY'});
  await insert('customers',{id:demo.customer_id,tenant_id:demo.tenant_id,display_name:'Synthetic VISION Staging Guest'});
  await insert('views_properties',{id:demo.property_id,tenant_id:demo.tenant_id,organization_id:demo.views_id,code:'u-tower-staging',name:'NRG U-Tower — Synthetic Staging'});
  await insert('views_units',{id:demo.unit_id,tenant_id:demo.tenant_id,organization_id:demo.views_id,property_id:demo.property_id,unit_number:'TEST-235',unit_type:'apartment'});
  for(const [key,definition] of Object.entries(actors)){
   const user=identities[key];
   const existing=(await db.query('select tenant_id from public.vision_users where id=$1',[user])).rows[0];
   if(existing&&existing.tenant_id!==demo.tenant_id)throw new Error('auth_identity_already_bound:'+key);
   await insert('users',{id:user,tenant_id:demo.tenant_id,display_name:definition.name});
   await db.query("update public.vision_users set status='ACTIVE',display_name=$1 where id=$2 and tenant_id=$3",[definition.name,user,demo.tenant_id]);
   let membership=(await db.query('select id from public.vision_memberships where tenant_id=$1 and user_id=$2 and organization_id=$3',[demo.tenant_id,user,demo.views_id])).rows[0]?.id;
   if(!membership){membership=randomUUID();await insert('memberships',{id:membership,tenant_id:demo.tenant_id,user_id:user,organization_id:demo.views_id});}
   await db.query("update public.vision_memberships set status='ACTIVE' where id=$1",[membership]);
   let role=(await db.query('select id from public.vision_roles where tenant_id=$1 and code=$2',[demo.tenant_id,definition.role])).rows[0]?.id;
   if(!role){role=randomUUID();await insert('roles',{id:role,tenant_id:demo.tenant_id,code:definition.role,name:definition.name});}
   await insert('membership_roles',{tenant_id:demo.tenant_id,membership_id:membership,role_id:role});
   for(const code of definition.permissions){
    await db.query('insert into public.vision_permissions(code) values($1) on conflict do nothing',[code]);
    await db.query('insert into public.vision_role_permissions(role_id,permission_id) select $1,id from public.vision_permissions where code=$2 on conflict do nothing',[role,code]);
   }
  }
  await db.query('commit');
  return {tenant_id:demo.tenant_id,organization_id:demo.views_id,customer_id:demo.customer_id,unit_id:demo.unit_id,users:{...identities}};
 }catch(error){await db.query('rollback');throw error;}
}
