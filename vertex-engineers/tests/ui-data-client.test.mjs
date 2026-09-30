import test from "node:test";
import assert from "node:assert/strict";
import {createEngineersApi,loadEngineersOverview,EngineersApiError} from "../ui/app/api-client.js";

test("UI data client sends scope only from scopeProvider",async()=>{
  const calls=[];
  const api=createEngineersApi({
    scopeProvider:async()=>({tenant_id:"t1",organization_id:"o1"}),
    fetchImpl:async(url,options)=>{
      calls.push({url,headers:Object.fromEntries(options.headers.entries())});
      return new Response(JSON.stringify({items:[]}),{status:200,headers:{"content-type":"application/json"}});
    }
  });
  await loadEngineersOverview(api);
  assert.equal(calls.length,3);
  for(const call of calls){
    assert.equal(call.headers["x-tenant-id"],"t1");
    assert.equal(call.headers["x-organization-id"],"o1");
  }
});

test("UI data client refuses operational calls without verified/preview scope",async()=>{
  const api=createEngineersApi({scopeProvider:async()=>null,fetchImpl:async()=>{throw new Error("must not fetch");}});
  await assert.rejects(api.projects(),error=>error instanceof EngineersApiError&&error.code==="scope_unavailable");
});

test("health check does not require operational scope",async()=>{
  const api=createEngineersApi({
    scopeProvider:async()=>null,
    fetchImpl:async()=>new Response(JSON.stringify({status:"ok",module:"engineers"}),{status:200,headers:{"content-type":"application/json"}})
  });
  assert.equal((await api.health()).status,"ok");
});
