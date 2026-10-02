import test from "node:test";
import assert from "node:assert/strict";
import {validateLocation,isFresh} from "../src/contexts/geo-presence/domain/presence-policy.mjs";
import {createPresenceService} from "../src/contexts/geo-presence/application/presence-service.mjs";

test("accuracy policy rejects low-quality GPS",()=>assert.throws(()=>validateLocation({lat:41,lng:69,accuracyM:81}),/location_accuracy_too_low/));
test("freshness has an explicit TTL boundary",()=>{
  assert.equal(isFresh(1000,21000,20),true);
  assert.equal(isFresh(1000,21001,20),false);
});
test("candidate service filters stale unavailable and wrong-class drivers",async()=>{
  const now=100000;
  const rows={
    good:{lat:"41.3112",lng:"69.2798",updatedAt:String(now-1000),available:"true",serviceClasses:'["comfort"]',cell:"x"},
    stale:{lat:"41.3112",lng:"69.2798",updatedAt:String(now-30000),available:"true",serviceClasses:'["comfort"]',cell:"x"},
    wrong:{lat:"41.3112",lng:"69.2798",updatedAt:String(now-1000),available:"true",serviceClasses:'["start"]',cell:"x"}
  };
  const service=createPresenceService({store:{driverIdsInCells:async()=>Object.keys(rows),get:async id=>rows[id],upsert:async()=>{}},clock:()=>now});
  const result=await service.candidates({pickupLat:41.3111,pickupLng:69.2797,serviceClass:"comfort"});
  assert.deepEqual(result.map(x=>x.driverId),["good"]);
});
