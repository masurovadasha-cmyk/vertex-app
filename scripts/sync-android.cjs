'use strict';
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');const source=path.join(root,'vertex/dist'),dest=path.join(root,'android/app/src/main/assets/site');
const version=JSON.parse(fs.readFileSync(path.join(source,'release.json'),'utf8')).version;
if(typeof version!=='string'||!/^\d+\.\d+(?:\.\d+)?-demo$/.test(version))throw new Error('Invalid release version for Android assets.');
for(const file of fs.readdirSync(source)){if(!fs.statSync(path.join(source,file)).isFile()||file.endsWith('.apk'))continue;let bytes=fs.readFileSync(path.join(source,file));if(file==='app.js'){let text=bytes.toString('utf8').replace(/navigator\.serviceWorker\.register\('\.\/sw\.js'\)/g,'Promise.resolve(null)');bytes=Buffer.from(text);}
if(file==='mobile.js'){let text=bytes.toString('utf8');text=text.replace('async function showInstall(){',`async function showInstall(){
  if(location.hostname==='appassets.androidplatform.net'){modal(tr('Vertex на телефоне','Vertex on your phone'),'<p>'+tr('Приложение уже установлено. Версия ${version}.','The app is already installed. Version ${version}.')+'</p>');return;}
`);bytes=Buffer.from(text);}fs.writeFileSync(path.join(dest,file),bytes);}
console.log('Android assets synchronized; native install message and disabled SW preserved.');
