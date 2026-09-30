import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('Vertex Taxi manifest is an external integration with no private database boundary', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'modules/taxi/manifest.json'),'utf8'));
  assert.equal(manifest.id, 'taxi');
  assert.equal(manifest.integration.databaseAccess, 'none');
  assert.equal(manifest.integration.privateSchema, false);
  assert.equal(manifest.integration.basePath, '/integration/v1');
});

test('Taxi integration contract requires delegated identity and idempotency for mutations', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root,'contracts/taxi-integration-v1.json'),'utf8'));
  assert.equal(contract.version, 1);
  assert.equal(contract.authentication.type, 'delegated-identity');
  assert.equal(contract.endpoints.createRide.idempotencyRequired, true);
  assert.equal(contract.endpoints.commandRide.idempotencyRequired, true);
  assert.equal(contract.responseRules.sourceOfTruth, 'vertex-taxi-core');
});

test('Taxi event contract is at-least-once and deduplicated by event id', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root,'contracts/taxi-events-v1.json'),'utf8'));
  assert.equal(contract.envelope.delivery, 'at-least-once');
  assert.equal(contract.envelope.consumerRule, 'deduplicate_by_event_id');
  assert.ok(contract.events['taxi.ride.v1.driver_assigned']);
  assert.ok(contract.events['taxi.payment.v1.completed']);
});
