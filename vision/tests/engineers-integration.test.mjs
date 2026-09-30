import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {PGlite} from "@electric-sql/pglite";
import {migrate} from "../backend/migrate.mjs";
import core from "../platform/registry.cjs";

const root=path.resolve(import.meta.dirname,"../..");
const read=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));

test("Engineers public manifest mirrors standalone release contract",()=>{
  const standalone=read("vertex-engineers/module.json");
  const vision=read("vision/modules/engineers/manifest.json");
  for(const key of ["id","name","version","core","permissions","services","events","workflows"]){
    assert.deepEqual(vision[key],standalone[key],key+" mismatch");
  }
});

test("Vision registry exposes Engineers 0.2 as local-tested but not cloud-enabled",()=>{
  const engineers=core.module("engineers");
  assert.ok(engineers);
  assert.equal(engineers.name,"VERTEX Engineers");
  assert.equal(engineers.version,"0.2.0");
  assert.equal(engineers.backend,"local-tested");
  assert.equal(engineers.cloudEnabled,false);
  assert.equal(core.canLaunch("engineers","engineering-request"),true);
});

test("staging integration contract is registered but disabled by default",()=>{
  const integration=read("vision/modules/engineers/integration.json");
  assert.equal(integration.registration_state,"REGISTERED");
  assert.equal(integration.enable_by_default,false);
  assert.equal(integration.cloud_enabled,false);
  assert.equal(integration.runtime_binding,"not_connected");
  assert.equal(integration.database_binding,"not_applied");
  assert.equal(integration.boundary.direct_private_table_access,false);
  assert.equal(integration.boundary.direct_private_code_imports,false);
});

test("migration updates metadata and permissions without enabling installations",()=>{
  const sql=fs.readFileSync(path.join(root,"vision/database/migrations/0006_engineers_module_v0_2.sql"),"utf8");
  assert.match(sql,/engineers\.dashboard\.read/);
  assert.match(sql,/VERTEX Engineers/);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.vision_module_installations/i);
  assert.doesNotMatch(sql,/update\s+public\.vision_module_installations/i);
  assert.doesNotMatch(sql,/state\s*=\s*['"]ENABLED['"]/i);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.vision_role_permissions/i);
});

test("migrated database registers Engineers version 0.2 without installations",async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec("create role anon; create role authenticated;");
  await migrate(db);
  const definition=(await db.query("select id,name,version from public.vision_module_definitions where id='engineers'")).rows[0];
  assert.deepEqual(definition,{id:"engineers",name:"VERTEX Engineers",version:"0.2.0"});
  const installations=(await db.query("select count(*)::int as n from public.vision_module_installations where module_id='engineers'")).rows[0];
  assert.equal(installations.n,0);
  const permissions=(await db.query("select count(*)::int as n from public.vision_permissions where code like 'engineers.%'")).rows[0];
  assert.equal(permissions.n,15);
  const grants=(await db.query("select count(*)::int as n from public.vision_role_permissions rp join public.vision_permissions p on p.id=rp.permission_id where p.code like 'engineers.%'")).rows[0];
  assert.equal(grants.n,0);
});
