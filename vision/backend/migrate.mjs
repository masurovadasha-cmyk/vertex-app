import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Requires an exclusive, dedicated connection (not a pool/transaction pooler).
// The stable two-int lock survives individual migration COMMITs.
export const migrationLock=[1447646025,1];
const running=new WeakSet();
const defaultDirectory=new URL('../database/migrations/',import.meta.url);
export async function migrate(db,{directory=defaultDirectory}={}) {
  if(running.has(db))throw new Error('migration_busy');
  running.add(db);let locked=false;
  const exec=sql=>db.exec?db.exec(sql):db.query(sql);
  try{
    // Snapshot and validate all local files before making schema changes.
    const files=[];
    for(const name of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort()){
      if(!/^\d{4}_[a-z0-9_]+\.sql$/.test(name))throw new Error('Invalid migration filename: '+name);
      const sql=(await readFile(new URL(name,directory),'utf8')).replaceAll('\r\n','\n');
      if(!/^(?:\s|--[^\n]*\n)*begin;/i.test(sql)||! /commit;\s*$/i.test(sql))throw new Error('Migration must have explicit BEGIN/COMMIT: '+name);
      const end=sql.search(/commit;\s*$/i);
      files.push({name,sql,end,hash:createHash('sha256').update(sql).digest('hex')});
    }
    if(!files.length)throw new Error('Empty migration set');
    if(new Set(files.map(f=>f.name.slice(0,4))).size!==files.length)throw new Error('Duplicate migration number');
    locked=(await db.query('select pg_try_advisory_lock($1,$2) locked',migrationLock)).rows[0].locked;
    if(!locked)throw new Error('migration_busy');
    await exec(`create schema if not exists vision_private;
      revoke all on schema vision_private from public;
      create table if not exists vision_private.schema_migrations(name text primary key,sha256 text not null);
      revoke all on vision_private.schema_migrations from public;`);
    const history=(await db.query('select name,sha256 from vision_private.schema_migrations order by name')).rows;
    // History must be an exact prefix. Reject missing, edited or reordered files
    // before applying any pending migration, including on an older checkout.
    for(const [i,prior] of history.entries()){
      if(files[i]?.name!==prior.name)throw new Error('Migration history diverged at: '+prior.name);
      if(files[i].hash!==prior.sha256)throw new Error('Applied migration changed: '+prior.name);
    }
    const applied=[];
    for(const file of files.slice(history.length)){
      try{
        await exec(file.sql.slice(0,file.end));
        await db.query('insert into vision_private.schema_migrations values($1,$2)',[file.name,file.hash]);
        await exec(file.sql.slice(file.end));applied.push(file.name);
      }catch(error){await exec('rollback');throw error;}
    }
    return {applied,existing:history.length};
  }finally{
    try{if(locked)await db.query('select pg_advisory_unlock($1,$2)',migrationLock);}
    finally{running.delete(db);}
  }
}
