import test from "node:test";
import assert from "node:assert/strict";
import {calculateFareMinor,PRICING_VERSION} from "../src/contexts/pricing-quotes/domain/pricing.mjs";
import {createQuoteService} from "../src/contexts/pricing-quotes/application/create-quote.mjs";

test("pricing is deterministic and class-aware",()=>{
  assert.equal(calculateFareMinor({distanceKm:5,serviceClass:"start"}),500);
  assert.equal(calculateFareMinor({distanceKm:5,serviceClass:"comfort"}),500);
  assert.equal(calculateFareMinor({distanceKm:5,serviceClass:"business"}),500);
});
test("quote service owns expiry and pricing version",async()=>{
  let inserted;
  const service=createQuoteService({quoteRepository:{insert:async q=>(inserted=q,{id:"q1",...q})},clock:()=>new Date("2026-10-02T00:00:00Z")});
  const q=await service({userId:"u",pickup:{lat:1,lng:1,label:"a"},destination:{lat:2,lng:2,label:"b"},serviceClass:"start",distanceKm:5},{ttlMinutes:5});
  assert.equal(q.pricingVersion,PRICING_VERSION);
  assert.equal(inserted.expiresAt.toISOString(),"2026-10-02T00:05:00.000Z");
});
test("invalid distance is rejected by domain",()=>{
  assert.throws(()=>calculateFareMinor({distanceKm:0,serviceClass:"start"}),/invalid_distance/);
});
