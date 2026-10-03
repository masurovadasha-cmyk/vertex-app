import test from "node:test";
import assert from "node:assert/strict";
import {resolveRideTransition,TERMINAL_RIDE_STATES} from "../src/contexts/trips/domain/ride-state-machine.mjs";

test("trip happy path is explicit",()=>{
  let state="DRIVER_ASSIGNED";
  for(const command of ["DRIVER_EN_ROUTE","ARRIVED","RIDER_ONBOARD","START","COMPLETE"]){
    const result=resolveRideTransition(state,command);
    assert.equal(result.ok,true);
    state=result.to;
  }
  assert.equal(state,"COMPLETED");
  assert.equal(TERMINAL_RIDE_STATES.has(state),true);
});

test("cannot complete before trip starts",()=>{
  const result=resolveRideTransition("DRIVER_ASSIGNED","COMPLETE");
  assert.equal(result.ok,false);
  assert.equal(result.error,"invalid_transition");
});

test("cancel paths remain explicit",()=>{
  assert.equal(resolveRideTransition("DRIVER_EN_ROUTE","RIDER_CANCEL").to,"RIDER_CANCELLED");
  assert.equal(resolveRideTransition("DRIVER_EN_ROUTE","DRIVER_CANCEL").to,"DRIVER_CANCELLED");
});
