import test from "node:test";
import assert from "node:assert/strict";
import {createLeaseService} from "../src/contexts/dispatch/application/lease-service.mjs";

function memoryStore(){
  let seq=0;const rides=new Map(),drivers=new Map();
  return {
    nextFencingToken:async()=>++seq,
    acquireRide:async(id,v)=>rides.has(id)?false:(rides.set(id,v),true),
    acquireDriver:async(id,v)=>drivers.has(id)?false:(drivers.set(id,v),true),
    releaseRideIfOwner:async(id,v)=>rides.get(id)===v?rides.delete(id):false,
    releaseDriverIfOwner:async(id,v)=>drivers.get(id)===v?drivers.delete(id):false,
    readRide:async id=>rides.get(id)||null,readDriver:async id=>drivers.get(id)||null
  };
}
test("one driver cannot hold two leases",async()=>{
  const s=createLeaseService({store:memoryStore()});
  const a=await s.acquire("r1","d1");const b=await s.acquire("r2","d1");
  assert.equal(a.ok,true);assert.equal(b.ok,false);assert.equal(b.error,"driver_already_reserved");
});
test("fencing token is monotonic",async()=>{
  const s=createLeaseService({store:memoryStore()});
  const a=await s.acquire("r1","d1");const b=await s.acquire("r2","d2");
  assert.ok(b.fencingToken>a.fencingToken);
});
test("stale owner cannot verify newer lease",async()=>{
  const store=memoryStore();const s=createLeaseService({store});
  const a=await s.acquire("r1","d1");
  const offer={ride_id:"r1",driver_id:"d1",lease_token:a.leaseToken,fencing_token:a.fencingToken};
  assert.equal((await s.verify(offer)).ok,true);
  offer.lease_token="stale";
  assert.equal((await s.verify(offer)).ok,false);
});
