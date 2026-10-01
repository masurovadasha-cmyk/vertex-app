'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 2.0 metadata is wired to the approved Canva source',()=>{
  const design=JSON.parse(read('vision/design/interface-system-2.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  assert.equal(design.source.designId,'DAHWuG0D0xk');
  assert.equal(design.version,'2.0');
  assert.equal(assembly.designSystem.version,'2.0');
  assert.equal(assembly.designSystem.canvaDesignId,'DAHWuG0D0xk');
  assert.deepEqual(assembly.modules.active,['views']);
  assert.equal(assembly.modules.comingSoonCount,18);
});

test('Tech Sand runtime styles keep readable interaction and responsive mobile navigation',()=>{
  const hub=read('vision/platform/shell.css');
  const views=read('vision/platform/views-ops.css');
  assert.match(hub,/--vv-gold:#cdb276/);
  assert.match(hub,/\.vv-card-active/);
  assert.match(hub,/focus-visible/);
  assert.match(hub,/prefers-reduced-motion/);
  assert.match(views,/min-height:44px/);
  assert.match(views,/grid-template-rows:auto 1fr auto/);
  assert.match(views,/safe-area-inset-bottom/);
  assert.match(views,/prefers-reduced-motion/);
});

test('VISION runtime advances to Interface 11 while preserving Views-only activation',()=>{
  const shell=read('vision/platform/shell.js');
  const registry=read('vision/platform/registry.cjs');
  assert.match(shell,/visionUi='11\.0'/);
  assert.match(shell,/Interface 11\.0/);
  assert.match(shell,/String\(event\.key\)\.toLowerCase\(\)==='k'/);
  assert.match(registry,/REVISION='vision-interface-11-rc1'/);
  assert.match(read('vision/platform/build.cjs'),/UI_CACHE_SUFFIX='interface-11'/);
  assert.match(registry,/const status=id==='views'\?'active':'coming-soon'/);
});

test('Cloudflare Worker Previews are configured without changing production routing',()=>{
  const cfg=JSON.parse(read('wrangler.jsonc'));
  assert.equal(cfg.name,'vertex-app');
  assert.equal(cfg.preview_urls,true);
  assert.deepEqual(cfg.previews,{});
  assert.equal(cfg.assets.binding,'ASSETS');
  assert.ok(cfg.assets.run_worker_first.includes('/health'));
  assert.equal(Object.prototype.hasOwnProperty.call(cfg,'routes'),false);
});
