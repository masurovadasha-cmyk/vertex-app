import {readFile,writeFile,readdir,mkdir,copyFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=path.join(root,'.vision-build');
const portable=path.join(out,'portable');
const web=path.join(portable,'web');
const android=path.join(out,'android');
const put=async(file,text)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);};
await rm(portable,{recursive:true,force:true});
await rm(android,{recursive:true,force:true});
await mkdir(web,{recursive:true});
const directory=path.join(root,'vision/database/migrations');
const migrations=[];
for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort()){
  const sql=(await readFile(path.join(directory,name),'utf8')).replaceAll('\r\n','\n');
  migrations.push({name,sql,sha256:createHash('sha256').update(sql).digest('hex')});
}
await build({entryPoints:[path.join(root,'vision/portable/sandbox.mjs')],outfile:path.join(web,'sandbox.js'),bundle:true,format:'esm',platform:'browser',target:'chrome110',external:['./dev-ui.js','node:*'],define:{VISION_MIGRATIONS:JSON.stringify(migrations)},sourcemap:true,legalComments:'eof'});
await copyFile(path.join(root,'vision/backend/dev-ui.js'),path.join(web,'dev-ui.js'));
const pgDist=path.dirname(require.resolve('@electric-sql/pglite'));
const assets=(await readdir(pgDist)).filter(n=>/\.(wasm|data)$/.test(n));
if(!assets.some(n=>n.endsWith('.wasm'))||!assets.some(n=>n.endsWith('.data')))throw new Error('PGlite runtime assets missing');
for(const name of assets)await copyFile(path.join(pgDist,name),path.join(web,name));
let html=await readFile(path.join(root,'vision/backend/dev.html'),'utf8');
html=html.replace('<title>','<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\' \'wasm-unsafe-eval\'; style-src \'unsafe-inline\'; connect-src \'self\'; img-src \'self\' data:; worker-src \'self\' blob:; base-uri \'none\'; form-action \'none\'"><title>');
html=html.replace('VERTEX VISION · Development','VERTEX VISION · 0.2.0-dev');
html=html.replace('Искусственные профили и заказы. Переключатель ниже имитирует вход только на этом компьютере. Это не production-авторизация.','Автономная тестовая сборка 0.2.0-dev. Искусственные профили и заявки сохраняются только на этом устройстве. Переключатель имитирует роли: это не настоящий вход. Облачной синхронизации, платежей и отправки уведомлений нет. Не вводите реальные данные гостей.');
html=html.replace('</style>','*{box-sizing:border-box}select{max-width:100%}button{min-height:44px}th{white-space:nowrap}@media(max-width:600px){main{padding:24px 14px}h1{font-size:29px}section{padding:16px}td,th{padding:9px 6px}select{display:block;width:100%;margin:8px 0}button{max-width:100%}} </style>');
html=html.replace('<script src="/dev.js"></script>','<script type="module" src="./sandbox.js"></script>');
await put(path.join(web,'index.html'),html);
await put(path.join(portable,'desktop-server.mjs'),String.raw`import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const directory=fileURLToPath(new URL('./web/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.data':'application/octet-stream','.json':'application/json','.map':'application/json'};
export async function startServer({port=8790,open=false}={}){
 const server=http.createServer(async(req,res)=>{
  const host='127.0.0.1:'+server.address().port;
  if(req.headers.host!==host||(req.headers.origin&&req.headers.origin!=='http://'+host)){res.writeHead(403);res.end('Loopback only');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{
   const pathname=new URL(req.url,'http://'+host).pathname;
   const name=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));
   if(!name||name.includes('/')||name.includes('\\')||name.startsWith('.')){res.writeHead(404);res.end();return;}
   const file=path.join(directory,name);const info=await stat(file);
   if(!info.isFile())throw new Error('not_file');
   res.writeHead(200,{'content-type':types[path.extname(name)]||'application/octet-stream','content-length':info.size,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'"});
   if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch{if(!res.headersSent)res.writeHead(404);res.end('Not found');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 const url='http://127.0.0.1:'+server.address().port;
 console.log('VERTEX VISION 0.2.0-dev: '+url+' (local synthetic data only)');
 if(open){const child=process.platform==='win32'?spawn('cmd',['/c','start','',url]):spawn(process.platform==='darwin'?'open':'xdg-open',[url]);child.on('error',()=>{});child.unref();}
 return {url,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 startServer({open:true}).then(app=>{for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>app.close().then(()=>process.exit(0)));}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
`);
await put(path.join(portable,'START-VISION.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0desktop-server.mjs"\r\nif errorlevel 1 pause\r\n');
await put(path.join(portable,'start-vision.sh'),'#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\nexec node desktop-server.mjs\n');
await put(path.join(android,'settings.gradle'),"pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name='VertexVisionDev'\ninclude ':app'\n");
await put(path.join(android,'build.gradle'),await readFile(path.join(root,'android/build.gradle'),'utf8'));
await put(path.join(android,'gradle.properties'),'android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\n');
await put(path.join(android,'app/build.gradle'),"plugins { id 'com.android.application' }\nandroid { namespace 'com.vertex.vision.dev'; compileSdk 35\n defaultConfig { applicationId 'com.vertex.vision.dev'; minSdk 26; targetSdk 35; versionCode 1; versionName '0.2.0-dev' }\n compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n}\ndependencies { implementation 'androidx.webkit:webkit:1.12.1' }\n");
await put(path.join(android,'app/src/main/AndroidManifest.xml'),`<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="VERTEX VISION DEV" android:icon="@drawable/ic_vision" android:allowBackup="false" android:usesCleartextTraffic="false" android:theme="@android:style/Theme.Material.NoActionBar"><activity android:name=".MainActivity" android:exported="true" android:configChanges="orientation|screenSize|keyboardHidden"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>`);
await put(path.join(android,'app/src/main/res/drawable/ic_vision.xml'),'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="48dp" android:height="48dp" android:viewportWidth="48" android:viewportHeight="48"><path android:fillColor="#14151D" android:pathData="M0,0H48V48H0Z"/><path android:fillColor="#EF4C57" android:pathData="M7,10H17L24,29L31,10H41L28,39H20Z"/></vector>');
await put(path.join(android,'app/src/main/java/com/vertex/vision/dev/MainActivity.java'),String.raw`package com.vertex.vision.dev;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.net.Uri;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.util.Collections;

public final class MainActivity extends Activity {
 private WebView web;
 private static boolean local(Uri uri) {
  return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) && uri.getPath()!=null && uri.getPath().startsWith("/assets/");
 }
 private static WebResourceResponse blocked() {
  return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
 }
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  web=new WebView(this);
  web.setBackgroundColor(0xff101116);
  setContentView(web);
  WebSettings settings=web.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setJavaScriptCanOpenWindowsAutomatically(false);
  settings.setSupportMultipleWindows(false);
  WebView.setWebContentsDebuggingEnabled(false);
  final WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
    if(!local(request.getUrl()) || !"GET".equals(request.getMethod()))return blocked();
    WebResourceResponse response=loader.shouldInterceptRequest(request.getUrl());
    if(response==null)return blocked();
    if(request.getUrl().getPath().endsWith(".wasm"))response.setMimeType("application/wasm");
    return response;
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !local(request.getUrl());}
  });
  web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
 }
 @Override protected void onDestroy(){if(web!=null){web.stopLoading();web.destroy();}super.onDestroy();}
}
`);
const androidAssets=path.join(android,'app/src/main/assets');
await mkdir(androidAssets,{recursive:true});
for(const name of await readdir(web))await copyFile(path.join(web,name),path.join(androidAssets,name));
await put(path.join(out,'portable-build.json'),JSON.stringify({version:'0.2.0-dev',applicationId:'com.vertex.vision.dev',networkPermission:false,production:false,migrations:migrations.map(({name,sha256})=>({name,sha256})),runtimeAssets:assets},null,2));
console.log('Built VISION browser sandbox and isolated Android sources:',out);
