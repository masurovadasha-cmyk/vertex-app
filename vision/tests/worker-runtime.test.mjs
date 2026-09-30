import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[require.resolve('wrangler')]}));
test('Worker upstream Request options execute in workerd without a network or credentials',async()=>{
 const source=await readFile(new URL('../backend/worker.mjs',import.meta.url),'utf8');
 const script=source.replace(/export default[\s\S]*$/,'')+`
 export default {async fetch(){return handle(new Request('https://vision.example/api/orders',{headers:{authorization:'Bearer invalid'}}),
 {VISION_ENV:'staging',SUPABASE_STAGING_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},
 async(url,options)=>{new Request(url,options);return Response.json({error:'invalid'},{status:401});});}};`;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-30',script}));
 try{const r=await mf.dispatchFetch('https://vision.example');assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'unauthorized'});}finally{await mf.dispose();}
});
