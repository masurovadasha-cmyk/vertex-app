'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 4 navigation contract is non-sensitive and Views-safe',()=>{
  const design=JSON.parse(read('vision/design/interface-system-4.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  assert.equal(design.version,'4.0');
  assert.equal(design.focus,'Navigation Intelligence');
  assert.equal(design.features.commandPalette.scope,'module registry only');
  assert.equal(design.features.recentModules.sensitiveData,false);
  assert.equal(design.features.favorites.sensitiveData,false);
  assert.equal(design.safety.activeModule,'views');
  assert.equal(design.safety.futureModulesOperational,false);
  assert.equal(design.safety.productionChanged,false);
  assert.equal(assembly.designSystem.experienceIteration,'5.0');
  assert.equal(assembly.designSystem.navigationIntelligence.localFavorites,true);
  assert.equal(assembly.designSystem.navigationIntelligence.localRecents,true);
  assert.equal(assembly.designSystem.navigationIntelligence.sensitiveDataStored,false);
});

test('command palette, recents and favorites are implemented with safe local preferences',()=>{
  const shell=read('vision/platform/shell.js');
  const css=read('vision/platform/shell.css');
  assert.match(shell,/visionCommandPalette/);
  assert.match(shell,/vertex\.vision\.preferences\.v1/);
  assert.match(shell,/function openPalette\(\)/);
  assert.match(shell,/function rememberRecent\(id\)/);
  assert.match(shell,/function toggleFavorite\(id\)/);
  assert.match(shell,/data-vv-favorite/);
  assert.match(shell,/Cmd\+K/);
  assert.match(css,/\.vv-palette/);
  assert.match(css,/\.vv-mini-link/);
  assert.match(css,/\.vv-favorite-button/);
  assert.match(css,/Interface System 4\.0/);
});

test('Interface 4 does not create operational actions for future modules',()=>{
  const registry=require('../platform/registry.cjs');
  assert.deepEqual(registry.modules.filter(m=>m.status==='active').map(m=>m.id),['views']);
  assert.equal(registry.modules.filter(m=>m.status==='coming-soon').length,18);
  assert.ok(registry.modules.filter(m=>m.status!=='active').every(m=>m.actions.length===0));
});
