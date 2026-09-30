import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const pkg = readJson("package.json");
const moduleManifest = readJson("module.json");
const api = readJson("contracts/api-v1.openapi.json");
const screens = readJson("ui/screens-v0.2.json");
const design = readJson("ui/design-manifest-v0.2.json");
const release = readJson("release/release-manifest.json");

const expectedVersion = "0.2.0";
for (const [label, version] of [
  ["package", pkg.version],
  ["module", moduleManifest.version],
  ["api", api.info.version],
  ["screens", screens.version],
  ["design", design.module_version],
  ["release", release.version]
]) {
  assert.equal(version, expectedVersion, `${label} version mismatch`);
}

assert.equal(moduleManifest.id, "engineers");
assert.equal(moduleManifest.integration_mode, "detached_until_approved");
assert.equal(design.canva.design_id, "DAHWtHztFic");
assert.equal(design.branch, "vertex-engineers-release-0.2.0");
assert.equal(release.branch, "vertex-engineers-release-0.2.0");
assert.equal(release.integration.vision_merge_status, "not_merged");
assert.equal(release.integration.production_master_modified, false);
assert.equal(release.integration.direct_private_vision_code_coupling_allowed, false);

const requiredPaths = [
  "/health",
  "/projects",
  "/projects/{projectId}/stage",
  "/assets",
  "/assets/elevators",
  "/assets/hvac",
  "/assets/{assetId}/commission",
  "/work-orders",
  "/work-orders/{workOrderId}/transition",
  "/product-references"
];
for (const route of requiredPaths) {
  assert.ok(api.paths[route], `API route missing: ${route}`);
}

const srcDir = path.join(root, "src");
const codeFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(mjs|js|cjs|ts|json)$/.test(entry.name)) codeFiles.push(full);
  }
}
walk(srcDir);

for (const file of codeFiles) {
  const text = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(
    text,
    /(?:from\s+["'][^"']*vision\/|require\(["'][^"']*vision\/|import\(["'][^"']*vision\/)/i,
    `private VERTEX Vision coupling detected in ${path.relative(root, file)}`
  );
}

const sql = fs.readFileSync(path.join(root, "database/schema-v1.sql"), "utf8");
assert.match(sql, /tenant_id text not null/);
assert.match(sql, /organization_id text not null/);
assert.match(sql, /engineers_event_outbox/);

console.log("VERTEX Engineers release-check: PASS");
console.log(JSON.stringify({
  version: expectedVersion,
  canva_design_id: design.canva.design_id,
  vision_merge_status: release.integration.vision_merge_status,
  production_master_modified: release.integration.production_master_modified
}));
