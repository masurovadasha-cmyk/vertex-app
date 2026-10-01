import fs from "node:fs/promises";
import crypto from "node:crypto";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { Pool } from "pg";
import { createClient } from "redis";
import { latLngToCell, gridDisk } from "h3-js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const API_TOKEN = process.env.STAGING_API_TOKEN || "";
const H3_RESOLUTION = Number(process.env.H3_RESOLUTION || 9);
const LOCATION_TTL_SECONDS = Number(process.env.LOCATION_TTL_SECONDS || 20);
const OFFER_TTL_MS = Number(process.env.OFFER_TTL_MS || 12000);

if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!REDIS_URL) throw new Error("REDIS_URL is required");

const db = new Pool({ connectionString: DATABASE_URL, max: 10 });
const redis = createClient({ url: REDIS_URL });
redis.on("error", (err) => console.error("redis", err));
await redis.connect();

const migration = await fs.readFile(new URL("../migrations/001_init.sql", import.meta.url), "utf8");
await db.query(migration);

const app = Fastify({
  logger: true,
  bodyLimit: 32 * 1024,
  requestTimeout: 5000,
});
await app.register(websocket);

function auth(req, reply) {
  if (!API_TOKEN) return;
  const value = req.headers.authorization || "";
  if (value !== `Bearer ${API_TOKEN}`) {
    return reply.code(401).send({ error: "unauthorized" });
  }
}

function fareMinor(distanceKm) {
  const tenths = Math.round(distanceKm * 10);
  if (tenths <= 50) return 500;
  if (tenths <= 100) return 1000;
  return 1000 + (tenths - 100) * 15;
}

function locationKey(driverId) { return `taxi:driver:${driverId}:location`; }
function cellKey(cell) { return `taxi:h3:${cell}:drivers`; }
function driverLeaseKey(driverId) { return `taxi:lease:driver:${driverId}`; }
function rideLeaseKey(rideId) { return `taxi:lease:ride:${rideId}`; }

async function publishRideEvent(rideId, event) {
  await redis.publish(`taxi:realtime:ride:${rideId}`, JSON.stringify(event));
}

app.get("/health", async () => {
  const dbOk = await db.query("select 1 as ok");
  const redisOk = await redis.ping();
  return {
    service: "vertex-taxi-core",
    version: "0.2.0",
    status: dbOk.rows[0]?.ok === 1 && redisOk === "PONG" ? "ok" : "degraded",
    storage: "postgres",
    ephemeral: "redis",
    geo: "h3",
  };
});

app.get("/v1/capabilities", async () => ({
  module: "taxi",
  stateMachine: [
    "REQUESTED","SEARCHING","DRIVER_OFFERED","DRIVER_ASSIGNED",
    "DRIVER_EN_ROUTE","DRIVER_ARRIVED","RIDER_ONBOARD","IN_PROGRESS",
    "COMPLETED","RIDER_CANCELLED","DRIVER_CANCELLED","SYSTEM_CANCELLED",
    "NO_DRIVER","EXPIRED"
  ],
  geo: { provider: "h3", resolution: H3_RESOLUTION },
  realtime: "websocket",
  offerLeaseTtlMs: OFFER_TTL_MS,
}));

const point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().min(1).max(200),
});

const quoteInput = z.object({
  userId: z.string().min(1).max(128),
  pickup: point,
  destination: point,
  serviceClass: z.enum(["start","comfort","business"]),
  distanceKm: z.number().positive().max(500),
});

app.post("/v1/quotes", { preHandler: auth }, async (req, reply) => {
  const input = quoteInput.parse(req.body);
  const fare = fareMinor(input.distanceKm);
  const result = await db.query(
    `insert into taxi_quotes
      (user_id,pickup_lat,pickup_lng,pickup_label,destination_lat,destination_lng,
       destination_label,service_class,distance_km,fare_minor,currency,expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'USD',now()+interval '5 minutes')
     returning *`,
    [input.userId,input.pickup.lat,input.pickup.lng,input.pickup.label,
     input.destination.lat,input.destination.lng,input.destination.label,
     input.serviceClass,input.distanceKm,fare]
  );
  reply.code(201);
  return { data: result.rows[0] };
});

const rideInput = z.object({
  userId: z.string().min(1).max(128),
  quoteId: z.string().uuid(),
});

