'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 14 contract matches the runtime shell and security boundaries',()=>{
  const design=JSON.parse(read('vision/design/interface-system-14.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  const registry=read('vision/platform/registry.cjs');
  const build=read('vision/platform/build.cjs');
  const shell=read('vision/platform/shell.js');
  assert.equal(design.version,'14.0');
  assert.equal(assembly.designSystem.experienceIteration,'14.0');
  assert.match(registry,/REVISION='vision-interface-14-rc1'/);
  assert.match(build,/UI_CACHE_SUFFIX='interface-14'/);
  assert.match(shell,/dataset\.visionUi='14\.0'/);
  assert.deepEqual(design.modulePolicy.active,['views']);
  assert.equal(design.roleEntry.browserRoleAuthority,false);
  assert.equal(design.roleEntry.serverDerivedAuthority,true);
  assert.equal(design.roleEntry.persistentPrivilegeStorage,false);
  assert.equal(design.security.exactSourceLiveVerification,true);
  assert.equal(design.navigation.orbitalModules.length,7);
  assert.equal(design.navigation.mobileTabs.length,4);
});
