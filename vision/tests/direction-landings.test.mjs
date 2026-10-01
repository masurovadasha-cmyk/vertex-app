import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import core from '../platform/registry.cjs';

test('every registered VERTEX VISION direction has a landing interface model',async()=>{
  const shell=await readFile(new URL('../platform/shell.js',import.meta.url),'utf8');
  assert.equal(core.modules.length,19);
  const experienceBlock=shell.slice(shell.indexOf('const moduleExperience='),shell.indexOf('const request=id=>'));
  for(const module of core.modules){
    const plain=module.id+':{',quoted="'"+module.id+"':{";
    assert.ok(experienceBlock.includes(plain)||experienceBlock.includes(quoted),module.id+' must have a module experience');
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


test('Mobile Shell 13 exposes seven safe role-entry previews without browser-owned authorization',async()=>{
  const shell=await readFile(new URL('../platform/shell.js',import.meta.url),'utf8');
  for(const id of ['guest','driver','hotel-staff','restaurant-staff','admin','owner','partner'])assert.ok(shell.includes("'"+id+"'"),id+' role entry missing');
  assert.match(shell,/dataset\.visionUi='13\.0'/);
  assert.match(shell,/Authentication is not enabled yet/);
  assert.doesNotMatch(shell,/localStorage\.setItem\([^\n]*role/i);
});
