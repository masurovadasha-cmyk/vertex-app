import test from "node:test";
import assert from "node:assert/strict";
import {parsePrincipal} from "../src/contexts/identity/application/authorization.mjs";
import {can} from "../src/contracts/roles.mjs";

test("principal requires known role and user id",()=>{
 assert.deepEqual(parsePrincipal({"x-vertex-role":"driver","x-vertex-user-id":"d1"}),{role:"driver",userId:"d1"});
 assert.equal(parsePrincipal({"x-vertex-role":"root","x-vertex-user-id":"x"}),null);
 assert.equal(parsePrincipal({"x-vertex-role":"admin"}),null);
});
test("admin and owner permissions are explicit",()=>{
 assert.equal(can("admin","organization:operate"),true);
 assert.equal(can("client","organization:operate"),false);
 assert.equal(can("owner","anything:new"),true);
});
test("driver cannot moderate drivers",()=>{
 assert.equal(can("driver","driver:moderate"),false);
});
