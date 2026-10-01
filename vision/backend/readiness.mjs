// Runtime readiness DTO. It intentionally contains no tenant, user or data-row information.
const migration=/^\d{4}_[a-z0-9_]+\.sql$/;
const fields=['ready','latest_migration','migration_count','tables_ok','functions_ok','rls_ok','views_release_active','architecture_version'];

export function projectRuntimeReadiness(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('upstream_invalid_response');
  if(Object.keys(body).some(key=>!fields.includes(key)))throw new Error('upstream_invalid_response');
  if(typeof body.ready!=='boolean'||typeof body.tables_ok!=='boolean'||typeof body.functions_ok!=='boolean'||typeof body.rls_ok!=='boolean'||typeof body.views_release_active!=='boolean')throw new Error('upstream_invalid_response');
  if(typeof body.latest_migration!=='string'||!migration.test(body.latest_migration))throw new Error('upstream_invalid_response');
  if(!Number.isSafeInteger(body.migration_count)||body.migration_count<0||body.migration_count>10000)throw new Error('upstream_invalid_response');
  if(body.architecture_version!=='2.3')throw new Error('upstream_invalid_response');
  return Object.freeze({
    ready:body.ready,
    latestMigration:body.latest_migration,
    migrationCount:body.migration_count,
    tablesOk:body.tables_ok,
    functionsOk:body.functions_ok,
    rlsOk:body.rls_ok,
    viewsReleaseActive:body.views_release_active,
    architectureVersion:body.architecture_version
  });
}
