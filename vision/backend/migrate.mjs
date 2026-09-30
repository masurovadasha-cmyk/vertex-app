import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export async function migrate(db,{through=null,directory=new URL('../database/migrations/',import.meta.url)}={}) {
  await db.exec(`create schema if not exists vision_private;
    revoke all on schema vision_private from public;
    create table if not exists vision_private.schema_migrations(name text primary key,sha256 text not null);`);
  const files=(await readdir(directory)).filter(f=>f.endsWith('.sql')).sort();
  if(through && !files.includes(through))throw new Error('Unknown migration target: '+through);
  for(const name of files){
    if(through && name>through)break;
    const sql=await readFile(new URL(name,directory),'utf8');
    const hash=createHash('sha256').update(sql.replaceAll('\r\n','\n')).digest('hex');
    const prior=(await db.query('select sha256 from vision_private.schema_migrations where name=$1',[name])).rows[0];
    if(prior){if(prior.sha256!==hash)throw new Error('Applied migration changed: '+name);continue;}
    // Each migration owns BEGIN/COMMIT. Receipt is inserted inside that transaction.
    const end=sql.lastIndexOf('commit;');
    if(end<0)throw new Error('Migration must commit explicitly');
    try {
      await db.exec(sql.slice(0,end));
      await db.query('insert into vision_private.schema_migrations values($1,$2)',[name,hash]);
      await db.exec(sql.slice(end));
    }catch(e){await db.exec('rollback');throw e;}
  }
}
