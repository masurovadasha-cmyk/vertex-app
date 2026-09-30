'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('fullstack assets retain exact source bytes and deterministic initialization order',()=>{
 const html=fs.readFileSync('vertex/dist/index.html','utf8');
 for(const [source,built] of [['views-client.cjs','vision-views-client.js'],['views-ops.js','vision-views.js'],['fullstack.css','vision-fullstack.css']]){
  assert.deepEqual(fs.readFileSync('vision/platform/'+source),fs.readFileSync('vertex/dist/'+built));
  assert.deepEqual(fs.readFileSync('vertex/dist/'+built),fs.readFileSync('android/app/src/main/assets/site/'+built));
 }
 const scripts=['vision-design.js','vision-views-client.js','vision-views.js','vision-shell.js'];
 for(const name of scripts)assert.equal(html.split('src="'+name+'"').length-1,1);
 for(let i=1;i<scripts.length;i++)assert.ok(html.indexOf('src="'+scripts[i-1]+'"')<html.indexOf('src="'+scripts[i]+'"'));
});
test('fullstack merge preserves current production-safety gates and all schema files',()=>{
 const assembly=JSON.parse(fs.readFileSync('vision/assembly/manifest.json'));
 const release=JSON.parse(fs.readFileSync('vision/release/0.1-RC1.json'));
 assert.deepEqual(assembly.fullstack,release.fullstack);
 assert.equal(assembly.design.id,'sand-luxury');assert.equal(release.design.id,assembly.design.id);
 assert.equal(assembly.productionSafety.productionApproved,false);
 assert.equal(release.productionSafety.productionApproved,false);
 assert.equal(release.databaseMigration,'0011_event_inbox.sql');
 assert.equal(assembly.externalGates.realStagingAuthE2E.verified,false);
});
