import fs from 'node:fs';
import path from 'node:path';

const controllerRoot=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const root=process.env.VISION_CANDIDATE_ROOT?path.resolve(process.env.VISION_CANDIDATE_ROOT):controllerRoot;
const dir=path.join(root,'vision/database/migrations');
const files=fs.readdirSync(dir).filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort();
const strip=sql=>sql
  .replace(/\/\*[\s\S]*?\*\//g,' ')
  .replace(/--.*$/gm,' ')
  .replace(/'(?:''|[^'])*'/g,"''")
  .replace(/\s+/g,' ')
  .trim();

const forbidden=[
  [/\bdrop\s+(?:table|column|schema|type|function|index|policy|view|materialized\s+view|trigger|sequence|extension|domain)\b/i,'destructive DROP'],
  [/\btruncate\b/i,'TRUNCATE'],
  [/\bdelete\s+from\b/i,'DELETE FROM'],
  [/\balter\s+table\b[^;]*\bdrop\b/i,'ALTER TABLE DROP'],
  [/\balter\s+table\b[^;]*\brename\s+(?:column|constraint|to)\b/i,'table/column/constraint rename'],
  [/\balter\s+table\b[^;]*\balter\s+column\b[^;]*\btype\b/i,'column type rewrite'],
  [/\balter\s+table\b[^;]*\balter\s+column\b[^;]*\bset\s+not\s+null\b/i,'column nullability tightening'],
  [/\balter\s+table\b[^;]*\balter\s+column\b[^;]*\bdrop\s+default\b/i,'column default removal'],
  [/\balter\s+table\b[^;]*\bdrop\s+constraint\b/i,'constraint removal']
];

const errors=[];
for(const [index,name] of files.entries()){
  const sql=fs.readFileSync(path.join(dir,name),'utf8').replaceAll('\r\n','\n');
  const normalized=strip(sql);
  const migrationSurface=normalized.replace(/\$([A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?\$\1\$/g,' $function_body$ ');
  if(name.slice(0,4)!==String(index+1).padStart(4,'0'))errors.push(name+': migration sequence is not contiguous');
  if(!/^begin\s*;/i.test(normalized))errors.push(name+': migration must begin explicitly');
  if(!/commit\s*;\s*$/i.test(normalized))errors.push(name+': migration must commit explicitly');

  // 0001-0004 are the reviewed foundation baseline. RC-era migrations are expand-only.
  if(Number(name.slice(0,4))>=5){
    for(const [pattern,label] of forbidden){
      if(pattern.test(migrationSurface))errors.push(name+': '+label+' is forbidden after the foundation baseline');
    }
  }

  const functionHeaders=[...normalized.matchAll(/create(?:\s+or\s+replace)?\s+function\b[\s\S]*?\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/ig)].map(match=>match[0]);
  for(const header of functionHeaders){
    if(/security\s+definer/i.test(header)&&!/set\s+search_path\s*=\s*''/i.test(header))
      errors.push(name+': SECURITY DEFINER function missing empty search_path');
  }
}
if(errors.length){
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({status:'PASS',policy:'expand-only-after-0004',migrations:files.length,latest:files.at(-1)},null,2));
