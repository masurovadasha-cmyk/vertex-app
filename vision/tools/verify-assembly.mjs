import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const controllerRoot=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const root=process.env.VISION_CANDIDATE_ROOT?path.resolve(process.env.VISION_CANDIDATE_ROOT):controllerRoot;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const exists=p=>fs.existsSync(path.join(root,p));
const assembly=json('vision/assembly/manifest.json');
const release=json(assembly.releaseManifest);
const safety=json('vision/production/safety-manifest.json');
const rollback=json('vision/production/rollback-plan.json');
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
assert.ok(staging.assets?.run_worker_first?.includes('/readyz'));
assert.ok(staging.assets?.run_worker_first?.includes('/system-status'));
assert.ok(prod.assets?.run_worker_first?.includes('/readyz'));
assert.equal(assembly.runtimes.productionWorker.approved,false);
assert.equal(release.productionApproved,false);
assert.equal(release.productionReady,false);
assert.equal(release.jarvisIntegration,'external-api-only');
assert.equal(assembly.boundaries.jarvis,'separate-project-external-api-only');

assert.match(gradle,new RegExp("applicationId\\s+'"+assembly.runtimes.android.packageId.replaceAll('.','\\.')+"'"));
assert.match(gradle,new RegExp("versionName\\s+'"+assembly.runtimes.android.versionName.replaceAll('.','\\.')+"'"));
assert.match(gradle,new RegExp('versionCode\\s+'+assembly.runtimes.android.versionCode+'\\b'));

