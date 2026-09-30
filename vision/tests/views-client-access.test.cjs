'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../platform/views-client.cjs');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('revoked access during load-more immediately publishes cleared state to the UI',async()=>{
 const notices=[];let denied=false;
 const identity={tenantId:id(1),organizationId:id(2),token:'test.jwt.token'};
 const context={actorId:id(11),tenantId:id(1),organizationId:id(2),module:'views',moduleEnabled:true,permissions:['views.operations.read'],roles:['manager'],guestLinked:false,capabilities:{}};
 const client=create({onChange:s=>notices.push(s),fetcher:async path=>{
  if(path.includes('/context'))return Response.json(context);
  if(path.includes('/bookings'))return denied?Response.json({error:'forbidden'},{status:403}):Response.json([{id:id(1)}],{headers:{'x-next-cursor':'cGFnZTI'}});
  return Response.json([]);
 }});
 await client.configure(identity);await client.refresh();denied=true;await client.loadMore('bookings');
 const visible=notices.at(-1);
 assert.equal(visible.configured,false);assert.equal(visible.data.bookings.length,0);assert.equal(visible.error.status,403);
});
