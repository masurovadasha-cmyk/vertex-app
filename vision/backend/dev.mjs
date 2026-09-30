import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from './migrate.mjs';
import {demo,profiles,organizations,provisionDemo} from './demo.mjs';
import {validateViewsCommand} from '../modules/views/command-contract.mjs';
import {projectViewsCommandResponse} from '../modules/views/response-contract.mjs';

export async function startDev({port=8790,dataDir}={}) {
  const db=new PGlite(dataDir);
  await db.exec(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$;`);
  await migrate(db);await provisionDemo(db);
  let queue=Promise.resolve();
  const transact=work=>{
    const result=queue.then(work);queue=result.catch(()=>{});return result;
  };
  const server=http.createServer(async(req,res)=>{
    const send=(status,data,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'"});res.end(type==='application/json'?JSON.stringify(data):data);};
    const host=`127.0.0.1:${server.address().port}`;
    if(req.headers.host!==host || (req.headers.origin && req.headers.origin!==`http://${host}`))return send(403,{error:'loopback_only'});
    const path=new URL(req.url,`http://${host}`).pathname;
    try{
      if(req.method==='GET' && (path==='/'||path==='/dev.js'))return send(200,await readFile(new URL(path==='/'?'./dev.html':'./dev-ui.js',import.meta.url),'utf8'),path==='/'?'text/html; charset=utf-8':'text/javascript');
      if(req.method==='GET' && path==='/api/profiles')return send(200,{demo,profiles:profiles.map(({key,name})=>({key,name})),organizations});
      const profile=profiles.find(p=>p.key===req.headers['x-vision-profile']);
      if(!profile)return send(401,{error:'choose_demo_profile'});
      let command;
      if(['/api/commands','/api/v1/views/commands'].includes(path)&&req.method==='POST'){
        if(req.headers['content-type']!=='application/json')return send(415,{error:'json_required'});
        let body='';for await(const chunk of req){body+=chunk.toString();if(body.length>8192)return send(413,{error:'too_large'});}
        try{command=JSON.parse(body);if(path==='/api/v1/views/commands')command=validateViewsCommand(command);}catch(e){return send(400,{error:e.message==='invalid_command'?'invalid_command':'invalid_json'});}
      }else if(!(req.method==='GET'&&['/api/orders','/api/audit'].includes(path)))return send(404,{error:'not_found'});
      const result=await transact(async()=>{
        await db.query('begin');
        try{
          await db.query('set local role authenticated');
          await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:profile.id})]);
          const rpc=path==='/api/v1/views/commands'?'vision_views_command':'vision_command';
          const r=command?await db.query('select public.'+rpc+'($1::jsonb) result',[JSON.stringify(command)]):
            await db.query(`select * from public.${path==='/api/audit'?'vision_audit_events':'vision_orders'} order by created_at desc limit 50`);
          await db.query('commit');
          if(command&&path==='/api/v1/views/commands')return projectViewsCommandResponse(command.type,r.rows[0].result);
          return command?r.rows[0].result:r.rows;
        }catch(e){await db.query('rollback');throw e;}
      });
      send(200,result);
    }catch(e){send(['42501'].includes(e.code)?403:['23505','40001'].includes(e.code)?409:400,{error:e.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await new Promise(r=>server.close(r));await queue;await db.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const directory=new URL('../.data/development/',import.meta.url);await mkdir(directory,{recursive:true});
  const app=await startDev({dataDir:fileURLToPath(directory)});
  console.log(`VISION local development: ${app.url} (synthetic profiles; never expose publicly)`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
