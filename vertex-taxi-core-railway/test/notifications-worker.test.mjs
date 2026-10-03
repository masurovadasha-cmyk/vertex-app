import test from "node:test";
import assert from "node:assert/strict";
import {createNotificationWorker} from "../src/contexts/notifications/application/notification-worker.mjs";

function fakeDb(rows,providerFailure=false){
  const updates=[];
  const client={
    async query(sql,args){
      if(sql==="begin"||sql==="commit"||sql==="rollback") return {rowCount:0,rows:[]};
      if(sql.includes("select * from taxi_notification_outbox")) return {rowCount:rows.length,rows};
      updates.push({sql,args});return {rowCount:1,rows:[]};
    },
    release(){}
  };
  return {db:{async connect(){return client}},updates};
}

test("worker delivers claimed notifications",async()=>{
  const {db,updates}=fakeDb([{id:"n1",attempt_count:0}]);
  const worker=createNotificationWorker({db,provider:{async deliver(){return {ok:true}}}});
  const result=await worker(10);
  assert.deepEqual(result,{claimed:1,delivered:1,retried:0,dead:0});
  assert.ok(updates.some(x=>x.sql.includes("state='DELIVERED'")));
});

test("worker retries transient failures",async()=>{
  const {db,updates}=fakeDb([{id:"n1",attempt_count:1}]);
  const worker=createNotificationWorker({db,provider:{async deliver(){throw new Error("temporary")}}});
  const result=await worker(10);
  assert.equal(result.retried,1);
  assert.ok(updates.some(x=>x.sql.includes("state='RETRY'")));
});

test("worker dead-letters after max attempts",async()=>{
  const {db,updates}=fakeDb([{id:"n1",attempt_count:4}]);
  const worker=createNotificationWorker({db,provider:{async deliver(){throw new Error("permanent")}}});
  const result=await worker(10);
  assert.equal(result.dead,1);
  assert.ok(updates.some(x=>x.sql.includes("state='DEAD'")));
});
