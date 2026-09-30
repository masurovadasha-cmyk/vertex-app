import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const schema = fs.readFileSync(path.join(root, "database/schema-v1.sql"), "utf8");
const rls = fs.readFileSync(path.join(root, "database/rls-v1.sql"), "utf8");

test("business tables carry tenant and organization scope", () => {
  const tables = [
    "engineers_projects",
    "engineers_assets",
    "engineers_work_orders",
    "engineers_technicians",
    "engineers_compliance_documents",
    "engineers_inspections",
    "engineers_suppliers",
    "engineers_procurement_orders",
    "engineers_event_outbox"
  ];
  for (const table of tables) {
    const start = schema.indexOf(`create table if not exists ${table}`);
    assert.ok(start >= 0, `missing ${table}`);
    const end = schema.indexOf("\n);", start);
    const block = schema.slice(start, end);
    assert.match(block, /tenant_id text not null/);
    assert.match(block, /organization_id text not null/);
  }
});

test("asset relationships preserve composite scope in foreign keys", () => {
  assert.match(schema, /foreign key \(tenant_id, organization_id, project_id\)/);
  assert.match(schema, /foreign key \(tenant_id, organization_id, asset_id\)/);
});

test("event outbox and RLS reference are present", () => {
  assert.match(schema, /engineers_event_outbox/);
  assert.match(rls, /enable row level security/);
  assert.match(rls, /app\.tenant_id/);
  assert.match(rls, /app\.organization_id/);
});
