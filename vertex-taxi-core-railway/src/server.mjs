import fs from "node:fs/promises";
import crypto from "node:crypto";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { Pool } from "pg";
import { createClient } from "redis";
import { latLngToCell, gridDisk } from "h3-js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const API_TOKEN = process.env.STAGING_API_TOKEN || "";
const MOBILE_DEMO_TOKEN = process.env.MOBILE_DEMO_TOKEN || "";
const H3_RESOLUTION = Number(process.env.H3_RESOLUTION || 9);
const LOCATION_TTL_SECONDS = Number(process.env.LOCATION_TTL_SECONDS || 20);
const OFFER_TTL_MS = Number(process.env.OFFER_TTL_MS || 12000);

if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!REDIS_URL) throw new Error("REDIS_URL is required");

const db = new Pool({ connectionString: DATABASE_URL, max: 10 });
const redis = createClient({ url: REDIS_URL });
redis.on("error", (err) => console.error("redis", err));
await redis.connect();

const presentationAssets = {
  index: await fs.readFile(new URL("../presentation/index.html", import.meta.url)),
  css: await fs.readFile(new URL("../presentation/styles.css", import.meta.url)),
  js: await fs.readFile(new URL("../presentation/app.js", import.meta.url)),
  manifest: await fs.readFile(new URL("../presentation/manifest.webmanifest", import.meta.url)),
  icon: await fs.readFile(new URL("../presentation/icon.svg", import.meta.url)),
};

const migration = await fs.readFile(new URL("../migrations/001_init.sql", import.meta.url), "utf8");
const presentationMigration = await fs.readFile(new URL("../migrations/002_presentation.sql", import.meta.url), "utf8");
await db.query(migration);
await db.query(presentationMigration);

const app = Fastify({
  logger: true,
  bodyLimit: 32 * 1024,
  requestTimeout: 5000,
});
await app.register(cors, { origin: true });
await app.register(websocket);

const demoHits = new Map();

function demoRateLimit(req, reply) {
  const key = String(req.ip || "unknown");
  const now = Date.now();
  const bucket = demoHits.get(key) || { count: 0, resetAt: now + 60_000 };
  if (now >= bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60_000;
  }
  bucket.count += 1;
  demoHits.set(key, bucket);
  if (bucket.count > 120) {
    return reply.code(429).send({ error: "demo_rate_limited" });
  }
}

