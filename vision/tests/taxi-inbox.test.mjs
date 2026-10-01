import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';

test('Taxi inbound events are deduplicated, server-only and projected without Taxi database access', async t => {
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated;');
  await migrate(db);

  const tenant=randomUUID(), otherTenant=randomUUID(), org=randomUUID(), otherOrg=randomUUID();
  await db.query('insert into public.vision_tenants(id,code,name) values($1,$2,$2)',[tenant,'taxi-inbox-a']);
  await db.query('insert into public.vision_tenants(id,code,name) values($1,$2,$2)',[otherTenant,'taxi-inbox-b']);
  await db.query("insert into public.vision_organizations(id,tenant_id,code,name,kind) values($1,$2,'taxi-a','Taxi A','COMPANY')",[org,tenant]);
  await db.query("insert into public.vision_organizations(id,tenant_id,code,name,kind) values($1,$2,'taxi-b','Taxi B','COMPANY')",[otherOrg,otherTenant]);

  const correlation=randomUUID();
  const at=n=>`2026-10-01T00:0${n}:00.000Z`;
  const event=({
    id=randomUUID(),type='taxi.ride.v1.requested',ride=randomUUID(),aggregate=ride,version=1,
    occurred=at(1),payload={}
  }={})=>({
    event_id:id,
    event_type:type,
    schema_version:1,
    tenant_id:tenant,
    organization_id:org,
    aggregate_id:aggregate,
    aggregate_version:version,
    correlation_id:correlation,
    occurred_at:occurred,
    payload:{ride_id:ride,...payload},
  });
  const receive=async e=>(await db.query(
    'select public.vision_taxi_inbox_receive($1::jsonb) inserted',
    [JSON.stringify(e)]
  )).rows[0].inserted;
  const claim=async()=>{
    const rows=(await db.query("select * from public.vision_inbox_claim('taxi',1)")).rows;
    return rows[0];
  };
  const apply=async row=>(await db.query(
    'select public.vision_taxi_inbox_apply($1,$2) applied',
    [row.event_id,row.lease_token]
  )).rows[0].applied;

  await t.test('receive is idempotent by event_id and conflicting reuse is rejected',async()=>{
    const ride=randomUUID();
    const e=event({ride,payload:{service_class_id:'standard',quote_id:'quote-1'}});
    assert.equal(await receive(e),true);
    assert.equal(await receive(e),false);
    await assert.rejects(
      ()=>receive({...e,payload:{...e.payload,quote_id:'quote-tampered'}}),
      /event_id_conflict/
    );
    assert.equal((await db.query('select count(*)::int n from public.vision_inbox_events')).rows[0].n,1);
    const row=await claim();
    assert.ok(row.lease_token);
    assert.equal(row.attempts,1);
    assert.equal((await db.query("select count(*)::int n from public.vision_inbox_claim('taxi',1)")).rows[0].n,0);
    assert.equal((await db.query(
      'select public.vision_taxi_inbox_apply($1,$2) applied',
      [row.event_id,randomUUID()]
    )).rows[0].applied,false);
    assert.equal(await apply(row),true);
    assert.equal(await apply(row),false);
    const projection=(await db.query(
      'select * from public.vision_taxi_ride_projections where ride_id=$1',[ride]
    )).rows[0];
    assert.equal(projection.status,'REQUESTED');
    assert.equal(projection.status_rank,1);
  });

  await t.test('event-specific payload requirements fail closed',async()=>{
    const ride=randomUUID();
    const bad=event({
      type:'taxi.trip.v1.completed',
      ride,
      aggregate:randomUUID(),
      version:2,
      occurred:at(4),
      payload:{},
    });
    await assert.rejects(()=>receive(bad),/invalid_event_payload/);
  });

  await t.test('normal ride lifecycle reaches COMPLETED and keeps public driver/vehicle references',async()=>{
    const ride=randomUUID(),driver=randomUUID(),vehicle=randomUUID(),trip=randomUUID();
    const events=[
      event({type:'taxi.ride.v1.requested',ride,aggregate:ride,version:1,occurred:at(1),payload:{service_class_id:'standard',quote_id:'q-normal'}}),
      event({type:'taxi.ride.v1.driver_assigned',ride,aggregate:ride,version:2,occurred:at(2),payload:{driver_id:driver,vehicle_id:vehicle}}),
      event({type:'taxi.trip.v1.started',ride,aggregate:trip,version:1,occurred:at(3),payload:{driver_id:driver,started_at:at(3)}}),
      event({type:'taxi.trip.v1.completed',ride,aggregate:trip,version:2,occurred:at(4),payload:{completed_at:at(4)}}),
    ];
    for(const e of events){
      assert.equal(await receive(e),true);
      const row=await claim();
      assert.ok(row);
      assert.equal(await apply(row),true);
    }
    const projection=(await db.query(
      'select * from public.vision_taxi_ride_projections where tenant_id=$1 and organization_id=$2 and ride_id=$3',
      [tenant,org,ride]
    )).rows[0];
    assert.equal(projection.status,'COMPLETED');
    assert.equal(projection.status_rank,4);
    assert.equal(projection.driver_id,driver);
    assert.equal(projection.vehicle_id,vehicle);
    assert.equal(projection.source_aggregate_id,trip);
    assert.equal(Number(projection.source_aggregate_version),2);
    assert.equal(projection.last_event_type,'taxi.trip.v1.completed');
  });

  await t.test('out-of-order delivery cannot regress ride status but can fill missing public references',async()=>{
    const ride=randomUUID(),trip=randomUUID(),driver=randomUUID(),vehicle=randomUUID();
    const completed=event({
      type:'taxi.trip.v1.completed',ride,aggregate:trip,version:2,occurred:at(4),
      payload:{completed_at:at(4)}
    });
    await receive(completed);let row=await claim();await apply(row);
    let projection=(await db.query('select * from public.vision_taxi_ride_projections where ride_id=$1',[ride])).rows[0];
    assert.equal(projection.status,'COMPLETED');
    assert.equal(projection.driver_id,null);

    const assigned=event({
      type:'taxi.ride.v1.driver_assigned',ride,aggregate:ride,version:2,occurred:at(2),
      payload:{driver_id:driver,vehicle_id:vehicle}
    });
    await receive(assigned);row=await claim();await apply(row);
    projection=(await db.query('select * from public.vision_taxi_ride_projections where ride_id=$1',[ride])).rows[0];
    assert.equal(projection.status,'COMPLETED');
    assert.equal(projection.status_rank,4);
    assert.equal(projection.driver_id,driver);
    assert.equal(projection.vehicle_id,vehicle);
    assert.equal(projection.last_event_type,'taxi.trip.v1.completed');
  });

  await t.test('cross-tenant organization envelopes are rejected by database integrity',async()=>{
    const ride=randomUUID();
    const e=event({ride,payload:{service_class_id:'standard',quote_id:'q-cross'}});
    e.organization_id=otherOrg;
    await assert.rejects(()=>receive(e),/foreign key/);
  });

  await t.test('authenticated browser users cannot read inbox/projections or invoke server ingress',async()=>{
    const ride=randomUUID();
    const e=event({ride,payload:{service_class_id:'standard',quote_id:'q-denied'}});
    await db.exec('begin;set local role authenticated;');
    try{
      await assert.rejects(()=>db.query('select * from public.vision_inbox_events'),/permission denied/);
      await assert.rejects(()=>db.query('select * from public.vision_taxi_ride_projections'),/permission denied/);
      await assert.rejects(
        ()=>db.query('select public.vision_taxi_inbox_receive($1::jsonb)',[JSON.stringify(e)]),
        /permission denied/
      );
      await db.exec('rollback');
    }catch(error){
      await db.exec('rollback');
      throw error;
    }
  });
});
