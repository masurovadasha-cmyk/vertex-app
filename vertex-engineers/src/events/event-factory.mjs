import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.resolve(here, "../../contracts/events-v1.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

function requireFields(object, fields, scope) {
  for (const field of fields) {
    if (object[field] === undefined || object[field] === null || object[field] === "") {
      throw new Error(`Missing ${scope} field: ${field}`);
    }
  }
}

export function buildEngineersEvent(name, context, payload) {
  const definition = contract.events[name];
  if (!definition) throw new Error(`Unknown engineers event: ${name}`);

  requireFields(context, contract.shared_required, "context");
  requireFields(payload, definition.required, "payload");

  return Object.freeze({
    name,
    schema_version: contract.version,
    ...context,
    payload: { ...payload }
  });
}

export function supportedEngineersEvents() {
  return Object.keys(contract.events);
}
