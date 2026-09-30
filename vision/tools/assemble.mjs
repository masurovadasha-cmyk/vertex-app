import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=path.resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'));
const rel=p=>path.join(root,p);
const hash=p=>createHash('sha256').update(fs.readFileSync(rel(p))).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(rel(p),'utf8'));
const assembly=json('vision/assembly/manifest.json');
const release=json(assembly.releaseManifest);
const migrationDir=rel('vision/database/migrations');
const migrations=fs.readdirSync(migrationDir).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();
const tracked=[
  'vision/assembly/manifest.json',
  assembly.releaseManifest,
  'vision/platform/registry.cjs',
  'vision/platform/views-ops.js',
  'vision/backend/worker.mjs',
  'vision/modules/views/manifest.json',
  'wrangler.jsonc',
  'vision/wrangler.jsonc',
  'android/app/build.gradle',
  'vertex/dist/index.html',
  'vertex/dist/vision-core.js',
  'vertex/dist/vision-views.js',
  'vertex/dist/vision-shell.js'
];
const sourceCommit=(()=>{try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{return null;}})();
const output={
  product:assembly.product,
  assembly:assembly.assembly,
  architectureVersion:assembly.architectureVersion,
  platformVersion:assembly.platformVersion,
  release:release.release,
  sourceCommit,
  generatedAt:new Date().toISOString(),
  activeModules:assembly.modules.active,
  productionApproved:false,
  productionChanged:false,
  files:Object.fromEntries(tracked.map(p=>[p,hash(p)])),
  migrations:Object.fromEntries(migrations.map(n=>[n,hash('vision/database/migrations/'+n)]))
};
const outDir=rel('artifacts/assembly');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'integrated-assembly.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',output:'artifacts/assembly/integrated-assembly.json',sourceCommit,files:tracked.length,migrations:migrations.length},null,2));
