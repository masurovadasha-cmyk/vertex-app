'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../platform/views-client.cjs');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const credentials={tenantId:id(1),organizationId:id(2),token:'test.jwt.token'};
const permissions=['views.operations.read','views.booking.create','views.booking.manage','views.cleaning.execute','views.cleaning.verify'];
const context=(changes={})=>({actorId:id(11),tenantId:id(1),organizationId:id(2),module:'views',moduleEnabled:true,
 permissions,roles:['manager'],guestLinked:false,capabilities:{},...changes});
const fields={organization_id:id(2),unit_id:id(51),customer_id:id(4),check_in:'2026-10-10',check_out:'2026-10-12',total:'0.29',currency:'USD'};
const result={booking_id:id(80),unit_id:id(51),correlation_id:id(81),booking_version:1,booking_status:'PENDING'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};};
const empty=()=>Response.json([]);

test('server context, not input role claims, defines UI permissions; tokens are never exposed',async()=>{
 const client=create({fetcher:async()=>Response.json(context({permissions:[]}))});
 await client.configure({...credentials,permissions,roles:['admin']});
 assert.equal(client.can('views.booking.manage'),false);
 assert.ok(!JSON.stringify(client.snapshot()).includes(credentials.token));
 await assert.rejects(()=>client.execute('create_booking',fields),/forbidden/);
});
test('outdated configure response cannot replace a newer organization or clear its session',async()=>{
 const first=deferred();let calls=0;
 const client=create({fetcher:async()=>++calls===1?first.promise:Response.json(context({organizationId:id(3)}))});
 const a=client.configure(credentials).catch(e=>e.code);
 await client.configure({...credentials,organizationId:id(3)});
 first.resolve(Response.json(context()));assert.equal(await a,'session_changed');
 assert.equal(client.snapshot().context.organizationId,id(3));
});
test('a read finishing after logout cannot repopulate rows',async()=>{
 const waiting=[];
 const client=create({fetcher:async path=>{if(path.includes('/context'))return Response.json(context());const d=deferred();waiting.push(d);return d.promise;}});
 await client.configure(credentials);const reading=client.refresh();client.clearSession();
 waiting.forEach(d=>d.resolve(Response.json([{id:id(99)}])));await reading;
 assert.equal(client.snapshot().configured,false);assert.equal(client.snapshot().data.bookings.length,0);
});
test('latest refresh wins even when a previous fetch ignores cancellation',async()=>{
 let count=0;const stale=[];
 const client=create({fetcher:async path=>{if(path.includes('/context'))return Response.json(context());
 if(++count<=3){const d=deferred();stale.push(d);return d.promise;}return Response.json([{id:id(42)}]);}});
 await client.configure(credentials);const earlier=client.refresh();await client.refresh();
 stale.forEach(d=>d.resolve(Response.json([{id:id(43)}])));await earlier;
 assert.equal(client.snapshot().data.bookings[0].id,id(42));assert.equal(client.snapshot().loading,false);
});
test('pagination is bounded, deduplicated and never advertised as all data prematurely',async()=>{
 const urls=[];
 const client=create({fetcher:async path=>{urls.push(path);if(path.includes('/context'))return Response.json(context());
 if(path.includes('/bookings'))return path.includes('cursor=')?Response.json([{id:id(1)},{id:id(2)}]):Response.json([{id:id(1)}],{headers:{'x-next-cursor':'cGFnZTI'}});
 return empty();}});
 await client.configure(credentials);await client.refresh();assert.ok(client.snapshot().pages.bookings.nextCursor);
 await client.loadMore('bookings');assert.equal(client.snapshot().data.bookings.length,2);assert.equal(client.snapshot().pages.bookings.nextCursor,null);
 assert.ok(urls.some(u=>u.includes('limit=50')&&u.includes('organization_id=')));
});
test('malformed successful responses do not silently become empty successful lists',async()=>{
 const client=create({fetcher:async path=>path.includes('/context')?Response.json(context()):Response.json(null)});
 await client.configure(credentials);await client.refresh();assert.equal(client.snapshot().error.code,'invalid_response');assert.equal(client.snapshot().pages.bookings.loaded,false);
});
test('acknowledgement loss retains one command key, blocks competing commands and safely replays',async()=>{
 const writes=[];let fail=true;const storage=store();
 const client=create({storage,fetcher:async(path,options)=>{
 if(path.includes('/context'))return Response.json(context());
 if(options.method==='POST'){writes.push(options.body);if(fail){fail=false;throw Error('lost response after commit');}return Response.json(result);}return empty();}});
 await client.configure(credentials);await client.execute('create_booking',fields);
 assert.ok(client.snapshot().pending);await assert.rejects(()=>client.execute('create_booking',fields),/pending_command_exists/);
 await client.retry();assert.equal(writes.length,2);assert.equal(writes[0],writes[1]);assert.equal(client.snapshot().pending,null);assert.equal(storage.values.size,0);
});
test('pending metadata survives tab reload, but is restored only after verified matching identity',async()=>{
 const storage=store(),writes=[];
 const fetcher=async(path,options)=>path.includes('/context')?Response.json(context()):options.method==='POST'?(writes.push(options.body),Promise.reject(Error('lost'))):empty();
 const a=create({storage,fetcher});await a.configure(credentials);await a.execute('create_booking',fields);
 const encoded=[...storage.values.values()][0];assert.ok(!encoded.includes(credentials.token));assert.ok(!encoded.includes('authorization'));
 const unrelated=create({storage,fetcher:async()=>Response.json(context({actorId:id(12)}))});await unrelated.configure(credentials);assert.equal(unrelated.snapshot().pending,null);
 const b=create({storage,fetcher});await b.configure(credentials);await b.retry();assert.equal(writes[0],writes[1]);
 b.clearSession();assert.equal(storage.values.size,0);
});
test('even an old unresolved receipt reuses the original key instead of expiring into a duplicate',async()=>{
 const storage=store();let time=1000;
 const fetcher=async(path,options)=>path.includes('/context')?Response.json(context()):options.method==='POST'?Promise.reject(Error('lost')):empty();
 const a=create({storage,fetcher,now:()=>time});await a.configure(credentials);await a.execute('create_booking',fields);const key=a.snapshot().pending.key;
 time+=7*24*60*60*1000;const b=create({storage,fetcher,now:()=>time});await b.configure(credentials);assert.equal(b.snapshot().pending.key,key);
});
test('definitive conflicts clear pending; failed refresh never repeats an acknowledged command',async()=>{
 let conflict=true,posts=0;
 const client=create({fetcher:async(path,options)=>{
 if(path.includes('/context'))return Response.json(context());
 if(options.method==='POST'){posts++;return conflict?Response.json({error:'conflict'},{status:409}):Response.json(result);}
 return Response.json({error:'backend_unavailable'},{status:503});}});
 await client.configure(credentials);await client.execute('create_booking',fields);assert.equal(client.snapshot().pending,null);
 conflict=false;await client.execute('create_booking',fields);assert.equal(posts,2);assert.equal(client.snapshot().lastCommand.acknowledged,true);assert.equal(client.snapshot().pending,null);assert.equal(client.snapshot().error.status,503);
});
test('invalidated read access clears all cached business data',async()=>{
 let invalid=false;
 const client=create({fetcher:async path=>path.includes('/context')?Response.json(context()):invalid?Response.json({error:'unauthorized'},{status:401}):Response.json([{id:id(40)}])});
 await client.configure(credentials);await client.refresh();invalid=true;await client.refresh();
 assert.equal(client.snapshot().configured,false);assert.equal(client.snapshot().data.bookings.length,0);
});
test('cleaner reads only its declared operational surface, never bookings and units',async()=>{
 const reads=[];
 const client=create({fetcher:async path=>{reads.push(path);return path.includes('/context')?Response.json(context({permissions:['views.cleaning.execute']})):empty();}});
 await client.configure(credentials);await client.refresh();assert.equal(reads.length,2);assert.ok(reads[1].includes('/cleaning?'));
});

test('expired credentials after an ambiguous write preserve its original retry receipt',async()=>{
 const storage=store();let status=503,contextPermissions=permissions;const writes=[];
 const fetcher=async(path,options)=>path.includes('/context')?Response.json(context({permissions:contextPermissions})):options.method==='POST'?(writes.push(options.body),status===200?Response.json(result):Response.json({error:status===401?'unauthorized':'backend_unavailable'},{status})):empty();
 const a=create({storage,fetcher});await a.configure(credentials);await a.execute('create_booking',fields);const key=a.snapshot().pending.key;
 status=401;await a.retry();assert.equal(a.snapshot().configured,false);assert.equal(storage.values.size,1);
 contextPermissions=[];await a.configure(credentials);assert.equal(a.snapshot().pending.key,key);await assert.rejects(()=>a.retry(),/forbidden/);
 contextPermissions=permissions;await a.configure(credentials);status=200;await a.retry();assert.equal(writes[0],writes.at(-1));assert.equal(storage.values.size,0);
});
