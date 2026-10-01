import pg from 'pg';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {migrate} from '../backend/migrate.mjs';

const controllerRoot=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const candidateRoot=process.env.VISION_CANDIDATE_ROOT?path.resolve(process.env.VISION_CANDIDATE_ROOT):controllerRoot;
const migrationDirectory=pathToFileURL(path.join(candidateRoot,'vision/database/migrations')+path.sep);
const url=process.env.VISION_BASELINE_DATABASE_URL;
if(!url)throw new Error('VISION_BASELINE_DATABASE_URL required');

const client=new pg.Client({
  connectionString:url,
  application_name:'vertex-vision-n-minus-one-baseline'
});
await client.connect();
try{
  const db={query:(...args)=>client.query(...args),exec:sql=>client.query(sql)};
  await migrate(db,{through:'0004_private_subject_permissions.sql',directory:migrationDirectory});
  const rows=(await client.query('select name from vision_private.schema_migrations order by name')).rows.map(x=>x.name);
  if(rows.length!==4||rows.at(-1)!=='0004_private_subject_permissions.sql')throw new Error('n_minus_one_baseline_migration_mismatch');
  console.log(JSON.stringify({status:'PASS',latest:rows.at(-1),migrationCount:rows.length},null,2));
}finally{
  await client.end();
}
