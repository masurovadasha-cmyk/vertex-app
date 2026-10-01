// VERTEX VISION System Status DTO — Interface System 10.0
const SHA=/^[a-f0-9]{40}$/;
const MIGRATION=/^\d{4}_[a-z0-9_]+\.sql$/;

export function systemStatusBase(env){
  const sourceCommit=SHA.test(env?.VISION_SOURCE_COMMIT||'')?env.VISION_SOURCE_COMMIT:null;
  const backendConfigured=/^[a-z0-9]{20}$/.test(env?.SUPABASE_STAGING_REF||'')
    && env?.SUPABASE_URL===`https://${env.SUPABASE_STAGING_REF}.supabase.co`
    && /^sb_publishable_[A-Za-z0-9_-]+$/.test(env?.SUPABASE_PUBLISHABLE_KEY||'');
  return Object.freeze({
    service:'VERTEX VISION',
    environment:'staging',
    sourceCommit,
    architectureVersion:'2.1',
    requiredMigration:'0016_staging_session_activation.sql',
    backendConfigured,
    backgroundConsumerConnected:env?.VISION_BACKGROUND_CONSUMER_CONNECTED==='1',
    escalationSchedulerConnected:env?.VISION_ESCALATION_SCHEDULER_CONNECTED==='1'
  });
}

export function projectSystemStatus(base,readiness=null,readinessChecked=false){
  if(!base||typeof base!=='object')throw new Error('invalid_system_status');
  let databaseReady=null,latestMigration=null,migrationCount=null,viewsReleaseActive=null;
  if(readinessChecked){
    if(!readiness||typeof readiness!=='object'||Array.isArray(readiness))throw new Error('invalid_system_status');
    if(typeof readiness.ready!=='boolean'||typeof readiness.viewsReleaseActive!=='boolean')throw new Error('invalid_system_status');
    if(typeof readiness.latestMigration!=='string'||!MIGRATION.test(readiness.latestMigration))throw new Error('invalid_system_status');
    if(!Number.isSafeInteger(readiness.migrationCount)||readiness.migrationCount<0)throw new Error('invalid_system_status');
    databaseReady=readiness.ready;
    latestMigration=readiness.latestMigration;
    migrationCount=readiness.migrationCount;
    viewsReleaseActive=readiness.viewsReleaseActive;
  }
  return Object.freeze({
    ...base,
    readinessChecked:Boolean(readinessChecked),
    databaseReady,
    latestMigration,
    migrationCount,
    viewsReleaseActive
  });
}
