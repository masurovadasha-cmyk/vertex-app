import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../backend/migrate.mjs';
import core from '../platform/registry.cjs';

const root=path.resolve(import.meta.dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));

test('Engineers is a detached external product contract, not an embedded VISION runtime',()=>{
  const manifest=read('modules/engineers/manifest.json');
  assert.equal(manifest.id,'engineers');
  assert.equal(manifest.version,'0.2.0');
  assert.equal(manifest.integration.type,'external-api');
  assert.equal(manifest.integration.databaseAccess,'none');
  assert.equal(manifest.integration.privateSchema,false);
  assert.equal(manifest.integration.connected,false);
  assert.equal(manifest.integration.sourceOfTruth,'vertex-engineers-core');
});

test('Engineers integration requires delegated identity and idempotent mutations before activation',()=>{
  const contract=read('contracts/engineers-integration-v1.json');
  assert.equal(contract.version,1);
  assert.equal(contract.transport.basePath,'/api/v1/engineers');
  assert.equal(contract.authentication.type,'delegated-identity');
  assert.equal(contract.authentication.databaseCredentialsFromVision,false);
  assert.equal(contract.endpoints.createProject.idempotencyRequired,true);
  assert.equal(contract.endpoints.createWorkOrder.idempotencyRequired,true);
  assert.equal(contract.responseRules.sourceOfTruth,'vertex-engineers-core');
  assert.equal(contract.activation.state,'not-connected');
  assert.equal(contract.activation.enableByDefault,false);
});

test('Engineers events carry tenant, organization, event and correlation identifiers',()=>{
  const events=read('contracts/engineers-events-v1.json');
  for(const key of ['event_id','tenant_id','organization_id','correlation_id','occurred_at'])assert.ok(events.shared_required.includes(key));
  assert.equal(events.delivery,'at-least-once');
  assert.equal(events.consumer_rule,'deduplicate_by_event_id');
  assert.ok(events.events['engineers.maintenance.requested']);
});

test('VISION registry keeps Engineers planned and external with no launch action or private schema',()=>{
  const engineers=core.module('engineers');
  assert.ok(engineers);
  assert.equal(engineers.version,'0.2.0');
  assert.equal(engineers.mode,'planned');
  assert.equal(engineers.backend,'external-contract');
  assert.equal(engineers.cloudEnabled,false);
  assert.deepEqual(engineers.actions,[]);
  assert.equal(engineers.integration.databaseAccess,'none');
  assert.equal(engineers.integration.connected,false);
  assert.equal(engineers.dataBoundary.privateSchema,null);
  assert.equal(core.canLaunch('engineers','engineering-request'),false);
});

test('Engineers registration migration defines gateway scopes without enabling an installation',()=>{
  const sql=fs.readFileSync(path.join(root,'database/migrations/0006_engineers_module_v0_2.sql'),'utf8');
  assert.match(sql,/engineers\.dashboard\.read/);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.vision_module_installations/i);
  assert.doesNotMatch(sql,/update\s+public\.vision_module_installations/i);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.vision_role_permissions/i);
});

test('migrated database registers Engineers 0.2 without installations or grants',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated;');
  await migrate(db);
  const definition=(await db.query("select id,name,version from public.vision_module_definitions where id='engineers'")).rows[0];
  assert.deepEqual(definition,{id:'engineers',name:'VERTEX Engineers',version:'0.2.0'});
  assert.equal((await db.query("select count(*)::int n from public.vision_module_installations where module_id='engineers'")).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from public.vision_permissions where code like 'engineers.%'")).rows[0].n,15);
  assert.equal((await db.query("select count(*)::int n from public.vision_role_permissions rp join public.vision_permissions p on p.id=rp.permission_id where p.code like 'engineers.%'")).rows[0].n,0);
});
