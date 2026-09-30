import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const exists=p=>fs.existsSync(path.join(root,p));
const assembly=json('vision/assembly/manifest.json');
const release=json(assembly.releaseManifest);
const core=require(path.join(root,'vision/platform/registry.cjs'));
const prod=json('wrangler.jsonc');
const staging=json('vision/wrangler.jsonc');
const gradle=read('android/app/build.gradle');
const index=read('vertex/dist/index.html');

assert.equal(assembly.product,'VERTEX Vision');
assert.equal(assembly.architectureVersion,release.architectureVersion);
assert.equal(assembly.platformVersion,release.platformVersion);
assert.equal(assembly.apiVersion,release.api);
assert.equal(assembly.database.latestMigration,release.databaseMigration);
assert.deepEqual(assembly.modules.active,release.activeModules);
assert.equal(assembly.modules.registryCount,core.modules.length);
assert.equal(core.modules.filter(m=>m.status==='active').length,assembly.modules.active.length);
assert.deepEqual(core.modules.filter(m=>m.status==='active').map(m=>m.id),assembly.modules.active);
assert.equal(core.modules.filter(m=>m.status==='coming-soon').length,assembly.modules.comingSoonCount);

const migrationDir=path.join(root,'vision/database/migrations');
const migrations=fs.readdirSync(migrationDir).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();
assert.equal(migrations.length,assembly.database.migrationsExpected);
assert.equal(migrations.at(-1),assembly.database.latestMigration);
migrations.forEach((name,i)=>assert.equal(name.slice(0,4),String(i+1).padStart(4,'0')));

assert.equal(staging.name,assembly.runtimes.stagingWorker.name);
assert.equal(prod.name,assembly.runtimes.productionWorker.name);
assert.notEqual(staging.name,prod.name);
assert.equal(staging.vars?.VISION_ENV,'staging');
assert.equal(assembly.runtimes.productionWorker.approved,false);
assert.equal(release.productionApproved,false);
assert.equal(release.productionReady,false);
assert.equal(release.jarvisIntegration,'external-api-only');
assert.equal(assembly.boundaries.jarvis,'separate-project-external-api-only');

assert.match(gradle,new RegExp("applicationId\\s+'"+assembly.runtimes.android.packageId.replaceAll('.','\\.')+"'"));
assert.match(gradle,new RegExp("versionName\\s+'"+assembly.runtimes.android.versionName.replaceAll('.','\\.')+"'"));
assert.match(gradle,new RegExp('versionCode\\s+'+assembly.runtimes.android.versionCode+'\\b'));

for(const asset of ['vision-core.js','vision-views.js','vision-shell.js']){
  assert.ok(index.includes('src="'+asset+'"'),'missing generated runtime '+asset);
}
for(const asset of ['vision-views.css','vision-shell.css']){
  assert.ok(index.includes('href="'+asset+'"'),'missing generated stylesheet '+asset);
}
for(const required of [
  'vision/platform/registry.cjs',
  'vision/platform/views-ops.js',
  'vision/backend/worker.mjs',
  'vision/backend/kernel.mjs',
  'vision/backend/readiness.mjs',
  'vision/modules/views/command-contract.mjs',
  'vision/modules/views/response-contract.mjs',
  'vision/database/migrations/0007_views_operations.sql',
  'vision/database/migrations/0008_views_integrity.sql',
  'vision/database/migrations/0009_application_kernel.sql',
  'vision/database/migrations/0010_runtime_readiness.sql',
  'vision/modules/views/manifest.json',
  'docs/architecture/TARGET-ARCHITECTURE-1.0.md'
]) assert.ok(exists(required),'missing assembly component '+required);

const views=json('vision/modules/views/manifest.json');
assert.equal(views.id,'views');
for(const permission of ['views.operations.read','views.booking.create','views.booking.manage','views.cleaning.execute','views.cleaning.verify'])
  assert.ok(views.permissions.includes(permission),'missing Views permission '+permission);
for(const command of assembly.views.commands)
  assert.ok(release.viewsOperations.commands.includes(command),'release manifest missing command '+command);
assert.equal(release.viewsUI.dataPolicy,'real-staging-only-no-demo-fallback');
assert.equal(assembly.views.demoFallbackInOperations,false);
assert.equal(assembly.kernel.permissionSource,'postgresql-rbac-only');
assert.equal(assembly.kernel.clientPermissionClaimsTrusted,false);
assert.equal(assembly.kernel.organizationScopeRequired,true);
assert.equal(release.viewsReadAPI.organizationScope,'required');
assert.equal(release.applicationKernel.contextEndpoint,'/api/v1/context');
assert.equal(assembly.kernel.commandContract,'vision/modules/views/command-contract.mjs');
assert.deepEqual(assembly.kernel.commandValidationLayers,['api-contract','postgresql-domain']);
assert.equal(release.applicationKernel.commandSchemaVersion,'v1');
assert.equal(assembly.kernel.responseContract,'vision/modules/views/response-contract.mjs');
assert.equal(assembly.kernel.responseProjection,'allowlisted-command-dto');
assert.deepEqual(assembly.kernel.traceHeaders,['X-Request-ID','X-Correlation-ID']);
assert.equal(release.viewsUI.sessionPolicy,'server-authoritative-context-from-verified-jwt');
assert.equal(assembly.readiness.endpoint,'/readyz');
assert.equal(assembly.readiness.serviceRoleRequired,false);
assert.equal(release.runtimeReadiness.rpc,'public.vision_runtime_readiness()');

const rootPkg=json('package.json');
assert.ok(rootPkg.scripts?.['check:vision-assembly']);
assert.ok(rootPkg.scripts?.['build:vision']);
assert.ok(rootPkg.scripts?.['test:vision']);

console.log(JSON.stringify({
  status:'PASS',
  assembly:assembly.assembly,
  architectureVersion:assembly.architectureVersion,
  platformVersion:assembly.platformVersion,
  modules:{active:assembly.modules.active,comingSoon:assembly.modules.comingSoonCount,total:assembly.modules.registryCount},
  migrations:migrations.length,
  productionChanged:false
},null,2));
