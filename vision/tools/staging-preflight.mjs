import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';

const migrationsDir=new URL('../database/migrations/',import.meta.url);
const wranglerFile=new URL('../wrangler.jsonc',import.meta.url);
const live=process.argv.includes('--live');

function fail(message){throw new Error(message);}
function expect(condition,message){if(!condition)fail(message);}

async function staticChecks(){
  const names=(await readdir(migrationsDir)).filter(name=>name.endsWith('.sql')).sort();
  expect(names.length>=5,'expected at least five VISION migrations');
  names.forEach((name,index)=>{
    const prefix=String(index+1).padStart(4,'0')+'_';
    expect(name.startsWith(prefix),`migration sequence gap: expected ${prefix}..., got ${name}`);
  });

  const receipts=[];
  for(const name of names){
    const raw=await readFile(new URL(name,migrationsDir),'utf8');
    const normalized=raw.replaceAll('\r\n','\n').trim();
    expect(/^begin;/i.test(normalized),`${name}: migration must start with BEGIN`);
    expect(/commit;$/i.test(normalized),`${name}: migration must end with COMMIT`);
    receipts.push({name,sha256:createHash('sha256').update(raw.replaceAll('\r\n','\n')).digest('hex')});
  }

  const wrangler=await readFile(wranglerFile,'utf8');
  expect(/"name"\s*:\s*"vertex-vision-staging"/.test(wrangler),'staging worker name changed unexpectedly');
  expect(/"VISION_ENV"\s*:\s*"staging"/.test(wrangler),'VISION_ENV must remain staging');
  expect(/"preview_urls"\s*:\s*false/.test(wrangler),'preview URLs must remain disabled');
  expect(/"observability"\s*:\s*\{[^}]*"enabled"\s*:\s*true/s.test(wrangler),'observability must remain enabled');

  console.log('STATIC PREFLIGHT PASS');
  for(const receipt of receipts)console.log(`${receipt.name}  ${receipt.sha256}`);
}

async function liveChecks(){
  const ref=process.env.SUPABASE_STAGING_REF||'';
  const supabaseUrl=process.env.SUPABASE_URL||'';
  const key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
  const stagingUrl=process.env.VISION_STAGING_URL||'';

  expect(/^[a-z0-9]{20}$/.test(ref),'SUPABASE_STAGING_REF must be a 20-character lowercase project ref');
  expect(supabaseUrl===`https://${ref}.supabase.co`,'SUPABASE_URL must exactly match SUPABASE_STAGING_REF');
  expect(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key),'only a Supabase publishable key is accepted');
  expect(stagingUrl,'VISION_STAGING_URL is required for --live');

  const url=new URL(stagingUrl);
  expect(url.protocol==='https:','VISION_STAGING_URL must use HTTPS');
  const health=new URL('/health',url);
  const response=await fetch(health,{redirect:'error',signal:AbortSignal.timeout(10000)});
  expect(response.ok,`health returned HTTP ${response.status}`);
  expect(response.headers.get('content-type')?.includes('application/json'),'health must return JSON');
  const body=await response.json();
  expect(body?.service==='VERTEX VISION','unexpected health service');
  expect(body?.environment==='staging','health is not staging');
  expect(body?.configured===true,'staging worker reports backend not configured');
  console.log('LIVE HEALTH PREFLIGHT PASS');
}

try{
  await staticChecks();
  if(live)await liveChecks();
}catch(error){
  console.error('STAGING PREFLIGHT FAIL:',error.message);
  process.exitCode=1;
}
