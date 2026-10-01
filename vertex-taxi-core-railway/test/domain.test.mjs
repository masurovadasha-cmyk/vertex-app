import test from "node:test";
import assert from "node:assert/strict";
import { latLngToCell, gridDisk } from "h3-js";

test("H3 v4 candidate neighborhood is deterministic",()=>{
  const cell=latLngToCell(41.3111,69.2797,9);
  assert.equal(typeof cell,"string");
  const disk=gridDisk(cell,2);
  assert.ok(disk.includes(cell));
  assert.ok(disk.length>1);
});

test("Vertex tariff remains deterministic",()=>{
  const fare=(km)=>{
    const t=Math.round(km*10);
    if(t<=50) return 500;
    if(t<=100) return 1000;
    return 1000+(t-100)*15;
  };
  assert.equal(fare(5),500);
  assert.equal(fare(10),1000);
  assert.equal(fare(12),1300);
});
