'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 6 connects My Day to an RLS-scoped read-only Work Feed',()=>{
  const design=JSON.parse(read('vision/design/interface-system-6.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  assert.equal(design.version,'6.0');
  assert.equal(design.endpoint,'/api/v1/work-feed');
  assert.equal(design.behavior.readOnly,true);
  assert.equal(design.behavior.approvalDecisionsEnabled,false);
  assert.equal(design.behavior.fabricatedMetrics,false);
  assert.equal(design.safety.activeModule,'views');
  assert.equal(design.safety.additiveMigrationOnly,true);
  assert.equal(assembly.architectureVersion,'2.0');
  assert.equal(assembly.database.latestMigration,'0015_background_runtime.sql');
  assert.equal(assembly.designSystem.experienceIteration,'10.0');
  assert.equal(assembly.designSystem.workCenter.workFeedReadOnly,true);
});

test('Interface 6 read feed primitives remain available under Interface 7',()=>{
  const work=read('vision/platform/work-center.js');
  const views=read('vision/platform/views-ops.js');
  const css=read('vision/platform/work-center.css');
  assert.match(views,/async function workFeed\(limit=50\)/);
  assert.match(views,/\/api\/v1\/work-feed\?limit=/);
  assert.match(work,/VertexVisionViews\.workFeed\(50\)/);
  assert.match(work,/feed\.tasks/);
  assert.match(work,/feed\.approvals/);
  assert.match(work,/feed\.attention/);
  assert.match(work,/feed\.requests/);
  assert.match(work,/feed\.approvals/);
  assert.match(css,/Interface System 6\.0/);
  assert.match(css,/\.vvw-priority-critical/);
});

test('Unified Work Feed migration is additive and direct approval writes stay revoked',()=>{
  const sql=read('vision/database/migrations/0012_unified_work_feed.sql');
  assert.match(sql,/create table public\.vision_approval_requests/);
  assert.match(sql,/alter table public\.vision_approval_requests enable row level security/);
  assert.match(sql,/revoke all on public\.vision_approval_requests from public,anon,authenticated/);
  assert.match(sql,/grant select on public\.vision_approval_requests to authenticated/);
  assert.match(sql,/create function public\.vision_work_feed/);
  assert.doesNotMatch(sql,/drop table|truncate|alter table .* drop column/i);
});
