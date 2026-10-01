'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 10 defines factual System Status Center',()=>{
  const design=JSON.parse(read('vision/design/interface-system-10.0.json'));
  assert.equal(design.version,'10.0');
  assert.equal(design.focus,'System Status / Operations Control Center');
  assert.equal(design.endpoint,'/system-status');
  assert.equal(design.privacy.secretsExposed,false);
  assert.equal(design.ui.fabricatedFallback,false);
  assert.equal(design.safety.productionChanged,false);
  assert.equal(design.safety.backgroundConnectedByDefault,false);
});

test('System Status runtime is built after shell and exposes a Hub action',()=>{
  const build=read('vision/platform/build.cjs');
  const shell=read('vision/platform/shell.js');
  const js=read('vision/platform/system-status-center.js');
  const css=read('vision/platform/system-status-center.css');
  assert.match(build,/system-status-center\.js','vision-system-status\.js'/);
  assert.match(build,/system-status-center\.css','vision-system-status\.css'/);
  assert.match(build,/UI_CACHE_SUFFIX='interface-11'/);
  assert.match(shell,/visionUi='11\.0'/);
  assert.match(shell,/Interface 14\.0/);
  assert.match(js,/fetch\('\/system-status'/);
  assert.match(js,/data-vv-system-status/);
  assert.match(js,/Secrets, tokens, and connection strings are never displayed here/);
  assert.match(css,/Interface System 10\.0/);
  assert.match(css,/safe-area-inset-bottom/);
});

test('System Status endpoint is unauthenticated metadata-only and does not leak config secrets',()=>{
  const worker=read('vision/backend/worker.mjs');
  const dto=read('vision/backend/system-status.mjs');
  assert.match(worker,/url\.pathname==='\/system-status'/);
  assert.match(worker,/projectSystemStatus/);
  assert.match(dto,/backendConfigured/);
  assert.match(dto,/backgroundConsumerConnected/);
  assert.doesNotMatch(dto,/database_url|password|private_key|service_role/i);
});
