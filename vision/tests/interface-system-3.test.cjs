'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 3 contract preserves safe product boundaries',()=>{
  const design=JSON.parse(read('vision/design/interface-system-3.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  assert.equal(design.version,'3.0');
  assert.equal(design.style,'Dark Premium Tech Sand');
  assert.deepEqual(design.boundaries.active,['views']);
  assert.equal(design.boundaries.comingSoonCount,18);
  assert.equal(design.boundaries.jarvis,'separate-project-api-only');
  assert.equal(design.boundaries.productionMasterChanged,false);
  assert.equal(assembly.designSystem.experienceIteration,'6.0');
  assert.equal(assembly.designSystem.experienceStyle,'Dark Premium Tech Sand');
});

test('Hub implements grouped categories, Today rail and line icon system',()=>{
  const shell=read('vision/platform/shell.js');
  const css=read('vision/platform/shell.css');
  for(const label of ['hospitality-stays','property-engineering','travel-mobility','guest-services','technology-capital'])
    assert.ok(shell.includes(label),label);
  assert.match(shell,/vv-today/);
  assert.match(shell,/vv-category-grid/);
  assert.match(shell,/iconMarkup/);
  assert.match(shell,/ARCHITECTURE READY/);
  assert.match(css,/\.vv-workspace/);
  assert.match(css,/\.vv-today/);
  assert.match(css,/\.vv-category-grid/);
  assert.match(css,/\.vv-card-icon svg/);
  assert.match(css,/@media\(max-width:430px\)/);
});

test('Views keeps functional tabs while using dark premium operational theme',()=>{
  const css=read('vision/platform/views-ops.css');
  const js=read('vision/platform/views-ops.js');
  for(const tab of ['dashboard','calendar','bookings','units','cleaning'])
    assert.ok(js.includes("'"+tab+"'"),tab);
  assert.match(css,/Interface System 3\.0 — dark premium Views workspace/);
  assert.match(css,/--vvo-bg:#0f1412/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/prefers-reduced-motion/);
});
