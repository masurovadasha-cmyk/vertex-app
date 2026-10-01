import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../backend/worker.mjs';

const env = {
  VISION_ENV: 'staging',
  SUPABASE_STAGING_REF: 'abcdefghijklmnopqrst',
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

const testKeys = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign','verify'],
);
const testPrivateJwk = await crypto.subtle.exportKey('jwk', testKeys.privateKey);
const testPublicJwk = await crypto.subtle.exportKey('jwk', testKeys.publicKey);
const signedEnv = {
  ...env,
  TAXI_INTEGRATION_KEY_ID: 'taxi-test-key',
  TAXI_INTEGRATION_PRIVATE_JWK: JSON.stringify(testPrivateJwk),
};

function exactBuffer(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function fromB64url(value) {
  const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,(c)=>c.charCodeAt(0));
}

async function digest(value) {
  const bytes=typeof value==='string' ? new TextEncoder().encode(value) : value;
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',exactBuffer(bytes)));
  let binary='';
  for(const byte of hash) binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

async function assertValidTaxiSignature(request) {
  assert.equal(request.headers.get('x-vertex-key-id'),'taxi-test-key');
  const timestamp=request.headers.get('x-vertex-timestamp');
  assert.match(timestamp,/^\d{10}$/);
  const signature=request.headers.get('x-vertex-signature');
  assert.ok(signature);
  const url=new URL(request.url);
  const authorization=request.headers.get('authorization')||'';
  const bytes=new Uint8Array(await request.clone().arrayBuffer());
  const canonical=[
    request.method,
    url.pathname+url.search,
    timestamp,
    request.headers.get('x-vertex-tenant-id')||'',
    request.headers.get('x-vertex-organization-id')||'',
    request.headers.get('x-vertex-user-id')||'',
    request.headers.get('x-vertex-correlation-id')||'',
    request.headers.get('x-vertex-caller')||'',
    await digest(authorization),
    await digest(bytes),
  ].join('\n');
  const key=await crypto.subtle.importKey(
    'jwk',testPublicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']
  );
  assert.equal(await crypto.subtle.verify(
    {name:'ECDSA',hash:'SHA-256'},
    key,
    exactBuffer(fromB64url(signature)),
    exactBuffer(new TextEncoder().encode(canonical)),
  ),true);
}

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
      await assertValidTaxiSignature(request);
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
  const response = await handle(request, { ...signedEnv, VERTEX_TAXI_CORE: taxi }, authFetch);
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
      await assertValidTaxiSignature(request);
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
  const response = await handle(request, { ...signedEnv, VERTEX_TAXI_CORE: taxi }, authFetch);
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
      await assertValidTaxiSignature(request);
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
  const response = await handle(request, { ...signedEnv, VERTEX_TAXI_CORE: taxi }, authFetch);
  assert.equal(response.status, 200);
});
test('Taxi gateway fails closed when transport exists but signing key is absent', async () => {
  const request = new Request('https://vision-staging.example/api/taxi/capabilities', {
    headers: {
      authorization: 'Bearer demo',
      'x-vertex-tenant-id': '00000000-0000-0000-0000-000000000001',
      'x-vertex-organization-id': '00000000-0000-0000-0000-000000000001',
    },
  });
  const taxi={fetch:async()=>{throw new Error('must not call unsigned transport');}};
  const response=await handle(request,{...env,VERTEX_TAXI_CORE:taxi},authFetch);
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'taxi_integration_not_configured'});
});

test('Taxi HTTP fallback is P-256 signed and does not use a shared secret', async () => {
  const priorFetch=globalThis.fetch;
  let called=0;
  globalThis.fetch=async (url,options)=>{
    called+=1;
    assert.equal(url,'https://taxi-staging.example/_api/integration/v1/capabilities');
    const outbound=new Request(url,options);
    assert.equal(outbound.headers.has('x-vertex-integration-secret'),false);
    await assertValidTaxiSignature(outbound);
    return Response.json({data:{module:'taxi',sourceOfTruth:'vertex-taxi-core'}});
  };
  try {
    const request=new Request('https://vision-staging.example/api/taxi/capabilities',{
      headers:{
        authorization:'Bearer demo',
        'x-vertex-tenant-id':'00000000-0000-0000-0000-000000000001',
        'x-vertex-organization-id':'00000000-0000-0000-0000-000000000001',
      },
    });
    const response=await handle(request,{
      ...signedEnv,
      TAXI_INTEGRATION_URL:'https://taxi-staging.example/',
      TAXI_INTEGRATION_PATH_PREFIX:'/_api',
    },authFetch);
    assert.equal(response.status,200);
    assert.equal((await response.json()).data.module,'taxi');
    assert.equal(called,1);
  } finally {
    globalThis.fetch=priorFetch;
  }
});

