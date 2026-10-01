'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 5 Work Center contract stays honest and Views-safe',()=>{
  const design=JSON.parse(read('vision/design/interface-system-5.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  assert.equal(design.version,'5.0');
  assert.equal(design.focus,'My Day / Work Center');
  assert.equal(design.sources.workFeed,'not-connected');
  assert.equal(design.sources.approvalFeed,'not-connected');
  assert.equal(design.sources.requestFeed,'not-connected');
  assert.equal(design.behavior.fabricatedMetrics,false);
  assert.equal(design.safety.activeModule,'views');
  assert.equal(design.safety.futureModulesOperational,false);
  assert.equal(design.safety.productionChanged,false);
  assert.equal(assembly.designSystem.experienceIteration,'8.0');
  assert.equal(assembly.designSystem.workCenter.fabricatedMetrics,false);
  assert.equal(assembly.designSystem.workCenter.workFeedEndpoint,'/api/v1/work-feed');
  assert.equal(assembly.designSystem.workCenter.workFeedReadOnly,true);
});

test('Work Center ships as separate runtime assets and preserves server-authoritative Views permissions',()=>{
  const build=read('vision/platform/build.cjs');
  const work=read('vision/platform/work-center.js');
  const css=read('vision/platform/work-center.css');
  assert.match(build,/work-center\.js','vision-work-center\.js'/);
  assert.match(build,/work-center\.css','vision-work-center\.css'/);
  assert.match(build,/UI_CACHE_SUFFIX='interface-8'/);
  assert.match(work,/VertexVisionViews\?\.status/);
  assert.match(work,/function feedConnected\(\)/);
  assert.match(work,/approvalDecisionsEnabled:/);
  assert.match(work,/workFeed\(50\)/);
  assert.doesNotMatch(work,/Math\.random|demoCount|fakeCount|syntheticTask/i);
  assert.match(css,/\.vvw-dialog/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/prefers-reduced-motion/);
});

test('Hub exposes My Day without activating future modules',()=>{
  const shell=read('vision/platform/shell.js');
  const registry=require('../platform/registry.cjs');
  assert.match(shell,/vvWorkCenter='hero'/);
  assert.match(shell,/vvWorkCenter='today'/);
  assert.match(shell,/openWorkCenter/);
  assert.deepEqual(registry.modules.filter(m=>m.status==='active').map(m=>m.id),['views']);
  assert.equal(registry.modules.filter(m=>m.status==='coming-soon').length,18);
});
