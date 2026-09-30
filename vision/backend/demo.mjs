// Synthetic identities for loopback-only development. Never Auth credentials.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const demo={tenant_id:id(1),views_id:id(2),cleaning_id:id(3),customer_id:id(4),service_id:id(5),staff_id:id(13),property_id:id(50),unit_id:id(51)};
export const organizations=[
 {id:id(6),code:'vertex-vision',name:'Vertex Vision',kind:'GROUP'},
 {id:demo.views_id,code:'views',name:'Views Hotel & Apartments'},
 {id:id(30),code:'engineers',name:'Vertex Engineers'},
 {id:id(31),code:'technologies',name:'Vertex Technologies'},
 {id:id(32),code:'managing',name:'Vertex Managing IO'},
 {id:id(33),code:'ditalia',name:'D’Italia'},
 {id:id(34),code:'aviasales',name:'Aviasales'},
 {id:id(35),code:'travel',name:'Vertex Travel'},
 {id:id(36),code:'concierge',name:'Concierge Service'},
 {id:demo.cleaning_id,code:'cleaning',name:'Vertex Cleaning'},
 {id:id(37),code:'laundry',name:'Laundry'},
 {id:id(38),code:'rent-car',name:'Rent Car'},
 {id:id(39),code:'taxi',name:'Taxi'},
 {id:id(40),code:'mini-mart',name:'Mini Mart'}
];
export const profiles=[
 {key:'guest',id:id(10),name:'VISION-GUEST',org:null,permissions:[]},
 {key:'views',id:id(11),name:'Views',org:demo.views_id,permissions:['views.order.read','views.order.create','views.operations.read','views.booking.create','views.booking.manage','views.cleaning.execute','views.cleaning.verify']},
 {key:'dispatcher',id:id(12),name:'Vertex Cleaning',org:demo.cleaning_id,permissions:['cleaning.order.read','cleaning.order.assign']},
 {key:'staff',id:id(13),name:'Cleaning Staff',org:demo.cleaning_id,permissions:['cleaning.task.read_assigned','cleaning.task.update_assigned']},
 {key:'quality',id:id(14),name:'Quality',org:demo.cleaning_id,permissions:['cleaning.quality.review']},
 {key:'audit',id:id(15),name:'Audit',org:demo.cleaning_id,permissions:['audit.read']}
];

export async function provisionDemo(db, identities=Object.fromEntries(profiles.map(p=>[p.key,p.id]))) {
  await db.query('begin');
  try {
    const insert=async(table,fields)=>{
      const keys=Object.keys(fields);
      await db.query(`insert into public.vision_${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict do nothing`,Object.values(fields));
    };
    await insert('tenants',{id:demo.tenant_id,code:'vision-development',name:'Vertex Vision — Synthetic Development'});
    for(const org of organizations){
      await insert('organizations',{...org,tenant_id:demo.tenant_id,kind:org.kind||'COMPANY',parent_id:org.kind?null:id(6)});
      await db.query('update public.vision_organizations set name=$1,parent_id=$2 where tenant_id=$3 and id=$4',
        [org.name,org.kind?null:id(6),demo.tenant_id,org.id]);
    }
    await insert('customers',{id:demo.customer_id,tenant_id:demo.tenant_id,display_name:'Synthetic VISION Guest'});
    await insert('views_properties',{id:demo.property_id,tenant_id:demo.tenant_id,organization_id:demo.views_id,code:'u-tower-demo',name:'NRG U-Tower — Synthetic'});
    await insert('views_units',{id:demo.unit_id,tenant_id:demo.tenant_id,organization_id:demo.views_id,property_id:demo.property_id,unit_number:'TEST-235',unit_type:'apartment'});
    await insert('services',{id:demo.service_id,tenant_id:demo.tenant_id,code:'cleaning.guest',name:'Demo Cleaning',provider_organization_id:demo.cleaning_id});
    for(const [index,p] of profiles.entries()) {
      const user=identities[p.key];if(!user)throw new Error('Missing profile identity: '+p.key);
      await insert('users',{id:user,tenant_id:demo.tenant_id,display_name:p.name});
      if(!p.org){await insert('guest_links',{tenant_id:demo.tenant_id,user_id:user,customer_id:demo.customer_id,requester_organization_id:demo.views_id});continue;}
      const membership=id(100+index),role=id(200+index);
      const existing=(await db.query('select user_id from public.vision_memberships where id=$1',[membership])).rows[0];
      if(existing && existing.user_id!==user)throw new Error('Demo profile is already bound to another identity: '+p.key);
      await insert('memberships',{id:membership,tenant_id:demo.tenant_id,user_id:user,organization_id:p.org});
      await insert('roles',{id:role,tenant_id:demo.tenant_id,code:'demo-'+p.key,name:p.name});
      await insert('membership_roles',{tenant_id:demo.tenant_id,membership_id:membership,role_id:role});
      for(const code of p.permissions){
        await db.query('insert into public.vision_permissions(code) values($1) on conflict do nothing',[code]);
        await db.query('insert into public.vision_role_permissions(role_id,permission_id) select $1,id from public.vision_permissions where code=$2 on conflict do nothing',[role,code]);
      }
    }
    await db.query('commit');
  }catch(e){await db.query('rollback');throw e;}
}
