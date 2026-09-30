import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectPublicAssets} from '../tools/build-public.mjs';
import {publicHandler} from '../backend/public-handler.mjs';
test('public portal exposes only the reviewed static allowlist and keeps backend fail-closed',async()=>{
 const assets=await collectPublicAssets(),handle=publicHandler(assets),env={VISION_ENV:'staging'};
 for(const path of ['/','/directions/views','/style.css','/modules/views/icon.svg','/release.json'])assert.equal((await handle(new Request('https://vision.example'+path),env)).status,200);
 for(const path of ['/api/profiles','/dev.js','/.data/development','/modules/views/command-client.mjs','/constructor'])assert.equal((await handle(new Request('https://vision.example'+path),env)).status,404);
 assert.equal((await handle(new Request('https://vision.example/api/commands',{method:'POST',headers:{'x-vision-profile':'views'},body:'{}'}),env)).status,503);
 assert.equal((await handle(new Request('https://vision.example/'),{})).status,503);
 assert.equal((await handle(new Request('https://vision.example/',{method:'POST'}),env)).status,405);
 assert.equal(await (await handle(new Request('https://vision.example/',{method:'HEAD'}),env)).text(),'');
 const installer=await handle(new Request('https://vision.example/download/android?url=https://evil.example'),env);assert.equal(installer.headers.get('location'),'https://vertex-app.masurovadasha.workers.dev/Vertex-Latest.apk');
 for(const {body} of Object.values(assets)){assert.doesNotMatch(body,/127\.0\.0\.1|x-vision-profile|\/api\/profiles|service_role/);}
 assert.equal((await (await handle(new Request('https://vision.example/health'),env)).json()).configured,false);
});
