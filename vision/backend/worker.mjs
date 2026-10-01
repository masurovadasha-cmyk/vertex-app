import {readPage} from '../modules/views/read-contract.mjs';
import {routePlan,projectSessionContext} from './kernel.mjs';
import {validateViewsCommand} from '../modules/views/command-contract.mjs';
import {projectViewsCommandResponse} from '../modules/views/response-contract.mjs';
import {projectRuntimeReadiness} from './readiness.mjs';
import {systemStatusBase,projectSystemStatus} from './system-status.mjs';
import {projectWorkFeed} from '../contracts/work-feed.mjs';
import {validateWorkCommand,projectWorkCommandResponse} from '../contracts/work-command.mjs';
import {projectWorkAssignees} from '../contracts/work-assignees.mjs';
import {projectNotificationFeed} from '../contracts/notification-feed.mjs';
import {validateNotificationCommand,projectNotificationCommandResponse} from '../contracts/notification-command.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...extra}});

async function boundedJSON(source,limit){
  if(Number(source.headers.get('content-length'))>limit)throw new Error('body_too_large');
  const reader=source.body?.getReader();if(!reader)throw new Error('invalid_json');
  let length=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new Error('body_too_large');}chunks.push(value);}
  const data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(data));}catch{throw new Error('invalid_json');}
}

async function upstreamJSON(response,limit){
  try{return await boundedJSON(response,limit);}catch{throw new Error('upstream_invalid_response');}
}

function mapUpstreamError(body,status){
  const conflicts=['23505','40001','23P01'].includes(body?.code);
  const forbidden=body?.code==='42501'||status===403;
  const invalid=['22023','22P02','22003','22007','22008','23503','23502','23514'].includes(body?.code);
  return {error:conflicts?'conflict':forbidden?'forbidden':invalid?'invalid_command':'backend_unavailable',status:conflicts?409:forbidden?403:invalid?400:503};
}

