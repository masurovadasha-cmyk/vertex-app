import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import core from '../platform/registry.cjs';

test('every registered VERTEX VISION direction has a landing interface model',async()=>{
  const shell=await readFile(new URL('../platform/shell.js',import.meta.url),'utf8');
  assert.equal(core.modules.length,19);
  for(const module of core.modules){
    assert.ok(shell.includes(module.id+':{')||module.id==='aura-design',module.id+' must have a module experience');
  }
  assert.match(shell,/vv-direction-landing/);
  assert.match(shell,/INTERFACE · PREVIEW/);
});

test('landing interfaces do not falsely activate future modules',()=>{
  assert.deepEqual(core.modules.filter(module=>module.status==='active').map(module=>module.id),['views']);
  assert.ok(core.modules.filter(module=>module.id!=='views').every(module=>module.actions.length===0));
  assert.equal(core.module('taxi').integration.type,'external-api');
  assert.equal(core.module('engineers').integration.type,'external-api');
});
