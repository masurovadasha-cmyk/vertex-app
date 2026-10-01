import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../backend/worker.mjs';

const env = {
  VISION_ENV: 'staging',
  SUPABASE_STAGING_REF: 'abcdefghijklmnopqrst',
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

const authFetch = async (url, options = {}) => {
  if (url.endsWith('/auth/v1/user')) {
    return new Response(JSON.stringify({ id: '00000000-0000-0000-0000-000000000001' }), { status: 200 });
  }
  if (url.endsWith('/rest/v1/rpc/vision_external_module_context_allowed')) {
    assert.equal(options.method, 'POST');
    const context = JSON.parse(options.body);
    assert.deepEqual(context, {
      t: '00000000-0000-0000-0000-000000000001',
      org: '00000000-0000-0000-0000-000000000001',
      module_id: 'taxi',
    });
    return Response.json(true);
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
      assert.equal(request.headers.get('x-vertex-user-id'), '00000000-0000-0000-0000-000000000001');
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
      assert.equal(request.headers.get('x-vertex-user-id'), '00000000-0000-0000-0000-000000000001');
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


test('Taxi gateway rejects a tenant or organization context that the verified user cannot delegate', async () => {
  const deniedFetch = async (url) => {
    if (url.endsWith('/auth/v1/user')) {
      return Response.json({ id: '00000000-0000-0000-0000-000000000001' });
    }
    if (url.endsWith('/rest/v1/rpc/vision_external_module_context_allowed')) {
      return Response.json(false);
    }
    throw new Error('unexpected upstream');
  };
  const taxi = { fetch: async () => { throw new Error('must not call Taxi Core'); } };
  const request = new Request('https://vision-staging.example/api/taxi/capabilities', {
    headers: {
      authorization: 'Bearer demo',
      'x-vertex-tenant-id': '00000000-0000-0000-0000-000000000001',
      'x-vertex-organization-id': '00000000-0000-0000-0000-000000000001',
    },
  });
  const response = await handle(request, { ...env, VERTEX_TAXI_CORE: taxi }, deniedFetch);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'forbidden' });
});

test('Taxi gateway ignores a spoofed client user id and forwards the verified identity', async () => {
  const taxi = {
    async fetch(request) {
      assert.equal(request.headers.get('x-vertex-user-id'), '00000000-0000-0000-0000-000000000001');
      return Response.json({ data: { module: 'taxi' } });
    },
  };
  const request = new Request('https://vision-staging.example/api/taxi/capabilities', {
    headers: {
      authorization: 'Bearer demo',
      'x-vertex-user-id': 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'x-vertex-tenant-id': '00000000-0000-0000-0000-000000000001',
      'x-vertex-organization-id': '00000000-0000-0000-0000-000000000001',
    },
  });
  const response = await handle(request, { ...env, VERTEX_TAXI_CORE: taxi }, authFetch);
  assert.equal(response.status, 200);
});