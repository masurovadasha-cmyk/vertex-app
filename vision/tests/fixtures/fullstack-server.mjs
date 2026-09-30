/** TEST ONLY: loopback HTTP -> production staging handler -> real SQL/RLS in PGlite.
 * Supabase Auth and HTTP/PostgREST transport are synthetic adapters, not cloud validation.
 * This file is outside public assets and must never be deployed or exposed via a tunnel.
 */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../backend/migrate.mjs';
import {provisionDemo,demo,profiles} from '../../backend/demo.mjs';
import {handle} from '../../backend/worker.mjs';

if(process.env.VISION_LOCAL_E2E!=='synthetic-only')throw Error('Explicit synthetic-only test mode required');
const root=fileURLToPath(new URL('../../../',import.meta.url));
const db=new PGlite();
await db.exec('create role anon;create role authenticated;');await migrate(db);await provisionDemo(db);
const identities=Object.fromEntries(profiles.map(p=>['synthetic.'+p.key+'.jwt',p.id]));
let queue=Promise.resolve(),loseAck=false;
const serial=work=>{const p=queue.then(work);queue=p.catch(()=>{});return p;};
const environment={VISION_ENV:'staging',SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',
 SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_only'};
const tables=new Set(['vision_views_bookings','vision_views_units','vision_views_cleaning_jobs']);
async function upstream(input,options={}){
 const url=new URL(input),token=options.headers.authorization?.replace('Bearer ',''),actor=identities[token];
 if(url.hostname!=='abcdefghijklmnopqrst.supabase.co')throw Error('Unexpected upstream');
 if(url.pathname==='/auth/v1/user')return actor?Response.json({id:actor}):Response.json({error:'invalid_token'},{status:401});
 return serial(async()=>{
  await db.query('begin');
  try{
   await db.query(actor?'set local role authenticated':'set local role anon');
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(actor?{sub:actor}:{})]);
   let body;
   if(url.pathname==='/rest/v1/rpc/vision_session_context'){
    const p=JSON.parse(options.body);body=(await db.query('select public.vision_session_context($1::uuid,$2::uuid) result',[p.p_tenant,p.p_organization])).rows[0].result;
   }else if(url.pathname==='/rest/v1/rpc/vision_views_command'){
    const p=JSON.parse(options.body);body=(await db.query('select public.vision_views_command($1::jsonb) result',[JSON.stringify(p.command)])).rows[0].result;
   }else if(url.pathname==='/rest/v1/rpc/vision_runtime_readiness'){
    body=(await db.query('select public.vision_runtime_readiness() result')).rows[0].result;
   }else{
    const table=url.pathname.split('/').at(-1);if(!tables.has(table))throw Error('Unexpected fixture table');
    const columns=url.searchParams.get('select').split(',');if(columns.some(c=>!/^[a-z_]+$/.test(c)))throw Error('Invalid fixture projection');
    const tenant=url.searchParams.get('tenant_id'),org=url.searchParams.get('organization_id');
    if(!tenant?.startsWith('eq.')||!org?.startsWith('eq.'))throw Error('Unscoped fixture read');
    const args=[tenant.slice(3),org.slice(3)];let cursor='';
    const or=url.searchParams.get('or');
    if(or){const match=or.match(/^\(created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([a-f0-9-]+)\)\)$/i);
     if(!match||match[1]!==match[2])throw Error('Invalid fixture cursor');args.push(match[1],match[3]);cursor=' and (created_at,id)<($3::timestamptz,$4::uuid)';}
    const limit=Number(url.searchParams.get('limit'));if(!Number.isInteger(limit)||limit<1||limit>101)throw Error('Unbounded fixture read');
    args.push(limit);body=(await db.query(`select ${columns.join(',')} from public.${table} where tenant_id=$1 and organization_id=$2${cursor} order by created_at desc,id desc limit $${args.length}`,args)).rows;
   }
   await db.query('commit');return Response.json(body);
  }catch(error){await db.query('rollback');return Response.json({code:error.code||'XX000',message:'synthetic adapter error'},{status:400});}
 });
}
const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webmanifest':'application/manifest+json'};
let port;
const server=http.createServer(async(req,res)=>{
 try{
  const origin='http://127.0.0.1:'+port;
  if(req.headers.host!=='127.0.0.1:'+port||(req.headers.origin&&req.headers.origin!==origin)){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,origin);let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error('fixture_body_limit');}
  let response;
  if(url.pathname==='/__test__/configuration')response=Response.json({syntheticOnly:true,cloudAuth:false,demo,profiles:Object.fromEntries(profiles.map(p=>[p.key,{tenantId:demo.tenant_id,organizationId:demo.views_id,token:'synthetic.'+p.key+'.jwt'}]))});
  else if(url.pathname==='/__test__/lose-next-ack'&&req.method==='POST'){loseAck=true;response=Response.json({armed:true});}
  else if(url.pathname==='/__test__/seed-units'&&req.method==='POST'){
   await serial(()=>db.query("insert into public.vision_views_units(tenant_id,organization_id,property_id,unit_number) select $1,$2,$3,'TEST-'||n from generate_series(1000,1051) n",[demo.tenant_id,demo.views_id,demo.property_id]));response=Response.json({syntheticUnitsAdded:52});
  }else if(url.pathname==='/__test__/state'){
   const state=await serial(async()=>({bookings:(await db.query('select id,status,version from public.vision_views_bookings')).rows,
    cleaning:(await db.query('select id,status,started_by,submitted_by,verified_by from public.vision_views_cleaning_jobs')).rows,
    unit:(await db.query('select status from public.vision_views_units where id=$1',[demo.unit_id])).rows[0],
    receipts:(await db.query('select count(*)::int n from public.vision_command_receipts')).rows[0].n}));response=Response.json(state);
  }else{
   const assets={fetch:async request=>{const name=new URL(request.url).pathname.slice(1)||'index.html';
     if(name.includes('/')||name.includes('..'))return new Response('not found',{status:404});
     try{return new Response(await readFile(path.join(root,'vertex/dist',name)),{headers:{'content-type':types[path.extname(name)]||'application/octet-stream'}});}catch{return new Response('not found',{status:404});}}};
   const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
   response=await handle(request,{...environment,ASSETS:assets},upstream);
   if(loseAck&&url.pathname==='/api/v1/views/commands'&&response.ok){loseAck=false;response=Response.json({error:'backend_unavailable'},{status:503});}
  }
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:'test_harness_failure'}));console.error(e);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;
console.log(JSON.stringify({url:'http://127.0.0.1:'+port,syntheticOnly:true,cloudAuth:false}));
process.on('SIGTERM',()=>server.close(async()=>{await queue;await db.close();process.exit(0);}));