test('Taxi HTTP fallback rejects non-HTTPS or path-bearing origins before network access', async () => {
  const priorFetch=globalThis.fetch;
  let called=0;
  globalThis.fetch=async ()=>{called+=1;throw new Error('must not fetch invalid Taxi origin');};
  try {
    for (const value of ['http://taxi-staging.example','https://taxi-staging.example/base','https://user:pass@taxi-staging.example']) {
      const request=new Request('https://vision-staging.example/api/taxi/capabilities',{
        headers:{
          authorization:'Bearer demo',
          'x-vertex-tenant-id':'00000000-0000-0000-0000-000000000001',
          'x-vertex-organization-id':'00000000-0000-0000-0000-000000000001',
        },
      });
      const response=await handle(request,{
        ...signedEnv,
        TAXI_INTEGRATION_URL:value,
      },authFetch);
      assert.equal(response.status,503);
      assert.deepEqual(await response.json(),{error:'taxi_integration_not_configured'});
    }
    assert.equal(called,0);
  } finally {
    globalThis.fetch=priorFetch;
  }
});


test('Taxi Floot HTTP adapter rewrites ride GET and signs the actual static route', async () => {
  const priorFetch=globalThis.fetch;
  let called=0;
  globalThis.fetch=async (url,options)=>{
    called+=1;
    assert.equal(url,'https://taxi-staging.example/_api/integration/v1/ride?rideId=00000000-0000-0000-0000-000000000099');
    const outbound=new Request(url,options);
    await assertValidTaxiSignature(outbound);
    return Response.json({data:{rideId:'00000000-0000-0000-0000-000000000099',status:'REQUESTED'}});
  };
  try {
    const request=new Request('https://vision-staging.example/api/taxi/rides/00000000-0000-0000-0000-000000000099',{
      headers:{
        authorization:'Bearer demo',
        'x-vertex-tenant-id':'00000000-0000-0000-0000-000000000001',
        'x-vertex-organization-id':'00000000-0000-0000-0000-000000000001',
      },
    });
    const response=await handle(request,{
      ...signedEnv,
      TAXI_INTEGRATION_URL:'https://taxi-staging.example',
      TAXI_INTEGRATION_PATH_PREFIX:'/_api',
    },authFetch);
    assert.equal(response.status,200);
    assert.equal((await response.json()).data.status,'REQUESTED');
    assert.equal(called,1);
  } finally {
    globalThis.fetch=priorFetch;
  }
});

test('Taxi Floot HTTP adapter moves ride id into cancel command JSON and signs adapted body', async () => {
  const priorFetch=globalThis.fetch;
  let called=0;
  globalThis.fetch=async (url,options)=>{
    called+=1;
    assert.equal(url,'https://taxi-staging.example/_api/integration/v1/commands');
    const outbound=new Request(url,options);
    await assertValidTaxiSignature(outbound);
    const payload=await outbound.json();
    assert.deepEqual(payload,{
      type:'cancel',
      reason:'guest_request',
      rideId:'00000000-0000-0000-0000-000000000099',
    });
    return Response.json({data:{rideId:payload.rideId,status:'CANCELLED'}});
  };
  try {
    const request=new Request('https://vision-staging.example/api/taxi/rides/00000000-0000-0000-0000-000000000099/commands',{
      method:'POST',
      headers:{
        authorization:'Bearer demo',
        'content-type':'application/json',
        'idempotency-key':'cancel-1',
        'x-vertex-tenant-id':'00000000-0000-0000-0000-000000000001',
        'x-vertex-organization-id':'00000000-0000-0000-0000-000000000001',
      },
      body:JSON.stringify({type:'cancel',reason:'guest_request'}),
    });
    const response=await handle(request,{
      ...signedEnv,
      TAXI_INTEGRATION_URL:'https://taxi-staging.example',
      TAXI_INTEGRATION_PATH_PREFIX:'/_api',
    },authFetch);
    assert.equal(response.status,200);
    assert.equal((await response.json()).data.status,'CANCELLED');
    assert.equal(called,1);
  } finally {
    globalThis.fetch=priorFetch;
  }
});

test('Taxi HTTP adapter rejects unsupported prefixes before network access', async () => {
  const priorFetch=globalThis.fetch;
  let called=0;
  globalThis.fetch=async ()=>{called+=1;throw new Error('must not call invalid adapter');};
  try {
    const request=new Request('https://vision-staging.example/api/taxi/capabilities',{
      headers:{
        authorization:'Bearer demo',
        'x-vertex-tenant-id':'00000000-0000-0000-0000-000000000001',
        'x-vertex-organization-id':'00000000-0000-0000-0000-000000000001',
      },
    });
    const response=await handle(request,{
      ...signedEnv,
      TAXI_INTEGRATION_URL:'https://taxi-staging.example',
      TAXI_INTEGRATION_PATH_PREFIX:'/custom',
    },authFetch);
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'taxi_integration_not_configured'});
    assert.equal(called,0);
  } finally {
    globalThis.fetch=priorFetch;
  }
});
