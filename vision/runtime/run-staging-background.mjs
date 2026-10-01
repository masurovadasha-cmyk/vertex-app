import pg from 'pg';
import {createPostgresBackgroundAdapter} from './postgres-background-adapter.mjs';
import {drainNotificationOutbox,reconcileEscalationScopes} from './background-operations.mjs';

const url=process.env.VISION_BACKGROUND_DATABASE_URL;
if(!url) throw new Error('VISION_BACKGROUND_DATABASE_URL_required');
if(!/sslmode=(require|verify-full)/.test(url)) throw new Error('background_database_ssl_required');

const pool=new pg.Pool({
  connectionString:url,
  max:2,
  idleTimeoutMillis:5000,
  connectionTimeoutMillis:10000
});

try{
  const adapter=createPostgresBackgroundAdapter(pool);
  const notifications=await drainNotificationOutbox(adapter,{limit:25});
  const escalations=await reconcileEscalationScopes(adapter,{maxScopes:100});
  process.stdout.write(JSON.stringify({
    runtime:'VERTEX VISION Background Operations',
    sourceCommit:/^[a-f0-9]{40}$/.test(process.env.VISION_CANDIDATE_SHA||process.env.GITHUB_SHA||'')?(process.env.VISION_CANDIDATE_SHA||process.env.GITHUB_SHA):null,
    notifications,
    escalations,
    productionChanged:false
  })+'\n');
}finally{
  await pool.end();
}
