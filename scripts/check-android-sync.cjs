'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),web=path.join(root,'vertex/dist'),android=path.join(root,'android/app/src/main/assets/site');
const names=dir=>fs.readdirSync(dir).filter(name=>fs.statSync(path.join(dir,name)).isFile()&&!name.endsWith('.apk')).sort();
const files=names(web),version=JSON.parse(fs.readFileSync(path.join(web,'release.json'))).version;
assert.deepEqual(names(android),files,'Android asset inventory differs from the built web');
for(const file of files){
 let expected=fs.readFileSync(path.join(web,file));
 if(file==='app.js')expected=Buffer.from(expected.toString().replace(/navigator\.serviceWorker\.register\('\.\/sw\.js'\)/g,'Promise.resolve(null)'));
 if(file==='mobile.js')expected=Buffer.from(expected.toString().replace('async function showInstall(){',`async function showInstall(){
  if(location.hostname==='appassets.androidplatform.net'){modal(tr('Vertex на телефоне','Vertex on your phone'),'<p>'+tr('Приложение уже установлено. Версия ${version}.','The app is already installed. Version ${version}.')+'</p>');return;}
`));
 assert.deepEqual(fs.readFileSync(path.join(android,file)),expected,'Android mismatch: '+file);
}
assert.doesNotMatch(fs.readFileSync(path.join(android,'app.js'),'utf8'),/navigator\.serviceWorker\.register/);
console.log('PASS '+files.length+' Android assets: exact source matches with explicit native-only adaptations.');