app.post("/v1/rides", { preHandler: auth }, async (req, reply) => {
  const input = rideInput.parse(req.body);
  const client = await db.connect();
  try {
    await client.query("begin");
    const q = await client.query(
      "select * from taxi_quotes where id=$1 and user_id=$2 and expires_at>now() for update",
      [input.quoteId,input.userId]
    );
    if (!q.rowCount) {
      await client.query("rollback");
      return reply.code(409).send({ error: "quote_expired_or_missing" });
    }
    const quote = q.rows[0];
    const r = await client.query(
      `insert into taxi_rides
       (user_id,quote_id,state,service_class,pickup_lat,pickup_lng,pickup_label,
        destination_lat,destination_lng,destination_label,fare_minor,currency)
       values ($1,$2,'REQUESTED',$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning *`,
      [input.userId,quote.id,quote.service_class,quote.pickup_lat,quote.pickup_lng,
       quote.pickup_label,quote.destination_lat,quote.destination_lng,
       quote.destination_label,quote.fare_minor,quote.currency]
    );
    const ride = r.rows[0];
    await client.query(
      `insert into taxi_outbox(event_type,aggregate_id,aggregate_version,payload,correlation_id)
       values('taxi.ride.v2.requested',$1,1,$2,$3)`,
      [ride.id, JSON.stringify({ ride_id: ride.id }), ride.correlation_id]
    );
    await client.query("commit");
    await publishRideEvent(ride.id,{type:"ride.requested",rideId:ride.id,state:ride.state,version:ride.version});
    reply.code(201);
    return { data: ride };
  } finally {
    client.release();
  }
});

app.get("/v1/rides/:rideId", { preHandler: auth }, async (req, reply) => {
  const rideId = z.string().uuid().parse(req.params.rideId);
  const r = await db.query("select * from taxi_rides where id=$1",[rideId]);
  if (!r.rowCount) return reply.code(404).send({ error: "not_found" });
  return { data: r.rows[0] };
});

const locationInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().positive().max(500),
  heading: z.number().min(0).max(360).optional(),
  speedMps: z.number().min(0).max(100).optional(),
  available: z.boolean().default(true),
  serviceClasses: z.array(z.enum(["start","comfort","business"])).min(1).default(["start"]),
});

app.post("/v1/drivers/:driverId/location", { preHandler: auth }, async (req, reply) => {
  const driverId = z.string().min(1).max(128).parse(req.params.driverId);
  const input = locationInput.parse(req.body);
  if (input.accuracyM > 80) return reply.code(422).send({ error: "location_accuracy_too_low" });
  const cell = latLngToCell(input.lat,input.lng,H3_RESOLUTION);
  const previous = await redis.hGet(locationKey(driverId),"cell");
  const tx = redis.multi();
  if (previous && previous !== cell) tx.sRem(cellKey(previous),driverId);
  tx.hSet(locationKey(driverId),{
    lat:String(input.lat),
    lng:String(input.lng),
    accuracyM:String(input.accuracyM),
    heading:String(input.heading ?? ""),
    speedMps:String(input.speedMps ?? ""),
    available:String(input.available),
    serviceClasses:JSON.stringify(input.serviceClasses),
    cell,
    updatedAt:String(Date.now()),
  });
  tx.expire(locationKey(driverId),LOCATION_TTL_SECONDS);
  tx.sAdd(cellKey(cell),driverId);
  tx.expire(cellKey(cell),LOCATION_TTL_SECONDS * 3);
  await tx.exec();
  return { data:{driverId,cell,ttlSeconds:LOCATION_TTL_SECONDS} };
});

async function candidatesForRide(ride) {
  const origin = latLngToCell(Number(ride.pickup_lat),Number(ride.pickup_lng),H3_RESOLUTION);
  const cells = gridDisk(origin,2);
  const ids = new Set();
  for (const cell of cells) {
    const members = await redis.sMembers(cellKey(cell));
    for (const id of members) ids.add(id);
  }
  const now = Date.now();
  const candidates=[];
  for (const driverId of ids) {
    const raw = await redis.hGetAll(locationKey(driverId));
    if (!raw.updatedAt) continue;
    const ageMs=now-Number(raw.updatedAt);
    if (ageMs>LOCATION_TTL_SECONDS*1000) continue;
    if (raw.available!=="true") continue;
    let classes=[];
    try { classes=JSON.parse(raw.serviceClasses||"[]"); } catch {}
    if (!classes.includes(ride.service_class)) continue;
    const dLat=(Number(raw.lat)-Number(ride.pickup_lat))*111;
    const dLng=(Number(raw.lng)-Number(ride.pickup_lng))*111*Math.cos(Number(ride.pickup_lat)*Math.PI/180);
    const approxKm=Math.sqrt(dLat*dLat+dLng*dLng);
    candidates.push({driverId,cell:raw.cell,ageMs,approxKm});
  }
  candidates.sort((a,b)=>a.approxKm-b.approxKm||a.ageMs-b.ageMs);
  return candidates.slice(0,20);
}

