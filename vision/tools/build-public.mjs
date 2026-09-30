import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export async function collectPublicAssets(){
  const files=[['/','../public/index.html','text/html; charset=utf-8'],['/directions/views','../public/views.html','text/html; charset=utf-8'],['/style.css','../modules/views/workspace.css','text/css; charset=utf-8'],['/modules/views/icon.svg','../modules/views/icon.svg','image/svg+xml']];
  const assets={};for(const [path,file,type] of files)assets[path]={type,body:await readFile(new URL(file,import.meta.url),'utf8')};
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}).trim();
  assets['/release.json']={type:'application/json',body:JSON.stringify({service:'VERTEX VISION',mode:'public-preview',source_commit:commit,backend_status:'auth_onboarding_pending',red_version:'1.14-demo'})};
  return assets;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const directory=new URL('../.build/',import.meta.url);await mkdir(directory,{recursive:true});
  await writeFile(new URL('public-assets.mjs',directory),'export default '+JSON.stringify(await collectPublicAssets())+';\n');
  console.log('Public asset allowlist built: no local profiles or database files.');
}
