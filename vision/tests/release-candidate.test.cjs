'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../platform/registry.cjs');
const manifest=JSON.parse(fs.readFileSync('vision/release/0.1-RC1.json','utf8'));

test('RC manifest matches canonical VISION registry',()=>{
  assert.equal(manifest.product,'VERTEX Vision');
  assert.equal(manifest.release,'0.1-RC1');
  assert.equal(manifest.platformVersion,core.version);
  assert.deepEqual(manifest.activeModules,core.modules.filter(m=>m.status==='active').map(m=>m.id));
  assert.deepEqual([...manifest.comingSoonModules].sort(),core.modules.filter(m=>m.status==='coming-soon').map(m=>m.id).sort());
  assert.equal(manifest.productionApproved,false);
  assert.equal(manifest.productionReady,false);
  assert.equal(manifest.jarvisIntegration,'external-api-only');
});

test('RC future modules expose icons but no launch actions',()=>{
  for(const module of core.modules){
    assert.equal(typeof module.icon,'string');
    assert.ok(module.icon.length>0);
    if(module.id!=='views'){
      assert.equal(module.status,'coming-soon');
      assert.deepEqual(module.actions,[]);
      assert.equal(core.canLaunch(module.id,'host'),false);
    }
  }
});

test('RC migration encodes one active Views release state',()=>{
  const sql=fs.readFileSync('vision/database/migrations/0006_views_active_release_state.sql','utf8');
  assert.match(sql,/when id='views' then 'ACTIVE' else 'COMING_SOON'/);
  assert.match(sql,/vision_single_active_release_module/);
  assert.match(sql,/where release_state='ACTIVE'/);
});
