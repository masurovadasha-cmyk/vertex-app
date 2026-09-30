import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {migrate} from '../backend/migrate.mjs';
import {provisionDemo,demo} from '../backend/demo.mjs';

const controllerRoot=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const candidateRoot=process.env.VISION_CANDIDATE_ROOT?path.resolve(process.env.VISION_CANDIDATE_ROOT):controllerRoot;
const migrationDirectory=pathToFileURL(path.join(candidateRoot,'vision/database/migrations')+path.sep);
const url=process.env.VISION_TEST_DATABASE_URL;
if(!url)throw new Error('VISION_TEST_DATABASE_URL required');
const client=new pg.Client({connectionString:url,application_name:'vertex-vision-rc2-fixture'});
await client.connect();
const db={query:(...args)=>client.query(...args),exec:sql=>client.query(sql)};
try{
  for(const role of ['anon','authenticated']){
    const exists=(await client.query('select exists(select 1 from pg_roles where rolname=$1) ok',[role])).rows[0].ok;
    if(!exists)await client.query('create role '+role);
  }
  await migrate(db,{directory:migrationDirectory});
  const identities=Object.fromEntries(['guest','views','dispatcher','staff','quality','audit'].map(key=>[key,randomUUID()]));
  await provisionDemo(db,identities);

  const command=async(payload)=>{
    await client.query('begin');
    try{
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:identities.views})]);
      const result=(await client.query('select public.vision_views_command($1::jsonb) data',[JSON.stringify(payload)])).rows[0].data;
      await client.query('commit');return result;
    }catch(e){await client.query('rollback');throw e;}
  };

  let booking=await command({
    type:'create_booking',tenant_id:demo.tenant_id,idempotency_key:randomUUID(),
    organization_id:demo.views_id,unit_id:demo.unit_id,customer_id:demo.customer_id,
    check_in:'2040-01-10',check_out:'2040-01-12',source:'rc2-restore',total:'777.00',currency:'USD'
  });
  booking=await command({
    type:'confirm_booking',tenant_id:demo.tenant_id,idempotency_key:randomUUID(),
    booking_id:booking.booking_id,expected_version:booking.booking_version
  });

  const inboxEventId=randomUUID(),payloadHash='d'.repeat(64);
  const begin=(await client.query(
    'select public.vision_inbox_begin($1,$2,$3,$4,$5,$6,$7,$8) data',
    [demo.tenant_id,'rc2.restore-check',inboxEventId,'views.booking.confirmed','booking',booking.booking_id,booking.correlation_id,payloadHash]
  )).rows[0].data;
  if(begin.claimed!==true)throw new Error('fixture_inbox_not_claimed');
  const completed=(await client.query(
    'select public.vision_inbox_complete($1,$2,$3,$4) ok',
    [demo.tenant_id,'rc2.restore-check',inboxEventId,begin.lease_token]
  )).rows[0].ok;
  if(completed!==true)throw new Error('fixture_inbox_not_completed');

  const readiness=(await client.query('select public.vision_runtime_readiness() data')).rows[0].data;
  if(readiness?.ready!==true)throw new Error('fixture_database_not_ready');

  const report={
    syntheticOnly:true,
    tenantId:demo.tenant_id,
    organizationId:demo.views_id,
    unitId:demo.unit_id,
    customerId:demo.customer_id,
    bookingId:booking.booking_id,
    bookingStatus:booking.booking_status,
    correlationId:booking.correlation_id,
    inboxEventId,
    latestMigration:readiness.latest_migration,
    architectureVersion:readiness.architecture_version
  };
  const output=process.argv[2]||'artifacts/rc2/fixture.json';
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await client.end();}
