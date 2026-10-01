'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 7 implements server-authoritative task and approval actions',()=>{
  const design=JSON.parse(read('vision/design/interface-system-7.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  assert.equal(design.version,'7.0');
  assert.equal(design.focus,'Task Lifecycle / Assignment / SLA / Approval Decisions');
  assert.equal(design.controls.idempotency,true);
  assert.equal(design.controls.expectedVersion,true);
  assert.equal(design.controls.serverPermissionCheck,true);
  assert.equal(design.controls.selfApprovalForbidden,true);
  assert.equal(design.refresh.pushSubscription,false);
  assert.equal(assembly.architectureVersion,'2.0');
  assert.equal(assembly.database.latestMigration,'0015_background_runtime.sql');
  assert.equal(assembly.designSystem.experienceIteration,'9.0');
  assert.equal(assembly.designSystem.workCenter.approvalDecisionsEnabled,true);
  assert.equal(assembly.designSystem.workCenter.refreshMode,'polling-30s-not-push');
});

test('Work Center renders actions only from server-provided action arrays and SLA states',()=>{
  const work=read('vision/platform/work-center.js');
  const views=read('vision/platform/views-ops.js');
  const css=read('vision/platform/work-center.css');
  assert.match(views,/async function workCommand\(type,fields=\{\}\)/);
  assert.match(views,/async function workAssignees\(\)/);
  assert.match(work,/item\.actions/);
  assert.match(work,/data-vvw-action/);
  assert.match(work,/expected_order_version/);
  assert.match(work,/approval_approve/);
  assert.match(work,/quality_reject/);
  assert.match(work,/refreshMode:'polling-30s'/);
  assert.match(css,/Interface System 7\.0/);
  assert.match(css,/\.vvw-sla-breached/);
  assert.match(css,/\.vvw-work-actions/);
});

test('Work Actions migration is additive and keeps direct client writes revoked',()=>{
  const sql=read('vision/database/migrations/0013_work_actions.sql');
  assert.match(sql,/create function public\.vision_work_command/);
  assert.match(sql,/create function public\.vision_work_assignees/);
  assert.match(sql,/vision_command_receipts/);
  assert.match(sql,/vision_audit_events/);
  assert.match(sql,/vision_outbox_events/);
  assert.match(sql,/requested_by<>actor/);
  assert.doesNotMatch(sql,/drop table|truncate|alter table .* drop column/i);
});
