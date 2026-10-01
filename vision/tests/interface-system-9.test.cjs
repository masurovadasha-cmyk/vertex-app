'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 9 advances background runtime without connecting production',()=>{
  const design=JSON.parse(read('vision/design/interface-system-9.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  const release=JSON.parse(read('vision/release/0.1-RC1.json'));
  assert.equal(design.version,'9.0');
  assert.equal(design.runtime.productionConnected,false);
  assert.equal(design.runtime.notificationConsumer,'prepared-not-connected');
  assert.equal(design.runtime.escalationScheduler,'prepared-not-connected');
  assert.equal(assembly.architectureVersion,'2.1');
  assert.equal(assembly.database.latestMigration,'0016_staging_session_activation.sql');
  assert.equal(assembly.database.migrationsExpected,15);
  assert.equal(assembly.designSystem.experienceIteration,'11.0');
  assert.equal(release.databaseMigration,'0016_staging_session_activation.sql');
  assert.equal(release.architectureVersion,'2.1');
  assert.equal(release.productionApproved,false);
  assert.equal(release.productionReady,false);
});

test('background migration keeps browser roles away from dispatcher and scheduler RPCs',()=>{
  const sql=read('vision/database/migrations/0016_staging_session_activation.sql');
  assert.match(sql,/create function public\.vision_outbox_fail\(event uuid, token uuid\)/);
  assert.match(sql,/create function public\.vision_background_scopes\(p_limit integer default 100\)/);
  assert.match(sql,/revoke all on function public\.vision_outbox_fail\(uuid,uuid\) from public,anon,authenticated/);
  assert.match(sql,/revoke all on function public\.vision_background_scopes\(integer\) from public,anon,authenticated/);
  assert.match(sql,/latest='0015_background_runtime\.sql'/);
  assert.match(sql,/architecture_version','2\.0'/);
  assert.doesNotMatch(sql,/grant execute on function public\.vision_(?:outbox_fail|background_scopes).*authenticated/i);
});
