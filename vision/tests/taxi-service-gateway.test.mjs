import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../backend/worker.mjs';

const env = {
  VISION_ENV: 'staging',
  SUPABASE_STAGING_REF: 'abcdefghijklmnopqrst',
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

const authFetch = async (url) => {
  if (url.endsWith('/auth/v1/user')) {
    return new Response(JSON.stringify({ id: '00000000-0000-0000-0000-000000000001' }), { status: 200 });
  }
  throw new Error('unexpected upstream');
};

test('Taxi gateway fails closed when neither service binding nor HTTP fallback is configured', async () => {
  const request = new Request('https://vision-staging.example/api/taxi/capabilities', {
    headers: { authorization: 'Bearer demo', 'x-vertex-tenant-id': '00000000-0000-0000-0000-000000000001', 'x-vertex-organization-id': '00000000-0000-0000-0000-000000000001' },
  });
  const response = await handle(request, env, authFetch);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'taxi_integration_not_configured' });
});

test('Taxi gateway uses the Service Binding when configured', async () => {
  const taxi = {
    async fetch(request) {
      assert.equal(request.url, 'https://vertex-taxi-core.internal/integration/v1/capabilities');
      assert.equal(request.headers.get('authorization'), 'Bearer demo');
      return Response.json({ data: { module: 'taxi', sourceOfTruth: 'vertex-taxi-core' } }, { status: 200 });
    },
  };
  const request = new Request('https://vision-staging.example/api/taxi/capabilities', {
    headers: {
      authorization: 'Bearer demo',
      'x-vertex-tenant-id': '00000000-0000-0000-0000-000000000001',
      'x-vertex-organization-id': '00000000-0000-0000-0000-000000000001',
    },
  });
  const response = await handle(request, { ...env, VERTEX_TAXI_CORE: taxi }, authFetch);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.module, 'taxi');
});

test('Taxi mutation forwards idempotency and tenant context through the binding', async () => {
  const taxi = {
    async fetch(request) {
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('idempotency-key'), 'ride-123');
      assert.equal(request.headers.get('x-vertex-tenant-id'), '00000000-0000-0000-0000-000000000001');
      const payload = await request.json();
      assert.equal(payload.quoteId, 'q-1');
      return Response.json({ data: { rideId: 'r-1', status: 'SEARCHING' } }, { status: 201 });
    },
  };
  const request = new Request('https://vision-staging.example/api/taxi/rides', {
    method: 'POST',
    headers: {
      authorization: 'Bearer demo',
      'content-type': 'application/json',
      'idempotency-key': 'ride-123',
      'x-vertex-tenant-id': '00000000-0000-0000-0000-000000000001',
      'x-vertex-organization-id': '00000000-0000-0000-0000-000000000001',
    },
    body: JSON.stringify({ quoteId: 'q-1' }),
  });
  const response = await handle(request, { ...env, VERTEX_TAXI_CORE: taxi }, authFetch);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.rideId, 'r-1');
});

test('Taxi mutation is rejected without idempotency', async () => {
  const request = new Request('https://vision-staging.example/api/taxi/rides', {
    method: 'POST',
    headers: {
      authorization: 'Bearer demo',
      'content-type': 'application/json',
      'x-vertex-tenant-id': '00000000-0000-0000-0000-000000000001',
      'x-vertex-organization-id': '00000000-0000-0000-0000-000000000001',
    },
    body: JSON.stringify({ quoteId: 'q-1' }),
  });
  const response = await handle(request, { ...env, VERTEX_TAXI_CORE: { fetch: async () => { throw new Error('must not call'); } } }, authFetch);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'idempotency_required' });
});
