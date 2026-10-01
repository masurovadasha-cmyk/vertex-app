'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Interface System 11 defines real staging sign-in without demo fallback',()=>{
  const design=JSON.parse(read('vision/design/interface-system-11.0.json'));
  const assembly=JSON.parse(read('vision/assembly/manifest.json'));
  const release=JSON.parse(read('vision/release/0.1-RC1.json'));
  assert.equal(design.version,'11.0');
  assert.equal(design.focus,'Staging Sign-in / Session Activation / Server-authoritative Workspace Discovery');
  assert.equal(design.auth.accessTokenPersistence,'memory-only');
  assert.equal(design.auth.passwordPersistence,false);
  assert.equal(design.auth.refreshTokenPersistence,false);
  assert.equal(design.scopeDiscovery.clientSuppliedPermissionsTrusted,false);
  assert.equal(design.safety.demoSignInFallback,false);
  assert.equal(assembly.architectureVersion,'2.3');
  assert.equal(assembly.database.latestMigration,'0019_external_module_delegation.sql');
  assert.equal(assembly.database.migrationsExpected,19);
  assert.equal(assembly.designSystem.experienceIteration,'11.0');
  assert.equal(release.platformVersion,'1.18-rc1');
  assert.equal(release.productionReady,false);
});

test('Session Center is separate, memory-only and activates existing Views context',()=>{
  const build=read('vision/platform/build.cjs');
  const shell=read('vision/platform/shell.js');
  const js=read('vision/platform/session-center.js');
  const css=read('vision/platform/session-center.css');
  assert.match(build,/session-center\.js','vision-session\.js'/);
  assert.match(build,/session-center\.css','vision-session\.css'/);
  assert.match(build,/UI_CACHE_SUFFIX='interface-11'/);
  assert.match(shell,/visionUi='14\.0'/);
  assert.match(shell,/Interface 14\.0/);
  assert.match(js,/\/auth-config/);
  assert.match(js,/\/api\/v1\/session-scopes/);
  assert.match(js,/VertexVisionViews\.configure/);
  assert.match(js,/persistence:'memory-only'/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
  assert.doesNotMatch(js,/refresh_token\s*=|state\.refresh/i);
  assert.match(css,/Interface System 11\.0/);
  assert.match(css,/safe-area-inset-bottom/);
});

test('session activation migration grants discovery only to authenticated',()=>{
  const sql=read('vision/database/migrations/0016_staging_session_activation.sql');
  assert.match(sql,/create function public\.vision_session_scopes\(\)/);
  assert.match(sql,/revoke all on function public\.vision_session_scopes\(\) from public,anon/);
  assert.match(sql,/grant execute on function public\.vision_session_scopes\(\) to authenticated/);
  assert.match(sql,/vision_private\.views_module_enabled/);
  assert.match(sql,/vision_guest_links/);
  assert.match(sql,/vision_membership_roles/);
  assert.match(sql,/latest='0016_staging_session_activation\.sql'/);
  assert.match(sql,/architecture_version','2\.1'/);
});
