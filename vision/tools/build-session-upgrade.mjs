import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// One reviewed upgrade from the deployed five-migration staging baseline.
const directory=new URL('../database/migrations/',import.meta.url),files=[];
for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort()){
 const sql=(await readFile(new URL(name,directory),'utf8')).replaceAll('\r\n','\n');
 files.push({name,sql,sha256:createHash('sha256').update(sql).digest('hex')});
}
if(files.length!==7)throw Error('Review the upgrade baseline before adding migrations');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const expected=files.slice(0,5).map(f=>'('+quote(f.name)+','+quote(f.sha256)+')').join(',');
const guard=`begin;
select pg_advisory_xact_lock(1447646025,1);
do $$ begin
 if exists (select 1 from (values ${expected}) expected(name,sha256)
 full join vision_private.schema_migrations actual using(name,sha256)
 where expected.name is null or actual.name is null) then
 raise exception 'Migration history is not the reviewed five-migration baseline';
 end if;
end $$;
`;
const changes=files.slice(5).map(f=>f.sql.replace(/^\s*begin;/i,'').replace(/commit;\s*$/i,'')+'\ninsert into vision_private.schema_migrations values('+quote(f.name)+','+quote(f.sha256)+');\n').join('\n');
await mkdir(new URL('../.build/',import.meta.url),{recursive:true});
await writeFile(new URL('../.build/session-upgrade.sql',import.meta.url),guard+changes+'\ncommit;\nselect name,sha256 from vision_private.schema_migrations order by name;\n');
console.log('Prepared atomic staging upgrade; refuses mismatched or already-upgraded history.');