app.get("/v1/dispatch/:rideId/candidates", { preHandler: auth }, async (req, reply) => {
  const rideId=z.string().uuid().parse(req.params.rideId);
  const r=await db.query("select * from taxi_rides where id=$1",[rideId]);
  if(!r.rowCount) return reply.code(404).send({error:"ride_not_found"});
  const candidates=await candidatesForRide(r.rows[0]);
  await db.query(
    "insert into taxi_dispatch_attempts(ride_id,candidate_driver_ids,outcome,details) values($1,$2,$3,$4)",
    [rideId,JSON.stringify(candidates.map(c=>c.driverId)),candidates.length?"CANDIDATES":"NONE",JSON.stringify({count:candidates.length})]
  );
  return {data:candidates};
});

const offerInput=z.object({
  rideId:z.string().uuid(),
  driverId:z.string().min(1).max(128),
});

app.post("/v1/offers", { preHandler: auth }, async (req, reply) => {
  const input=offerInput.parse(req.body);
  const offerId=crypto.randomUUID();
  const expiresAt=new Date(Date.now()+OFFER_TTL_MS);
  const rideLease=await redis.set(rideLeaseKey(input.rideId),input.driverId,{NX:true,PX:OFFER_TTL_MS});
  if(rideLease!=="OK") return reply.code(409).send({error:"ride_already_reserved"});
  const driverLease=await redis.set(driverLeaseKey(input.driverId),input.rideId,{NX:true,PX:OFFER_TTL_MS});
  if(driverLease!=="OK"){
    await redis.del(rideLeaseKey(input.rideId));
    return reply.code(409).send({error:"driver_already_reserved"});
  }
  await db.query(
    "insert into taxi_offers(id,ride_id,driver_id,state,expires_at) values($1,$2,$3,'OFFERED',$4)",
    [offerId,input.rideId,input.driverId,expiresAt]
  );
  await db.query(
    "update taxi_rides set state='DRIVER_OFFERED',version=version+1,updated_at=now() where id=$1 and state in ('REQUESTED','SEARCHING')",
    [input.rideId]
  );
  await publishRideEvent(input.rideId,{type:"ride.driver_offered",rideId:input.rideId,driverId:input.driverId,offerId,expiresAt});
  reply.code(201);
  return {data:{offerId,expiresAt}};
});

app.post("/v1/offers/:offerId/accept", { preHandler: auth }, async (req, reply) => {
  const offerId=z.string().uuid().parse(req.params.offerId);
  const client=await db.connect();
  try{
    await client.query("begin");
    const o=await client.query("select * from taxi_offers where id=$1 for update",[offerId]);
    if(!o.rowCount) { await client.query("rollback"); return reply.code(404).send({error:"offer_not_found"}); }
    const offer=o.rows[0];
    if(offer.state!=="OFFERED" || new Date(offer.expires_at)<=new Date()){
      await client.query("rollback");
      return reply.code(409).send({error:"offer_expired"});
    }
    const driverRide=await redis.get(driverLeaseKey(offer.driver_id));
    const rideDriver=await redis.get(rideLeaseKey(offer.ride_id));
    if(driverRide!==offer.ride_id || rideDriver!==offer.driver_id){
      await client.query("rollback");
      return reply.code(409).send({error:"lease_lost"});
    }
    await client.query("update taxi_offers set state='ACCEPTED',updated_at=now() where id=$1",[offerId]);
    const updated=await client.query(
      `update taxi_rides set state='DRIVER_ASSIGNED',driver_id=$2,version=version+1,updated_at=now()
       where id=$1 and state='DRIVER_OFFERED' returning *`,
      [offer.ride_id,offer.driver_id]
    );
    if(!updated.rowCount){ await client.query("rollback"); return reply.code(409).send({error:"ride_conflict"}); }
    await client.query("commit");
    await publishRideEvent(offer.ride_id,{type:"ride.driver_assigned",rideId:offer.ride_id,driverId:offer.driver_id});
    return {data:updated.rows[0]};
  } finally { client.release(); }
});

app.get("/v1/realtime/rides/:rideId", { websocket:true }, (socket, req) => {
  const rideId=req.params.rideId;
  const sub=redis.duplicate();
  let closed=false;
  (async()=>{
    await sub.connect();
    await sub.subscribe(`taxi:realtime:ride:${rideId}`,message=>{
      if(socket.readyState===1) socket.send(message);
    });
  })().catch(err=>socket.close(1011,String(err)));
  socket.on("close",async()=>{
    if(closed) return;
    closed=true;
    try { await sub.unsubscribe(); await sub.quit(); } catch {}
  });
});

app.setErrorHandler((err, req, reply)=>{
  req.log.error(err);
  if(err?.name==="ZodError") return reply.code(400).send({error:"invalid_request",issues:err.issues});
  reply.code(500).send({error:"internal_error"});
});

await app.listen({port:PORT,host:"0.0.0.0"});
