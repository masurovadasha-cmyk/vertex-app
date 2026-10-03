import test from "node:test";
import assert from "node:assert/strict";
import {parsePrincipal} from "../src/contexts/identity/application/authorization.mjs";
import {can} from "../src/contracts/roles.mjs";
import {issuePrincipalToken,verifyPrincipalToken} from "../src/contexts/identity/application/principal-token.mjs";

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

test("signed principal token verifies and expires",()=>{
 const secret="test-secret-that-is-long-enough";
 const token=issuePrincipalToken({userId:"u1",role:"admin",ttlSeconds:60},secret,1000);
 assert.deepEqual(verifyPrincipalToken(token,secret,{now:1010}),{userId:"u1",role:"admin",exp:1060});
 assert.equal(verifyPrincipalToken(token,secret,{now:1060}),null);
 assert.equal(verifyPrincipalToken(token,"wrong-secret",{now:1010}),null);
});
test("tampered principal token is rejected",()=>{
 const secret="test-secret";
 const token=issuePrincipalToken({userId:"u1",role:"driver"},secret,1000);
 const parts=token.split(".");
 const payload=Buffer.from(JSON.stringify({sub:"u1",role:"owner",aud:"vertex-taxi-core",iat:1000,exp:1900})).toString("base64url");
 assert.equal(verifyPrincipalToken(parts[0]+"."+payload+"."+parts[2],secret,{now:1010}),null);
});
