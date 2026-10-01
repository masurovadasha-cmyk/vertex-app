import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url=process.env.VISION_TEST_DATABASE_URL;
if(!url)throw new Error('VISION_TEST_DATABASE_URL required');
const fixturePath=process.env.VISION_FIXTURE_FILE||process.argv[2];
if(!fixturePath)throw new Error('VISION_FIXTURE_FILE required');
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const controllerRoot=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const candidateRoot=process.env.VISION_CANDIDATE_ROOT?path.resolve(process.env.VISION_CANDIDATE_ROOT):controllerRoot;
const release=JSON.parse(fs.readFileSync(path.join(candidateRoot,'vision/release/0.1-RC1.json'),'utf8'));
const migrationDir=path.join(candidateRoot,'vision/database/migrations');
const expectedMigrationCount=fs.readdirSync(migrationDir).filter(name=>/^\d{4}_.+\.sql$/.test(name)).length;

const client=new pg.Client({connectionString:url,application_name:'vertex-vision-rc2-restore-verify'});
await client.connect();
try{
  const readiness=(await client.query('select public.vision_runtime_readiness() data')).rows[0]?.data;
  if(!readiness||readiness.ready!==true)throw new Error('restored_database_not_ready');
  if(readiness.latest_migration!==release.databaseMigration||readiness.architecture_version!==release.architectureVersion)throw new Error('restored_release_mismatch');

  const booking=(await client.query(
    'select id,status,unit_id,customer_id,correlation_id,total::text,currency from public.vision_views_bookings where id=$1',
    [fixture.bookingId]
  )).rows[0];
  if(!booking||booking.status!=='CONFIRMED'||booking.unit_id!==fixture.unitId||booking.customer_id!==fixture.customerId||booking.correlation_id!==fixture.correlationId)throw new Error('restored_booking_mismatch');

  const inbox=(await client.query(
    'select status,consumer,event_type,aggregate_id,correlation_id from public.vision_event_inbox where tenant_id=$1 and event_id=$2',
    [fixture.tenantId,fixture.inboxEventId]
  )).rows[0];
  if(!inbox||inbox.status!=='PROCESSED'||inbox.consumer!=='rc2.restore-check'||inbox.event_type!=='views.booking.confirmed'||inbox.aggregate_id!==fixture.bookingId||inbox.correlation_id!==fixture.correlationId)throw new Error('restored_inbox_mismatch');

  const audits=(await client.query(
    "select count(*)::int n from public.vision_audit_events where tenant_id=$1 and entity_id=$2 and action in ('views.booking.created','views.booking.confirmed')",
    [fixture.tenantId,fixture.bookingId]
  )).rows[0].n;
  const outbox=(await client.query(
    "select count(*)::int n from public.vision_outbox_events where tenant_id=$1 and aggregate_id=$2 and event_type in ('views.booking.created','views.booking.confirmed')",
    [fixture.tenantId,fixture.bookingId]
  )).rows[0].n;
  if(audits<2||outbox<2)throw new Error('restored_audit_or_outbox_incomplete');

  const migrations=(await client.query('select name,sha256 from vision_private.schema_migrations order by name')).rows;
  if(migrations.length!==expectedMigrationCount||migrations.at(-1)?.name!==release.databaseMigration)throw new Error('restored_migration_history_mismatch');

  const rlsSql="select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname=any($1::text[]) order by relname";
  const rls=(await client.query(rlsSql,[['vision_views_bookings','vision_views_units','vision_views_cleaning_jobs','vision_views_inventory_nights','vision_event_inbox']])).rows;
  if(rls.length!==5||rls.some(row=>row.relrowsecurity!==true))throw new Error('restored_rls_mismatch');

  await client.query('begin');
  try{
    await client.query('set local role authenticated');
    let denied=false;
    try{await client.query('select * from public.vision_event_inbox limit 1');}
    catch(error){denied=/permission denied/i.test(error.message);}
    if(!denied)throw new Error('restored_inbox_access_not_denied');
  }finally{await client.query('rollback');}

  const report={
    status:'PASS',syntheticOnly:true,latestMigration:readiness.latest_migration,
    architectureVersion:readiness.architecture_version,bookingId:fixture.bookingId,
    bookingStatus:booking.status,inboxStatus:inbox.status,auditEvents:audits,outboxEvents:outbox,
    migrationCount:migrations.length,rlsTables:rls.map(row=>row.relname),endUserInboxReadDenied:true
  };
  const output=process.argv[3]||'artifacts/rc2/restore-verification.json';
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await client.end();}
