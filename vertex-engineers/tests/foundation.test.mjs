import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const manifest = readJson("module.json");
for (const key of ["id","name","version","core","permissions","services","events","workflows"]) {
  assert.ok(Object.hasOwn(manifest, key), `module manifest missing ${key}`);
}
assert.equal(manifest.id, "engineers");
assert.equal(manifest.integration_mode, "detached_until_approved");

const catalog = readJson("catalog/product-references.json");
assert.ok(catalog.references.length >= 8);
for (const item of catalog.references) {
  assert.equal(item.relationship, "reference_only");
  assert.match(item.source_url, /^https:\/\//);
  assert.ok(item.source_checked_at);
}

const entities = readJson("domain/entities-v1.json");
for (const required of ["project","engineering_asset","elevator_asset","hvac_asset","work_order","technician","compliance_document"]) {
  assert.ok(entities.entities[required], `missing entity ${required}`);
}

const design = readJson("ui/design-system.json");
assert.equal(design.palette.sand, "#D5B98C");
assert.ok(design.primary_screens.some((x) => x.id === "elevator-center"));
assert.ok(design.primary_screens.some((x) => x.id === "hvac-studio"));

const api = readJson("contracts/api-v1.openapi.json");
assert.equal(api.info.version, "0.1.0");
assert.ok(api.paths["/projects"]);
assert.ok(api.paths["/work-orders"]);

console.log("VERTEX Engineers foundation checks: PASS");
