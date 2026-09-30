import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startDev} from '../backend/dev.mjs';
import {demo} from '../backend/demo.mjs';
test('loopback development profiles run complete Golden Flow and reject cross-origin requests',async t=>{
 const app=await startDev({port:0});t.after(()=>app.close());
 const directions=await (await fetch(app.url+'/api/modules')).json();
 assert.equal(directions[0].id,'views');
 const workspace=await fetch(app.url+directions[0].path);assert.equal(workspace.status,200);
 assert.match(workspace.headers.get('content-security-policy'),/style-src 'self'/);
 assert.equal((await fetch(app.url+'/modules/views/manifest.json')).status,401);
 assert.equal((await fetch(app.url+'/modules/views/workspace.css')).status,200);
 assert.equal(new URL(directions[0].entrypoint.url).protocol,'https:');
 const icon=await fetch(app.url+directions[0].icon);
 assert.equal(icon.status,200);assert.match(icon.headers.get('content-type'),/image\/svg\+xml/);
 const setup=await (await fetch(app.url+'/api/profiles')).json();
 assert.equal(setup.organizations.filter(o=>o.kind!=='GROUP').length,13);
 assert.ok(setup.organizations.some(o=>o.code==='rent-car'));
 assert.ok(setup.organizations.some(o=>o.code==='taxi'));
 const request=(profile,path,body)=>fetch(app.url+path,{method:body?'POST':'GET',headers:{'x-vision-profile':profile,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 assert.equal((await fetch(app.url+'/api/orders',{headers:{origin:'https://external.example','x-vision-profile':'guest'}})).status,403);
 assert.equal((await fetch(app.url+'/api/orders')).status,401);
 let order;const send=async(profile,type,fields={})=>{
   const response=await request(profile,'/api/commands',{type,tenant_id:demo.tenant_id,idempotency_key:crypto.randomUUID(),...fields});
   assert.equal(response.status,200,await response.clone().text());order=await response.json();
 };
 await send('guest','create',{customer_id:demo.customer_id,requester_organization_id:demo.views_id,service_id:demo.service_id});
 assert.equal((await (await request('views','/api/orders')).json()).length,1);
 assert.equal((await (await request('staff','/api/orders')).json()).length,0);
 for(const [profile,type] of [['dispatcher','assign'],['staff','start'],['staff','submit'],['quality','pass']])
   await send(profile,type,{order_id:order.order_id,expected_version:order.version,...(type==='assign'?{assignee_user_id:demo.staff_id}:{})});
 assert.equal(order.status,'COMPLETED');
 assert.equal((await (await request('audit','/api/audit')).json()).length,5);
 assert.equal((await (await request('guest','/api/audit')).json()).length,0);
});
