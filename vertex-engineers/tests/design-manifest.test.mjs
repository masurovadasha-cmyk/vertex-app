import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

test("design manifest matches module and UI contract", () => {
  const manifest = readJson("ui/design-manifest-v0.2.json");
  const moduleManifest = readJson("module.json");
  const screens = readJson("ui/screens-v0.2.json");

  assert.equal(manifest.module_id, moduleManifest.id);
  assert.equal(manifest.module_version, moduleManifest.version);
  assert.equal(manifest.module_version, screens.version);
  assert.equal(manifest.canva.design_id, "DAHWtHztFic");
  assert.equal(manifest.canva.audit_status, "manual_corrections_committed");
  assert.equal(manifest.integration.status, "prepared_not_merged");
  assert.equal(manifest.integration.production_master_modified, false);
});