async function auth(req, reply) {
  const value = req.headers.authorization || "";
  const allowed = new Set(
    [API_TOKEN, MOBILE_DEMO_TOKEN].filter(Boolean).map((token) => `Bearer ${token}`)
  );
  if (allowed.size === 0) return;
  if (!allowed.has(value)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
}

async function demoOnly(req, reply) {
  const limited = demoRateLimit(req, reply);
  if (limited) return limited;
  req.vertexDemo = true;
}

function assertDemoIdentity(value, kind) {
  const text = String(value || "");
  const allowed =
    kind === "user" ? /^demo-client-[a-z0-9_-]{1,64}$/ :
    kind === "driver" ? /^demo-driver-[a-z0-9_-]{1,64}$/ :
    false;
  if (!allowed) {
    const error = new Error("demo_identity_required");
    error.statusCode = 403;
    throw error;
  }
  return text;
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

app.get("/", async (_req, reply) => reply.redirect("/presentation"));
app.get("/presentation", async (_req, reply) => reply.type("text/html; charset=utf-8").send(presentationAssets.index));
app.get("/presentation/", async (_req, reply) => reply.type("text/html; charset=utf-8").send(presentationAssets.index));
app.get("/presentation/styles.css", async (_req, reply) => reply.type("text/css; charset=utf-8").send(presentationAssets.css));
app.get("/presentation/app.js", async (_req, reply) => reply.type("text/javascript; charset=utf-8").send(presentationAssets.js));
app.get("/presentation/manifest.webmanifest", async (_req, reply) => reply.type("application/manifest+json").send(presentationAssets.manifest));
app.get("/presentation/icon.svg", async (_req, reply) => reply.type("image/svg+xml").send(presentationAssets.icon));

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



app.get("/demo/health", { preHandler: demoOnly }, async () => {
  const dbOk = await db.query("select 1 as ok");
  const redisOk = await redis.ping();
  return {
    service: "vertex-taxi-core-demo",
    version: "0.3.0",
    status: dbOk.rows[0]?.ok === 1 && redisOk === "PONG" ? "ok" : "degraded",
    demo: true,
  };
});

app.post("/demo/v1/quotes", { preHandler: demoOnly }, async (req, reply) => {
  const input = quoteInput.parse(req.body);
  assertDemoIdentity(input.userId, "user");
  const fare = fareMinor(input.distanceKm);
  const result = await db.query(
    `insert into taxi_quotes
      (user_id,pickup_lat,pickup_lng,pickup_label,destination_lat,destination_lng,
       destination_label,service_class,distance_km,fare_minor,currency,expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'USD',now()+interval '15 minutes')
     returning *`,
    [input.userId,input.pickup.lat,input.pickup.lng,input.pickup.label,
     input.destination.lat,input.destination.lng,input.destination.label,
     input.serviceClass,input.distanceKm,fare]
  );
  reply.code(201);
  return { data: result.rows[0] };
});

app.post("/demo/v1/rides", { preHandler: demoOnly }, async (req, reply) => {
  const input = rideInput.parse(req.body);
  assertDemoIdentity(input.userId, "user");
  const q = await db.query(
    "select * from taxi_quotes where id=$1 and user_id=$2 and expires_at>now()",
    [input.quoteId,input.userId]
  );
  if (!q.rowCount) return reply.code(409).send({ error: "quote_expired_or_missing" });
  const quote = q.rows[0];
  const r = await db.query(
    `insert into taxi_rides
     (user_id,quote_id,state,service_class,pickup_lat,pickup_lng,pickup_label,
      destination_lat,destination_lng,destination_label,fare_minor,currency)
     values ($1,$2,'REQUESTED',$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [input.userId,quote.id,quote.service_class,quote.pickup_lat,quote.pickup_lng,
     quote.pickup_label,quote.destination_lat,quote.destination_lng,
     quote.destination_label,quote.fare_minor,quote.currency]
  );
  reply.code(201);
  return { data:r.rows[0] };
});

app.post("/demo/v1/drivers/:driverId/location", { preHandler: demoOnly }, async (req, reply) => {
  const driverId=assertDemoIdentity(req.params.driverId,"driver");
  const input=locationInput.parse(req.body);
  if (input.accuracyM > 80) return reply.code(422).send({ error: "location_accuracy_too_low" });
  const cell=latLngToCell(input.lat,input.lng,H3_RESOLUTION);
  const previous=await redis.hGet(locationKey(driverId),"cell");
  const tx=redis.multi();
  if(previous && previous!==cell) tx.sRem(cellKey(previous),driverId);
  tx.hSet(locationKey(driverId),{
    lat:String(input.lat),lng:String(input.lng),accuracyM:String(input.accuracyM),
    heading:String(input.heading ?? ""),speedMps:String(input.speedMps ?? ""),
    available:String(input.available),serviceClasses:JSON.stringify(input.serviceClasses),
    cell,updatedAt:String(Date.now()),
  });
  tx.expire(locationKey(driverId),LOCATION_TTL_SECONDS);
  tx.sAdd(cellKey(cell),driverId);
  tx.expire(cellKey(cell),LOCATION_TTL_SECONDS*3);
  await tx.exec();
  return {data:{driverId,cell,ttlSeconds:LOCATION_TTL_SECONDS}};
});

app.get("/demo/v1/dispatch/:rideId/candidates", { preHandler: demoOnly }, async (req, reply) => {
  const rideId=z.string().uuid().parse(req.params.rideId);
  const r=await db.query("select * from taxi_rides where id=$1",[rideId]);
  if(!r.rowCount) return reply.code(404).send({error:"ride_not_found"});
  if(!String(r.rows[0].user_id).startsWith("demo-client-")) return reply.code(403).send({error:"demo_only"});
  const candidates=(await candidatesForRide(r.rows[0]))
    .filter(candidate => String(candidate.driverId).startsWith("demo-driver-"));
  return {data:candidates};
});

app.post("/demo/v1/offers", { preHandler: demoOnly }, async (req, reply) => {
  const input=offerInput.parse(req.body);
  assertDemoIdentity(input.driverId,"driver");
  const rideCheck=await db.query("select user_id from taxi_rides where id=$1",[input.rideId]);
  if(!rideCheck.rowCount || !String(rideCheck.rows[0].user_id).startsWith("demo-client-"))
    return reply.code(403).send({error:"demo_only"});
  const offerId=crypto.randomUUID();
  const expiresAt=new Date(Date.now()+OFFER_TTL_MS);
  const rideLease=await redis.set(rideLeaseKey(input.rideId),input.driverId,{NX:true,PX:OFFER_TTL_MS});
  if(rideLease!=="OK") return reply.code(409).send({error:"ride_already_reserved"});
  const driverLease=await redis.set(driverLeaseKey(input.driverId),input.rideId,{NX:true,PX:OFFER_TTL_MS});
  if(driverLease!=="OK"){ await redis.del(rideLeaseKey(input.rideId)); return reply.code(409).send({error:"driver_already_reserved"}); }
  await db.query("insert into taxi_offers(id,ride_id,driver_id,state,expires_at) values($1,$2,$3,'OFFERED',$4)",[offerId,input.rideId,input.driverId,expiresAt]);
  await db.query("update taxi_rides set state='DRIVER_OFFERED',version=version+1,updated_at=now() where id=$1 and state in ('REQUESTED','SEARCHING')",[input.rideId]);
  reply.code(201);
  return {data:{offerId,expiresAt}};
});

app.post("/demo/v1/offers/:offerId/accept", { preHandler: demoOnly }, async (req, reply) => {
  const offerId=z.string().uuid().parse(req.params.offerId);
  const o=await db.query(
    `select o.*,r.user_id from taxi_offers o join taxi_rides r on r.id=o.ride_id where o.id=$1`,
    [offerId]
  );
  if(!o.rowCount) return reply.code(404).send({error:"offer_not_found"});
  const offer=o.rows[0];
  if(!String(offer.user_id).startsWith("demo-client-") || !String(offer.driver_id).startsWith("demo-driver-"))
    return reply.code(403).send({error:"demo_only"});
  if(offer.state!=="OFFERED" || new Date(offer.expires_at)<=new Date()) return reply.code(409).send({error:"offer_expired"});
  await db.query("update taxi_offers set state='ACCEPTED',updated_at=now() where id=$1",[offerId]);
  const updated=await db.query(
    `update taxi_rides set state='DRIVER_ASSIGNED',driver_id=$2,version=version+1,updated_at=now()
     where id=$1 and state='DRIVER_OFFERED' returning *`,
    [offer.ride_id,offer.driver_id]
  );
  return {data:updated.rows[0]};
});

const rideCommandInput = z.object({
  command: z.enum([
    "DRIVER_EN_ROUTE","ARRIVED","RIDER_ONBOARD","START","COMPLETE",
    "RIDER_CANCEL","DRIVER_CANCEL"
  ]),
  actorId: z.string().min(1).max(128).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const transitions = {
  DRIVER_EN_ROUTE: { from:["DRIVER_ASSIGNED"], to:"DRIVER_EN_ROUTE" },
  ARRIVED: { from:["DRIVER_EN_ROUTE"], to:"DRIVER_ARRIVED" },
  RIDER_ONBOARD: { from:["DRIVER_ARRIVED"], to:"RIDER_ONBOARD" },
  START: { from:["RIDER_ONBOARD","DRIVER_ARRIVED"], to:"IN_PROGRESS" },
  COMPLETE: { from:["IN_PROGRESS"], to:"COMPLETED" },
  RIDER_CANCEL: { from:["REQUESTED","SEARCHING","DRIVER_OFFERED","DRIVER_ASSIGNED","DRIVER_EN_ROUTE","DRIVER_ARRIVED","RIDER_ONBOARD"], to:"RIDER_CANCELLED" },
  DRIVER_CANCEL: { from:["DRIVER_OFFERED","DRIVER_ASSIGNED","DRIVER_EN_ROUTE","DRIVER_ARRIVED"], to:"DRIVER_CANCELLED" },
};

app.post("/v1/rides/:rideId/commands", { preHandler: auth }, async (req, reply) => {
  const rideId=z.string().uuid().parse(req.params.rideId);
  const input=rideCommandInput.parse(req.body);
  const rule=transitions[input.command];
  const client=await db.connect();
  try{
    await client.query("begin");
    const current=await client.query("select * from taxi_rides where id=$1 for update",[rideId]);
    if(!current.rowCount){ await client.query("rollback"); return reply.code(404).send({error:"ride_not_found"}); }
    const ride=current.rows[0];
    if(input.expectedVersion && Number(ride.version)!==input.expectedVersion){
      await client.query("rollback");
      return reply.code(409).send({error:"version_conflict",currentVersion:Number(ride.version)});
    }
    if(!rule.from.includes(ride.state)){
      await client.query("rollback");
      return reply.code(409).send({error:"invalid_transition",from:ride.state,command:input.command});
    }
    const updated=await client.query(
      "update taxi_rides set state=$2,version=version+1,updated_at=now() where id=$1 returning *",
      [rideId,rule.to]
    );
    const next=updated.rows[0];
    await client.query(
      `insert into taxi_outbox(event_type,aggregate_id,aggregate_version,payload,correlation_id)
       values($1,$2,$3,$4,$5)`,
      [`taxi.ride.v2.${String(rule.to).toLowerCase()}`,rideId,next.version,
       JSON.stringify({ride_id:rideId,state:rule.to,actor_id:input.actorId??null}),next.correlation_id]
    );
    await client.query(
      `insert into taxi_audit_timeline
       (ride_id,actor_type,actor_id,action,before_json,after_json,reason,correlation_id)
       values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [rideId,input.command.startsWith("DRIVER")?"driver":"user",input.actorId??null,input.command,
       JSON.stringify({state:ride.state,version:ride.version}),
       JSON.stringify({state:next.state,version:next.version}),
       "presentation_command",next.correlation_id]
    );
    await client.query("commit");
    if(["COMPLETED","RIDER_CANCELLED","DRIVER_CANCELLED"].includes(rule.to)){
      if(next.driver_id) await redis.del(driverLeaseKey(next.driver_id));
      await redis.del(rideLeaseKey(rideId));
    }
    await publishRideEvent(rideId,{type:"ride.state_changed",rideId,state:next.state,version:next.version});
    return {data:next};
  } catch(error){
    try{ await client.query("rollback"); }catch{}
    throw error;
  } finally { client.release(); }
});

app.get("/v1/users/:userId/rides", { preHandler: auth }, async (req) => {
  const userId=z.string().min(1).max(128).parse(req.params.userId);
  const r=await db.query(
    "select * from taxi_rides where user_id=$1 order by created_at desc limit 50",
    [userId]
  );
  return {data:r.rows};
});

app.get("/v1/drivers/:driverId/current", { preHandler: auth }, async (req) => {
  const driverId=z.string().min(1).max(128).parse(req.params.driverId);
  const r=await db.query(
    `select * from taxi_rides where driver_id=$1
     and state not in ('COMPLETED','RIDER_CANCELLED','DRIVER_CANCELLED','SYSTEM_CANCELLED','NO_DRIVER','EXPIRED')
     order by updated_at desc limit 1`,
    [driverId]
  );
  return {data:r.rows[0]??null};
});

app.get("/v1/drivers/:driverId/earnings", { preHandler: auth }, async (req) => {
  const driverId=z.string().min(1).max(128).parse(req.params.driverId);
  const r=await db.query(
    `select count(*)::int trips,
       coalesce(sum(fare_minor),0)::int gross_minor,
       coalesce(avg(fare_minor),0)::numeric(10,2) avg_fare_minor
     from taxi_rides where driver_id=$1 and state='COMPLETED'`,
    [driverId]
  );
  const rating=await db.query(
    "select coalesce(avg(stars),0)::numeric(3,2) rating from taxi_ratings where driver_id=$1",
    [driverId]
  );
  return {data:{...r.rows[0],rating:Number(rating.rows[0]?.rating??0),currency:"USD"}};
});

app.post("/v1/rides/:rideId/demo-payment", { preHandler: auth }, async (req, reply) => {
  const rideId=z.string().uuid().parse(req.params.rideId);
  const body=z.object({
    last4:z.string().regex(/^\d{4}$/).default("4242"),
  }).parse(req.body??{});
  const r=await db.query("select * from taxi_rides where id=$1",[rideId]);
  if(!r.rowCount) return reply.code(404).send({error:"ride_not_found"});
  const ride=r.rows[0];
  if(ride.state!=="COMPLETED") return reply.code(409).send({error:"ride_not_completed"});
  const total=Number(ride.fare_minor);
  const fee=Math.max(20,Math.round(total*0.05));
  const waiting=0;
  const subtotal=Math.max(0,total-fee-waiting);
  const payment=await db.query(
    `insert into taxi_demo_payments
     (ride_id,method,last4,status,subtotal_minor,waiting_minor,service_fee_minor,total_minor,currency)
     values($1,'demo_card',$2,'PAID',$3,$4,$5,$6,$7)
     on conflict(ride_id) do update set last4=excluded.last4
     returning *`,
    [rideId,body.last4,subtotal,waiting,fee,total,ride.currency]
  );
  return {data:payment.rows[0]};
});

app.post("/v1/rides/:rideId/rating", { preHandler: auth }, async (req, reply) => {
  const rideId=z.string().uuid().parse(req.params.rideId);
  const body=z.object({
    userId:z.string().min(1).max(128),
    stars:z.number().int().min(1).max(5),
    comment:z.string().max(500).optional(),
  }).parse(req.body);
  const r=await db.query("select * from taxi_rides where id=$1",[rideId]);
  if(!r.rowCount) return reply.code(404).send({error:"ride_not_found"});
  const ride=r.rows[0];
  if(ride.state!=="COMPLETED") return reply.code(409).send({error:"ride_not_completed"});
  if(ride.user_id!==body.userId) return reply.code(403).send({error:"forbidden"});
  const rating=await db.query(
    `insert into taxi_ratings(ride_id,user_id,driver_id,stars,comment)
     values($1,$2,$3,$4,$5)
     on conflict(ride_id) do update set stars=excluded.stars,comment=excluded.comment
     returning *`,
    [rideId,body.userId,ride.driver_id,body.stars,body.comment??null]
  );
  return {data:rating.rows[0]};
});

app.get("/v1/admin/summary", { preHandler: auth }, async () => {
  const states=await db.query("select state,count(*)::int count from taxi_rides group by state");
  const total=await db.query("select count(*)::int rides,coalesce(sum(fare_minor),0)::int gross_minor from taxi_rides");
  const drivers=await redis.keys("taxi:driver:*:location");
  const recent=await db.query(
    "select * from taxi_rides order by created_at desc limit 20"
  );
  return {
    data:{
      rides:total.rows[0],
      states:Object.fromEntries(states.rows.map(row=>[row.state,row.count])),
      onlineDrivers:drivers.length,
      recentRides:recent.rows,
      currency:"USD",
    }
  };
});


async function getDemoRideOrReply(rideId, reply) {
  const r=await db.query("select * from taxi_rides where id=$1",[rideId]);
  if(!r.rowCount) {
    reply.code(404).send({error:"ride_not_found"});
    return null;
  }
  const ride=r.rows[0];
  if(!String(ride.user_id).startsWith("demo-client-")) {
    reply.code(403).send({error:"demo_only"});
    return null;
  }
  return ride;
}

app.get("/demo/v1/rides/:rideId", { preHandler: demoOnly }, async (req, reply) => {
  const rideId=z.string().uuid().parse(req.params.rideId);
  const ride=await getDemoRideOrReply(rideId,reply);
  if(!ride) return;
  return {data:ride};
});

app.post("/demo/v1/rides/:rideId/commands", { preHandler: demoOnly }, async (req, reply) => {
  const rideId=z.string().uuid().parse(req.params.rideId);
  const input=rideCommandInput.parse(req.body);
  if(input.actorId){
    const actor=String(input.actorId);
    const ok=actor.startsWith("demo-client-") || actor.startsWith("demo-driver-");
    if(!ok) return reply.code(403).send({error:"demo_identity_required"});
  }
  const client=await db.connect();
  try{
    await client.query("begin");
    const current=await client.query("select * from taxi_rides where id=$1 for update",[rideId]);
    if(!current.rowCount){ await client.query("rollback"); return reply.code(404).send({error:"ride_not_found"}); }
    const ride=current.rows[0];
    if(!String(ride.user_id).startsWith("demo-client-")){
      await client.query("rollback");
      return reply.code(403).send({error:"demo_only"});
    }
    const rule=transitions[input.command];
    if(input.expectedVersion && Number(ride.version)!==input.expectedVersion){
      await client.query("rollback");
      return reply.code(409).send({error:"version_conflict",currentVersion:Number(ride.version)});
    }
    if(!rule.from.includes(ride.state)){
      await client.query("rollback");
      return reply.code(409).send({error:"invalid_transition",from:ride.state,command:input.command});
    }
    const updated=await client.query(
      "update taxi_rides set state=$2,version=version+1,updated_at=now() where id=$1 returning *",
      [rideId,rule.to]
    );
    const next=updated.rows[0];
    await client.query(
      `insert into taxi_outbox(event_type,aggregate_id,aggregate_version,payload,correlation_id)
       values($1,$2,$3,$4,$5)`,
      [`taxi.ride.v2.${String(rule.to).toLowerCase()}`,rideId,next.version,
       JSON.stringify({ride_id:rideId,state:rule.to,actor_id:input.actorId??null,demo:true}),next.correlation_id]
    );
    await client.query(
      `insert into taxi_audit_timeline
       (ride_id,actor_type,actor_id,action,before_json,after_json,reason,correlation_id)
       values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [rideId,input.command.startsWith("DRIVER")?"driver":"user",input.actorId??null,input.command,
       JSON.stringify({state:ride.state,version:ride.version}),
       JSON.stringify({state:next.state,version:next.version}),
       "presentation_demo_command",next.correlation_id]
    );
    await client.query("commit");
    if(["COMPLETED","RIDER_CANCELLED","DRIVER_CANCELLED"].includes(rule.to)){
      if(next.driver_id) await redis.del(driverLeaseKey(next.driver_id));
      await redis.del(rideLeaseKey(rideId));
    }
    await publishRideEvent(rideId,{type:"ride.state_changed",rideId,state:next.state,version:next.version,demo:true});
    return {data:next};
  }catch(error){
    try{await client.query("rollback");}catch{}
    throw error;
  }finally{
    client.release();
  }
});

app.get("/demo/v1/users/:userId/rides", { preHandler: demoOnly }, async (req, reply) => {
  const userId=assertDemoIdentity(req.params.userId,"user");
  const r=await db.query(
    "select * from taxi_rides where user_id=$1 order by created_at desc limit 50",
    [userId]
  );
  return {data:r.rows};
});

app.get("/demo/v1/drivers/:driverId/current", { preHandler: demoOnly }, async (req) => {
  const driverId=assertDemoIdentity(req.params.driverId,"driver");
  const r=await db.query(
    `select * from taxi_rides where driver_id=$1
     and state not in ('COMPLETED','RIDER_CANCELLED','DRIVER_CANCELLED','SYSTEM_CANCELLED','NO_DRIVER','EXPIRED')
     order by updated_at desc limit 1`,
    [driverId]
  );
  return {data:r.rows[0]??null};
});

app.get("/demo/v1/drivers/:driverId/earnings", { preHandler: demoOnly }, async (req) => {
  const driverId=assertDemoIdentity(req.params.driverId,"driver");
  const r=await db.query(
    `select count(*)::int trips,
       coalesce(sum(fare_minor),0)::int gross_minor,
       coalesce(avg(fare_minor),0)::numeric(10,2) avg_fare_minor
     from taxi_rides where driver_id=$1 and state='COMPLETED'`,
    [driverId]
  );
  const rating=await db.query(
    "select coalesce(avg(stars),0)::numeric(3,2) rating from taxi_ratings where driver_id=$1",
    [driverId]
  );
  return {data:{...r.rows[0],rating:Number(rating.rows[0]?.rating??0),currency:"USD"}};
});

app.post("/demo/v1/rides/:rideId/demo-payment", { preHandler: demoOnly }, async (req, reply) => {
  const rideId=z.string().uuid().parse(req.params.rideId);
  const body=z.object({last4:z.string().regex(/^\d{4}$/).default("4242")}).parse(req.body??{});
  const ride=await getDemoRideOrReply(rideId,reply);
  if(!ride) return;
  if(ride.state!=="COMPLETED") return reply.code(409).send({error:"ride_not_completed"});
  const total=Number(ride.fare_minor);
  const fee=Math.max(20,Math.round(total*0.05));
  const waiting=0;
  const subtotal=Math.max(0,total-fee-waiting);
  const payment=await db.query(
    `insert into taxi_demo_payments
     (ride_id,method,last4,status,subtotal_minor,waiting_minor,service_fee_minor,total_minor,currency)
     values($1,'demo_card',$2,'PAID',$3,$4,$5,$6,$7)
     on conflict(ride_id) do update set last4=excluded.last4
     returning *`,
    [rideId,body.last4,subtotal,waiting,fee,total,ride.currency]
  );
  return {data:payment.rows[0]};
});

app.post("/demo/v1/rides/:rideId/rating", { preHandler: demoOnly }, async (req, reply) => {
  const rideId=z.string().uuid().parse(req.params.rideId);
  const body=z.object({
    userId:z.string().min(1).max(128),
    stars:z.number().int().min(1).max(5),
    comment:z.string().max(500).optional(),
  }).parse(req.body);
  assertDemoIdentity(body.userId,"user");
  const ride=await getDemoRideOrReply(rideId,reply);
  if(!ride) return;
  if(ride.state!=="COMPLETED") return reply.code(409).send({error:"ride_not_completed"});
  if(ride.user_id!==body.userId) return reply.code(403).send({error:"forbidden"});
  const rating=await db.query(
    `insert into taxi_ratings(ride_id,user_id,driver_id,stars,comment)
     values($1,$2,$3,$4,$5)
     on conflict(ride_id) do update set stars=excluded.stars,comment=excluded.comment
     returning *`,
    [rideId,body.userId,ride.driver_id,body.stars,body.comment??null]
  );
  return {data:rating.rows[0]};
});

app.get("/demo/v1/admin/summary", { preHandler: demoOnly }, async () => {
  const states=await db.query(
    "select state,count(*)::int count from taxi_rides where user_id like 'demo-client-%' group by state"
  );
  const total=await db.query(
    "select count(*)::int rides,coalesce(sum(fare_minor),0)::int gross_minor from taxi_rides where user_id like 'demo-client-%'"
  );
  const drivers=(await redis.keys("taxi:driver:demo-driver-*:location")).length;
  const recent=await db.query(
    "select * from taxi_rides where user_id like 'demo-client-%' order by created_at desc limit 20"
  );
  return {
    data:{
      rides:total.rows[0],
      states:Object.fromEntries(states.rows.map(row=>[row.state,row.count])),
      onlineDrivers:drivers,
      recentRides:recent.rows,
      currency:"USD",
      demo:true,
    }
  };
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

const publicAssets = new Map([
  ["/", { file:"../public/index.html", type:"text/html; charset=utf-8" }],
  ["/index.html", { file:"../public/index.html", type:"text/html; charset=utf-8" }],
  ["/app.js", { file:"../presentation/app.js", type:"text/javascript; charset=utf-8" }],
  ["/styles.css", { file:"../public/styles.css", type:"text/css; charset=utf-8" }],
  ["/manifest.webmanifest", { file:"../public/manifest.webmanifest", type:"application/manifest+json" }],
  ["/icon.svg", { file:"../public/icon.svg", type:"image/svg+xml" }],
]);

for (const [route, asset] of publicAssets) {
  app.get(route, async (_req, reply) => {
    const content = await fs.readFile(new URL(asset.file, import.meta.url));
    reply.type(asset.type);
    reply.header("cache-control", route === "/" || route === "/index.html" ? "no-cache" : "public, max-age=300");
    return reply.send(content);
  });
}

app.setErrorHandler((err, req, reply)=>{
  req.log.error(err);
  if(err?.name==="ZodError") return reply.code(400).send({error:"invalid_request",issues:err.issues});
  if(err?.statusCode) return reply.code(err.statusCode).send({error:err.message});
  reply.code(500).send({error:"internal_error"});
});

await app.listen({port:PORT,host:"0.0.0.0"});