for(const asset of ['vision-core.js','vision-views.js','vision-work-center.js','vision-notifications.js','vision-shell.js','vision-system-status.js']){
  assert.ok(index.includes('src="'+asset+'"'),'missing generated runtime '+asset);
}
for(const asset of ['vision-views.css','vision-work-center.css','vision-notifications.css','vision-shell.css','vision-system-status.css']){
  assert.ok(index.includes('href="'+asset+'"'),'missing generated stylesheet '+asset);
}
const requiredComponents=Object.freeze([
  'package.json',
  'vision/package.json',
  'vision/pnpm-lock.yaml',
  'vision/platform/registry.cjs',
  'vision/platform/views-ops.js',
  'vision/backend/worker.mjs',
  'vision/backend/kernel.mjs',
  'vision/backend/readiness.mjs',
  'vision/backend/system-status.mjs',
  'vision/modules/views/command-contract.mjs',
  'vision/modules/views/response-contract.mjs',
  'vision/modules/views/manifest.json',
  'vision/database/migrations/0007_views_operations.sql',
  'vision/database/migrations/0008_views_integrity.sql',
  'vision/database/migrations/0009_application_kernel.sql',
  'vision/database/migrations/0010_runtime_readiness.sql',
  'vision/database/migrations/0011_event_inbox.sql',
  'vision/database/migrations/0012_unified_work_feed.sql',
  'vision/database/migrations/0013_work_actions.sql',
  'vision/database/migrations/0014_notifications_escalations.sql',
  'vision/contracts/work-feed.mjs',
  'vision/contracts/work-command.mjs',
  'vision/contracts/work-assignees.mjs',
  'vision/contracts/notification-feed.mjs',
  'vision/contracts/notification-command.mjs',
  'vision/platform/work-center.js',
  'vision/platform/work-center.css',
  'vision/platform/notifications-center.js',
  'vision/platform/notifications-center.css',
  'vision/platform/system-status-center.js',
  'vision/platform/system-status-center.css',
  'vision/staging/auth.mjs',
  'vision/staging/provision.mjs',
  'vision/staging/cloud-e2e.mjs',
  'vision/production/check-migration-safety.mjs',
  'vision/production/build-n-minus-one-baseline.mjs',
  'vision/production/check-n-minus-one-compatibility.mjs',
  'vision/production/preflight.mjs',
  'vision/production/check-backup-principal.mjs',
  'vision/production/seed-restore-fixture.mjs',
  'vision/production/verify-restore.mjs',
  'vision/production/verify-production-restore.mjs',
  'vision/production/safety-manifest.json',
  'vision/production/rollback-plan.json',
  'vision/production/promotion-policy.json',
  'vision/production/evaluate-promotion.mjs',
  '.github/workflows/vision-assembly.yml',
  '.github/workflows/vision-cloud-e2e.yml',
  '.github/workflows/vision-staging-deploy.yml',
  '.github/workflows/vision-rc2-safety.yml',
  '.github/workflows/vision-production-backup-restore.yml',
  '.github/workflows/vision-promotion-gate.yml',
  '.github/workflows/build-android-apk.yml',
  'docs/architecture/ADR-013-trusted-release-controller.md',
  'docs/architecture/TARGET-ARCHITECTURE-1.0.md'
]);
assert.equal(new Set(requiredComponents).size,requiredComponents.length,'assembly component list must be unique');
for(const required of requiredComponents)assert.ok(exists(required),'missing assembly component '+required);

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
assert.equal(assembly.externalGates.realStagingAuthE2E.required,true);
assert.equal(assembly.externalGates.realStagingAuthE2E.verified,false);
assert.equal(assembly.externalGates.realStagingAuthE2E.productionChanged,false);
assert.equal(release.realStagingE2E.cloudVerified,false);
assert.equal(release.realStagingE2E.genuineSupabaseAuthRequired,true);
assert.equal(release.realStagingE2E.directRLSVerification,true);
assert.equal(assembly.readiness.endpoint,'/readyz');
assert.equal(assembly.kernel.systemStatusEndpoint,'/system-status');
assert.equal(release.systemStatus.endpoint,'/system-status');
assert.equal(release.systemStatus.fabricatedFallback,false);
assert.equal(assembly.designSystem.systemStatus.enabled,true);
assert.equal(assembly.designSystem.systemStatus.secretsExposed,false);
assert.equal(assembly.readiness.serviceRoleRequired,false);
assert.equal(release.runtimeReadiness.rpc,'public.vision_runtime_readiness()');
assert.equal(release.trustedReleaseControl.status,'implemented-requires-protected-master-controller');
assert.equal(release.trustedReleaseControl.controllerRef,'refs/heads/master');
assert.equal(release.trustedReleaseControl.candidateControlsPromotionPolicy,false);
assert.equal(release.trustedReleaseControl.productionMutationAllowed,false);
assert.equal(assembly.productionPromotion.trustedController.requiredRef,'refs/heads/master');
assert.equal(assembly.productionPromotion.trustedController.evidenceWorkflowMetadataVerified,true);
assert.equal(assembly.productionPromotion.trustedController.firstPartyActionsPinnedByCommit,true);
assert.equal(assembly.productionSafety.nMinusOneCompatibility,'vision/production/check-n-minus-one-compatibility.mjs');
assert.equal(assembly.productionSafety.ciBackupRestoreDrillRequired,true);
assert.equal(assembly.productionSafety.productionBackupRestoreVerified,false);
assert.equal(assembly.productionSafety.stagingDeployMode,'manual-only');
assert.equal(release.productionSafety.productionBackupRestoreVerified,false);
assert.equal(release.productionSafety.stagingDeployMode,'manual-only');
assert.equal(assembly.productionPromotion.mutationAllowed,false);
assert.equal(assembly.productionPromotion.passed,false);
assert.equal(release.productionPromotion.mutationAllowed,false);
assert.equal(release.productionPromotion.passed,false);
assert.equal(release.productionPromotion.ownerApprovalRequired,true);
assert.equal(release.eventReliability.deliveryModel,'at-least-once');
assert.equal(release.eventReliability.deduplication,'tenant-consumer-event-id');
assert.equal(assembly.reliability.globalExactlyOnce,false);
assert.equal(assembly.productionSafety.productionApproved,false);
assert.equal(release.productionSafety.productionApproved,false);
assert.equal(safety.productionApproved,false);
assert.equal(safety.productionDeployAllowed,false);
assert.equal(safety.databasePolicy.downMigrations,false);
assert.equal(safety.backupPolicy.effectiveReadOnlyPrincipalRequired,true);
assert.equal(safety.releaseControl.trustedControllerRequired,true);
assert.equal(safety.releaseControl.controllerRef,'refs/heads/master');
assert.equal(safety.releaseControl.candidatePolicyAuthority,false);
assert.equal(rollback.databaseRollback.automaticDownMigrations,false);
assert.equal(rollback.approval.explicitOwnerApprovalRequired,true);

const adrDir=path.join(root,'docs/architecture');
const adrFiles=fs.readdirSync(adrDir).filter(name=>/^ADR-\d{3}-.+\.md$/.test(name));
const adrNumbers=adrFiles.map(name=>name.slice(4,7));
assert.equal(new Set(adrNumbers).size,adrNumbers.length,'ADR numbers must be unique');

const rootPkg=json('package.json');
assert.ok(rootPkg.scripts?.['check:vision-assembly']);
assert.ok(rootPkg.scripts?.['build:vision']);
assert.ok(rootPkg.scripts?.['test:vision']);
assert.ok(rootPkg.scripts?.['check:production-safety']);

console.log(JSON.stringify({
  status:'PASS',
  assembly:assembly.assembly,
  architectureVersion:assembly.architectureVersion,
  platformVersion:assembly.platformVersion,
  modules:{active:assembly.modules.active,comingSoon:assembly.modules.comingSoonCount,total:assembly.modules.registryCount},
  migrations:migrations.length,
  productionChanged:false
},null,2));
