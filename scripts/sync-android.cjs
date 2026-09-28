'use strict';
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');const source=path.join(root,'vertex/dist'),dest=path.join(root,'android/app/src/main/assets/site');
for(const file of fs.readdirSync(source)){if(!fs.statSync(path.join(source,file)).isFile()||file.endsWith('.apk'))continue;let bytes=fs.readFileSync(path.join(source,file));if(file==='app.js'){let text=bytes.toString('utf8').replace(/navigator\.serviceWorker\.register\('\.\/sw\.js'\)/g,'Promise.resolve(null)');bytes=Buffer.from(text);}
if(file==='mobile.js'){let text=bytes.toString('utf8');text=text.replace('async function showInstall(){',`async function showInstall(){
  if(location.hostname==='appassets.androidplatform.net'){modal(tr('Vertex на телефоне','Vertex on your phone'),'<p>'+tr('Приложение уже установлено. Версия 1.5-demo.','The app is already installed. Version 1.5-demo.')+'</p>');return;}
`);bytes=Buffer.from(text);}fs.writeFileSync(path.join(dest,file),bytes);}
console.log('Android assets synchronized; native install message and disabled SW preserved.');
