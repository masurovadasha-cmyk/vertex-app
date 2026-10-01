import test from "node:test";
import assert from "node:assert/strict";
import {idempotencyKey,requestFingerprint} from "../src/kernel/idempotency.mjs";
import {money,addMoney} from "../src/kernel/money.mjs";
import {domainEvent} from "../src/contracts/events.mjs";
import {can} from "../src/contracts/roles.mjs";

test("idempotency scope includes tenant actor and command",()=>{
  assert.equal(idempotencyKey({organizationId:"org",actorId:"u1",command:"ride.create",key:"abc"}),"org:u1:ride.create:abc");
});
test("request fingerprint is key-order stable",()=>{
  assert.equal(requestFingerprint({b:2,a:1}),requestFingerprint({a:1,b:2}));
});
test("money refuses mixed currencies",()=>{
  assert.throws(()=>addMoney(money(10,"USD"),money(10,"UZS")),/currency_mismatch/);
});
test("domain event carries explicit schema version",()=>{
  const e=domainEvent({type:"taxi.ride.requested",aggregateType:"ride",aggregateId:"r1",aggregateVersion:1,organizationId:"org",payload:{},correlationId:"c",eventId:"e1"});
  assert.equal(e.schemaVersion,1);
});
test("RBAC defaults to deny",()=>{
  assert.equal(can("client","driver:moderate"),false);
  assert.equal(can("owner","anything"),true);
});
