// Loopback-only browser integration harness. Real migrations/RLS/RPC; synthetic Auth adapter.
// This file is never included in the Cloudflare asset directory.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID as id} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';
import {handle} from '../backend/operations-worker.mjs';

const db=new PGlite(),checks=[];
await db.exec('create role anon;create role authenticated;');await migrate(db);
const tenant=id(),org=id(),manager=id(),cleaner=id(),quality=id(),property=id(),unit=id(),customer=id();
const insert=(table,fields)=>{const keys=Object.keys(fields);return db.query(`insert into public.vision_${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(fields));};
await insert('tenants',{id:tenant,code:'browser-ui',name:'Synthetic browser tenant'});
await insert('organizations',{id:org,tenant_id:tenant,code:'views',name:'Synthetic Views',kind:'COMPANY'});
await insert('customers',{id:customer,tenant_id:tenant,display_name:'SYNTHETIC ONLY'});
for(const [uid,code,permissions] of [
 [manager,'manager',['views.operations.read','views.booking.create','views.booking.manage']],
 [cleaner,'cleaner',['views.cleaning.execute']],
 [quality,'quality',['views.operations.read','views.cleaning.verify']]
]){
 await insert('users',{id:uid,tenant_id:tenant,display_name:'Synthetic '+code});
 const membership=id(),role=id();
 await insert('memberships',{id:membership,tenant_id:tenant,user_id:uid,organization_id:org});
 await insert('roles',{id:role,tenant_id:tenant,code,name:code});
 await insert('membership_roles',{tenant_id:tenant,membership_id:membership,role_id:role});
 for(const permission of permissions)await db.query('insert into public.vision_role_permissions(role_id,permission_id) select $1,id from public.vision_permissions where code=$2',[role,permission]);
}
await insert('views_properties',{id:property,tenant_id:tenant,organization_id:org,code:'synthetic',name:'Synthetic property'});
await insert('views_units',{id:unit,tenant_id:tenant,organization_id:org,property_id:property,unit_number:'TEST-235'});
const identities=new Map([['Bearer synthetic.manager',manager],['Bearer synthetic.cleaner',cleaner],['Bearer synthetic.quality',quality]]);
let queue=Promise.resolve(),commandCalls=0;
function as(actor,work){const next=queue.then(async()=>{await db.exec('begin;set local role authenticated;');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor})]);const result=await work();await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}});queue=next.catch(()=>{});return next;}
const fetcher=async(url,options)=>{
 const actor=identities.get(options.headers.authorization);
 if(url.endsWith('/auth/v1/user'))return Response.json(actor?{id:actor}:{error:'unauthorized'},{status:actor?200:401});
 if(!actor)return Response.json({code:'42501'},{status:403});
 try{
  const payload=JSON.parse(options.body);
  if(url.endsWith('/rpc/vision_views_operations_snapshot'))return Response.json(await as(actor,async()=>(await db.query('select public.vision_views_operations_snapshot($1,$2,$3,$4) data',[payload.p_tenant_id,payload.p_organization_id,payload.p_from,payload.p_to])).rows[0].data));
  if(url.endsWith('/rpc/vision_views_command')){commandCalls++;return Response.json(await as(actor,async()=>(await db.query('select public.vision_views_command($1::jsonb) data',[JSON.stringify(payload.command)])).rows[0].data));}
  return Response.json({error:'unknown_test_route'},{status:404});
 }catch(error){return Response.json({code:error.code||'XX000'},{status:error.code==='42501'?403:400});}
};
const env={VISION_ENV:'staging',SUPABASE_STAGING_REF:'a'.repeat(20),SUPABASE_URL:'https://'+'a'.repeat(20)+'.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',OPERATIONS_UI:{fetch:async request=>{
 const pathname=new URL(request.url).pathname;const file=new URL('../ui'+pathname+(pathname.endsWith('/')?'index.html':''),import.meta.url);
 const content=await readFile(file);const type=pathname.endsWith('.mjs')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html';return new Response(content,{headers:{'content-type':type}});
}}};
let origin;
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!==new URL(origin).host){res.writeHead(403);res.end();return;}
  const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>16384){res.writeHead(413);res.end();return;}chunks.push(c);}
  const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await handle(request,env,fetcher);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('test_gateway_error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
const mark=name=>{checks.push(name);console.log('PASS '+name);};
const out=new URL('../../.vision-build/operations-ui-evidence/',import.meta.url);await mkdir(out,{recursive:true});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(origin+'/operations/');
 async function login(profile){
  await page.locator('#connectForm [name=tenant]').fill(tenant);await page.locator('#connectForm [name=organization]').fill(org);await page.locator('#connectForm [name=token]').fill('synthetic.'+profile);
  await page.locator('#connectForm button').click();await page.locator('#workspace').waitFor({state:'visible'});
 }
 async function logout(){await page.locator('#logout').click();await page.locator('#connect').waitFor({state:'visible'});}
 async function action(type){await page.locator(`[data-command="${type}"]`).click();await page.waitForFunction(()=>!document.querySelector('#message').textContent.includes('подтверждение')&&!document.querySelector('#message').textContent.includes('Загрузка'));}
 await login('manager');
 assert.equal(await page.locator('#modules .card').count(),19);assert.equal(await page.locator('#modules button:not([disabled])').count(),1);
 assert.equal(await page.locator('#connectForm [name=token]').inputValue(),'');mark('Hub: exactly one active Views workspace; 18 future modules');
 await page.locator('#from').fill('2026-10-01');await page.locator('#to').fill('2026-10-31');await page.locator('#rangeForm button').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.startsWith('Данные получены'));
 await page.locator('[data-tab=bookings]').click();await page.locator('#newBooking summary').click();
 await page.locator('#bookingForm [name=unit_id]').selectOption(unit);await page.locator('#bookingForm [name=customer_id]').fill(customer);await page.locator('#bookingForm [name=check_in]').fill('2026-10-10');await page.locator('#bookingForm [name=check_out]').fill('2026-10-12');await page.locator('#bookingForm [name=total]').fill('250.00');
 await page.locator('#bookingForm button').click();await page.locator('[data-command=confirm_booking]').waitFor();
 await action('confirm_booking');await page.locator('[data-command=check_in]').waitFor();
 await page.locator('[data-tab=calendar]').click();assert.equal(await page.locator('#calendar tbody tr').count(),1);assert.equal(await page.locator('#calendar td.busy').count(),2);mark('Real RPC booking creation/confirmation appears on the date-filtered calendar');
 await page.locator('[data-tab=bookings]').click();await action('check_in');await page.locator('[data-command=check_out]').waitFor();await action('check_out');
 assert.equal((await db.query('select status from public.vision_views_units where id=$1',[unit])).rows[0].status,'CLEANING');mark('Check-in and check-out create actual stay and cleaning records');
 await logout();await login('cleaner');await page.locator('[data-tab=cleaning]').click();
 assert.equal(await page.locator('[data-command=cleaning_verify]').count(),0);assert.equal(await page.locator('#newBooking').isVisible(),false);
 await action('cleaning_start');await page.locator('[data-command=cleaning_submit]').waitFor();await action('cleaning_submit');mark('Separate cleaner executes work without booking/verification controls');
 await logout();await login('quality');await page.locator('[data-tab=cleaning]').click();await page.locator('[data-command=cleaning_verify]').waitFor();await action('cleaning_verify');
 assert.equal((await db.query('select status from public.vision_views_units where id=$1',[unit])).rows[0].status,'READY');assert.equal((await db.query('select status from public.vision_views_bookings')).rows[0].status,'COMPLETED');assert.equal((await db.query('select status from public.vision_views_cleaning_jobs')).rows[0].status,'VERIFIED');mark('Separate quality user verifies; database booking COMPLETED / unit READY');
 const storage=await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}));assert.deepEqual(storage,{local:0,session:0});assert.equal((await context.cookies()).length,0);mark('No access token or customer cache in browser storage/cookies');
 await page.locator('[data-tab=dashboard]').click();await page.screenshot({path:new URL('desktop.png',out).pathname.replace(/^\/(?:([A-Z]:))/,'$1'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('header').isVisible());
 assert.ok(await page.locator('nav').evaluate(nav=>[...nav.querySelectorAll('button')].every(button=>button.scrollWidth<=button.clientWidth&&button.getBoundingClientRect().height>=44)),'Mobile navigation labels must fit their buttons with 44px touch targets');
 await page.screenshot({path:new URL('mobile.png',out).pathname.replace(/^\/(?:([A-Z]:))/,'$1'),fullPage:true});mark('Desktop/mobile rendering and mobile navigation overflow/touch targets verified');
 await logout();await login('manager');await page.locator('[data-tab=bookings]').click();const before=commandCalls;await context.setOffline(true);await page.waitForFunction(()=>!document.querySelector('#network').hidden);assert.equal(await page.locator('#bookingForm button').isDisabled(),true);assert.equal(commandCalls,before);await context.setOffline(false);mark('Offline disables mutation controls and does not enqueue commands');
 await logout();assert.equal(await page.locator('#modules .card').count(),0);assert.equal(await page.locator('#bookings [data-record]').count(),0);assert.deepEqual(errors,[]);mark('Logout clears prior-session data; no uncaught browser errors');
 await writeFile(new URL('report.json',out),JSON.stringify({status:'passed',checks,auth:'synthetic test adapter, NOT genuine Supabase Auth',database:'PGlite with actual migrations, RLS and command RPC',cloudDeploymentVerified:false},null,2));
 console.log(JSON.stringify({passed:checks.length,failed:0,cloudDeploymentVerified:false}));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();}
