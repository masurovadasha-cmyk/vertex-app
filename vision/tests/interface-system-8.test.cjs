'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 8 defines notification and escalation foundation without fake realtime',()=>{
  const design=JSON.parse(read('vision/design/interface-system-8.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  assert.equal(design.version,'8.0');
  assert.equal(design.focus,'Notifications / Escalations / Event-driven Work Updates');
  assert.equal(design.eventConsumer.connected,false);
  assert.equal(design.escalationScheduler.connected,false);
  assert.equal(design.refresh.pushSubscription,false);
  assert.equal(design.controls.serverDerivedEscalationAck,true);
  assert.equal(design.safety.fabricatedEvents,false);
  assert.equal(assembly.architectureVersion,'2.0');
  assert.equal(assembly.database.latestMigration,'0015_background_runtime.sql');
  assert.equal(assembly.designSystem.experienceIteration,'9.0');
  assert.equal(assembly.designSystem.notifications.refreshMode,'polling-30s-not-push');
});

test('Notification Center is a separate responsive runtime and Hub exposes it',()=>{
  const build=read('vision/platform/build.cjs');
  const shell=read('vision/platform/shell.js');
  const js=read('vision/platform/notifications-center.js');
  const css=read('vision/platform/notifications-center.css');
  assert.match(build,/notifications-center\.js','vision-notifications\.js'/);
  assert.match(build,/notifications-center\.css','vision-notifications\.css'/);
  assert.match(build,/UI_CACHE_SUFFIX='interface-8'/);
  assert.match(shell,/vvNotifications='hero'/);
  assert.match(shell,/openNotifications/);
  assert.match(js,/notificationFeed\(50\)/);
  assert.match(js,/notificationCommand\(type,fields\)/);
  assert.match(js,/refreshMode:'polling-30s'/);
  assert.match(js,/eventConsumerConnected:false/);
  assert.match(css,/Interface System 8\.0/);
  assert.match(css,/safe-area-inset-bottom/);
});

test('Notifications migration is additive, RLS protected and consumer functions are not client-granted',()=>{
  const sql=read('vision/database/migrations/0014_notifications_escalations.sql');
  assert.match(sql,/create table public\.vision_notifications/);
  assert.match(sql,/create table public\.vision_escalations/);
  assert.match(sql,/alter table public\.vision_notifications enable row level security/);
  assert.match(sql,/alter table public\.vision_escalations enable row level security/);
  assert.match(sql,/revoke all on function public\.vision_notification_consume/);
  assert.match(sql,/revoke all on function public\.vision_reconcile_escalations/);
  assert.match(sql,/create function public\.vision_notification_command/);
  assert.doesNotMatch(sql,/drop table|truncate\s+(?:table\s+)?public\.|alter table .* drop column/i);
});