// All data requests retain the user's verified bearer token. There is no service-role key.
export async function handle(request,env,fetcher=fetch){
  const url=new URL(request.url),requestId=crypto.randomUUID();
  const reply=(body,status=200,extra={})=>json(body,status,{'x-request-id':requestId,...extra});
  if(env.VISION_ENV!=='staging')return reply({error:'staging_only'},503);
  if(url.pathname==='/health')return reply({
    service:'VERTEX VISION',environment:'staging',configured:configured(env),probe:'liveness-config-only',
    architectureVersion:'2.0',requiredMigration:'0015_background_runtime.sql',
    sourceCommit:/^[a-f0-9]{40}$/.test(env.VISION_SOURCE_COMMIT||'')?env.VISION_SOURCE_COMMIT:null
  });
  if(url.pathname==='/system-status'){
    if(!['GET','HEAD'].includes(request.method))return reply({error:'method_not_allowed'},405);
    const base=systemStatusBase(env);
    if(!base.backendConfigured){
      const projected=projectSystemStatus(base,null,false);
      if(request.method==='HEAD')return new Response(null,{status:200,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-request-id':requestId}});
      return reply(projected);
    }
    try{
      const response=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/vision_runtime_readiness',{
        method:'POST',
        headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},
        body:'{}',redirect:'error',signal:AbortSignal.timeout(10000)
      });
      const body=await upstreamJSON(response,65536);
      if(!response.ok)throw new Error('readiness_unavailable');
      const readiness=projectRuntimeReadiness(body);
      const projected=projectSystemStatus(base,readiness,true);
      if(request.method==='HEAD')return new Response(null,{status:200,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-request-id':requestId}});
      return reply(projected);
    }catch{
      const projected=projectSystemStatus(base,null,false);
      if(request.method==='HEAD')return new Response(null,{status:200,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-request-id':requestId}});
      return reply(projected);
    }
  }
  if(url.pathname==='/readyz'){
    if(!['GET','HEAD'].includes(request.method))return reply({error:'method_not_allowed'},405);
    if(!configured(env))return reply({ready:false,error:'backend_not_configured'},503);
    try{
      const response=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/vision_runtime_readiness',{
        method:'POST',
        headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},
        body:'{}',redirect:'error',signal:AbortSignal.timeout(10000)
      });
      const body=await upstreamJSON(response,65536);
      if(!response.ok)return reply({ready:false,error:'readiness_unavailable'},503);
      const projected=projectRuntimeReadiness(body),status=projected.ready?200:503;
      if(request.method==='HEAD')return new Response(null,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-request-id':requestId}});
      return reply(projected,status);
    }catch{return reply({ready:false,error:'readiness_unavailable'},503);}
  }
  if(!url.pathname.startsWith('/api/')){
    if(url.pathname.startsWith('/rest/')||url.pathname.startsWith('/auth/')||(url.pathname==='/vision'||url.pathname.startsWith('/vision/'))||url.pathname.startsWith('/.'))return reply({error:'not_found'},404);
    if(!['GET','HEAD'].includes(request.method))return reply({error:'method_not_allowed'},405);
    if(!env.ASSETS||typeof env.ASSETS.fetch!=='function')return reply({error:'assets_not_configured'},503);
    return env.ASSETS.fetch(request);
  }
  if(!configured(env))return reply({error:'backend_not_configured'},503);
  if(request.headers.has('origin')&&request.headers.get('origin')!==url.origin)return reply({error:'origin_denied'},403);
  if(!['GET','POST'].includes(request.method))return reply({error:'method_not_allowed'},405);
  const authorization=request.headers.get('authorization');
  if(!authorization?.match(/^Bearer [A-Za-z0-9_.-]+$/)||authorization.length>8192)return reply({error:'unauthorized'},401);
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization,'content-type':'application/json'};
  const upstream=(path,options={})=>fetcher(env.SUPABASE_URL+path,{...options,headers,redirect:'error',signal:AbortSignal.timeout(10000)});
  try{
    const identity=await upstream('/auth/v1/user');
    if(!identity.ok){
      const unavailable=identity.status===429||identity.status>=500;
      return reply({error:unavailable?'auth_unavailable':'unauthorized'},unavailable?503:401);
    }
    const user=await upstreamJSON(identity,65536);
    if(!uuid.test(user.id||''))return reply({error:'unauthorized'},401);

    const plan=routePlan(url,request.method);
    if(!plan)return reply({error:'not_found'},404);
    let result,commandType=null;

    if(plan.kind==='command'){
      const mediaType=request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
      if(mediaType!=='application/json')return reply({error:'json_required'},415);
      const rawCommand=await boundedJSON(request,plan.bodyLimit);
      const command=plan.module==='views'?validateViewsCommand(rawCommand):plan.module==='work'?validateWorkCommand(rawCommand):plan.module==='notifications'?validateNotificationCommand(rawCommand):rawCommand;
      commandType=(plan.module==='views'||plan.module==='work'||plan.module==='notifications')?command.type:null;
      result=await upstream('/rest/v1/rpc/'+plan.rpc,{method:'POST',body:JSON.stringify({command})});
    }else if(plan.kind==='context'){
      result=await upstream('/rest/v1/rpc/'+plan.rpc,{method:'POST',body:JSON.stringify({p_tenant:plan.tenant,p_organization:plan.organization})});
    }else if(plan.kind==='work-feed'){
      result=await upstream('/rest/v1/rpc/'+plan.rpc,{method:'POST',body:JSON.stringify({p_tenant:plan.tenant,p_organization:plan.organization,p_limit:plan.limit})});
    }else if(plan.kind==='work-assignees'){
      result=await upstream('/rest/v1/rpc/'+plan.rpc,{method:'POST',body:JSON.stringify({p_tenant:plan.tenant,p_organization:plan.organization})});
    }else if(plan.kind==='notification-feed'){
      result=await upstream('/rest/v1/rpc/'+plan.rpc,{method:'POST',body:JSON.stringify({p_tenant:plan.tenant,p_organization:plan.organization,p_limit:plan.limit})});
    }else if(plan.kind==='views-read'){
      result=await upstream('/rest/v1/'+plan.table+'?'+plan.read.params);
    }else{
      const params=new URLSearchParams({tenant_id:'eq.'+plan.tenant,select:'*',limit:'50',order:'created_at.desc,id.desc'});
      result=await upstream('/rest/v1/'+plan.table+'?'+params);
    }

    const body=await upstreamJSON(result,1048576);
    if(!result.ok){
      const mapped=mapUpstreamError(body,result.status);
      return reply({error:mapped.error},mapped.status);
    }
    if(plan.kind==='command'&&plan.module==='views'){
      const projected=projectViewsCommandResponse(commandType,body);
      return reply(projected,200,{'x-correlation-id':projected.correlation_id});
    }
    if(plan.kind==='command'&&plan.module==='work'){
      const projected=projectWorkCommandResponse(commandType,body);
      return reply(projected,200,{'x-correlation-id':projected.correlationId});
    }
    if(plan.kind==='command'&&plan.module==='notifications'){
      const projected=projectNotificationCommandResponse(commandType,body);
      return reply(projected,200,{'x-correlation-id':projected.correlationId});
    }
    if(plan.kind==='views-read'){
      const page=readPage(body,plan.read);
      return reply(page.items,200,{'x-page-limit':String(plan.read.limit),...(page.nextCursor?{'x-next-cursor':page.nextCursor}:{})});
    }
    if(plan.kind==='context')return reply(projectSessionContext(body));
    if(plan.kind==='work-feed')return reply(projectWorkFeed(body));
    if(plan.kind==='work-assignees')return reply(projectWorkAssignees(body));
    if(plan.kind==='notification-feed')return reply(projectNotificationFeed(body));
    return reply(body);
  }catch(error){
    if(['invalid_page_query','tenant_id_required','organization_id_required','invalid_context_query','invalid_work_feed_query','invalid_work_assignees_query','invalid_notification_query','invalid_command'].includes(error.message))return reply({error:error.message},400);
    if(error.message==='body_too_large')return reply({error:'body_too_large'},413);
    if(error.message==='invalid_json')return reply({error:'invalid_json'},400);
    return reply({error:'backend_unavailable'},503);
  }
}

function configured(env){
  return /^[a-z0-9]{20}$/.test(env.SUPABASE_STAGING_REF||'')
    && env.SUPABASE_URL===`https://${env.SUPABASE_STAGING_REF}.supabase.co`
    && /^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_PUBLISHABLE_KEY||'');
}
export default {fetch(request,env){return handle(request,env);}};
