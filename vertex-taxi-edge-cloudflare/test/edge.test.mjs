import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.mjs";

test("edge health is local and healthy",async()=>{
  const r=await worker.fetch(new Request("https://edge.test/edge/health"),{ORIGIN_BASE:"https://example.com"});
  assert.equal(r.status,200);
  assert.equal((await r.json()).status,"ok");
});
test("unsafe methods are rejected",async()=>{
  const r=await worker.fetch(new Request("https://edge.test/demo/x",{method:"DELETE"}),{ORIGIN_BASE:"https://example.com"});
  assert.equal(r.status,405);
});
test("unknown paths are rejected before origin",async()=>{
  const r=await worker.fetch(new Request("https://edge.test/private"),{ORIGIN_BASE:"https://example.com"});
  assert.equal(r.status,404);
});
