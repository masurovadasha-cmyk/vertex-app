import {readPage} from '../modules/views/read-contract.mjs';
import {routePlan, projectSessionContext} from './kernel.mjs';
import {validateViewsCommand} from '../modules/views/command-contract.mjs';
import {projectViewsCommandResponse} from '../modules/views/response-contract.mjs';
import {projectRuntimeReadiness} from './readiness.mjs';
import {LIMITS, boundedJSON, upstreamJSON, gatewayError, jsonReply, mapFailure, mapUpstreamError} from './http.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const RELEASE = Object.freeze({architectureVersion: '1.6', requiredMigration: '0011_event_inbox.sql'});

function configured(env) {
  return /^[a-z0-9]{20}$/.test(env.SUPABASE_STAGING_REF || '')
    && env.SUPABASE_URL === `https://${env.SUPABASE_STAGING_REF}.supabase.co`
    && /^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_PUBLISHABLE_KEY || '');
}

function health(request, env, reply) {
  if (!SAFE_METHODS.has(request.method)) return reply({error: 'method_not_allowed'}, 405);
  const response = reply({service: 'VERTEX VISION', environment: 'staging', configured: configured(env),
    probe: 'liveness-config-only', ...RELEASE,
    sourceCommit: /^[a-f0-9]{40}$/.test(env.VISION_SOURCE_COMMIT || '') ? env.VISION_SOURCE_COMMIT : null});
  return request.method === 'HEAD' ? new Response(null, response) : response;
}

async function readiness(request, env, fetcher, reply) {
  if (!SAFE_METHODS.has(request.method)) return reply({error: 'method_not_allowed'}, 405);
  let response;
  if (!configured(env)) response = reply({ready: false, error: 'backend_not_configured'}, 503);
  else {
    try {
      const result = await fetcher(env.SUPABASE_URL + '/rest/v1/rpc/vision_runtime_readiness', {
        method: 'POST', headers: {apikey: env.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json'},
        body: '{}', redirect: 'error', signal: AbortSignal.timeout(LIMITS.upstreamTimeoutMs)
      });
      const body = await upstreamJSON(result, LIMITS.identityBytes);
      if (!result.ok) throw new Error('readiness_unavailable');
      const projected = projectRuntimeReadiness(body);
      response = reply(projected, projected.ready ? 200 : 503);
    } catch { response = reply({ready: false, error: 'readiness_unavailable'}, 503); }
  }
  return request.method === 'HEAD' ? new Response(null, response) : response;
}

function staticResponse(request, url, env, reply) {
  const path = url.pathname;
  if (path.startsWith('/rest/') || path.startsWith('/auth/') || path === '/vision' ||
      path.startsWith('/vision/') || path.startsWith('/.')) return reply({error: 'not_found'}, 404);
  if (!SAFE_METHODS.has(request.method)) return reply({error: 'method_not_allowed'}, 405);
  if (typeof env.ASSETS?.fetch !== 'function') return reply({error: 'assets_not_configured'}, 503);
  return env.ASSETS.fetch(request);
}

function upstreamClient(request, url, env, fetcher) {
  if (request.headers.has('origin') && request.headers.get('origin') !== url.origin) throw gatewayError('origin_denied', 403);
  if (!['GET', 'POST'].includes(request.method)) throw gatewayError('method_not_allowed', 405);
  const authorization = request.headers.get('authorization');
  if (!authorization || authorization.length > LIMITS.authorizationBytes || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) {
    throw gatewayError('unauthorized', 401);
  }
  // Forward this request's user token. Never substitute the migration/dispatcher principal.
  const headers = {apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization, 'content-type': 'application/json'};
  return (path, options = {}) => fetcher(env.SUPABASE_URL + path, {...options, headers, redirect: 'error',
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(LIMITS.upstreamTimeoutMs)])});
}

async function verifiedActor(upstream) {
  const identity = await upstream('/auth/v1/user');
  if (!identity.ok) {
    await identity.body?.cancel().catch(() => {});
    const unavailable = identity.status === 429 || identity.status >= 500;
    throw gatewayError(unavailable ? 'auth_unavailable' : 'unauthorized', unavailable ? 503 : 401);
  }
  const user = await upstreamJSON(identity, LIMITS.identityBytes);
  if (!user || typeof user !== 'object' || Array.isArray(user)) throw new Error('upstream_invalid_response');
  if (typeof user.id !== 'string' || !UUID.test(user.id)) throw gatewayError('unauthorized', 401);
  return user.id;
}

async function executePlan(request, plan, upstream) {
  if (plan.kind === 'command') {
    const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (type !== 'application/json') throw gatewayError('json_required', 415);
    const raw = await boundedJSON(request, plan.bodyLimit);
    const command = plan.module === 'views' ? validateViewsCommand(raw) : raw;
    return {response: await upstream('/rest/v1/rpc/' + plan.rpc, {method: 'POST', body: JSON.stringify({command})}),
      commandType: plan.module === 'views' ? command.type : null};
  }
  if (plan.kind === 'context') return {response: await upstream('/rest/v1/rpc/' + plan.rpc, {
    method: 'POST', body: JSON.stringify({p_tenant: plan.tenant, p_organization: plan.organization})})};
  const params = plan.kind === 'views-read' ? plan.read.params : new URLSearchParams({
    tenant_id: 'eq.' + plan.tenant, select: '*', limit: String(LIMITS.legacyPageSize), order: 'created_at.desc,id.desc'});
  return {response: await upstream('/rest/v1/' + plan.table + '?' + params)};
}

function projectResult(body, plan, commandType, actorId, reply) {
  if (commandType) {
    const dto = projectViewsCommandResponse(commandType, body);
    return reply(dto, 200, {'x-correlation-id': dto.correlation_id});
  }
  if (plan.kind === 'views-read') {
    const page = readPage(body, plan.read);
    return reply(page.items, 200, {'x-page-limit': String(plan.read.limit), ...(page.nextCursor ? {'x-next-cursor': page.nextCursor} : {})});
  }
  if (plan.kind === 'context') {
    const context = projectSessionContext(body);
    if (context.actorId !== actorId || context.tenantId !== plan.tenant || context.organizationId !== plan.organization) {
      throw new Error('upstream_invalid_response');
    }
    return reply(context);
  }
  return reply(body);
}

export async function handle(request, env = {}, fetcher = fetch) {
  const url = new URL(request.url), requestId = crypto.randomUUID();
  const reply = (body, status = 200, extra = {}) => jsonReply(requestId, body, status, extra);
  if (env.VISION_ENV !== 'staging') return reply({error: 'staging_only'}, 503);
  if (url.pathname === '/health') return health(request, env, reply);
  if (url.pathname === '/readyz') return readiness(request, env, fetcher, reply);
  if (!url.pathname.startsWith('/api/')) return staticResponse(request, url, env, reply);
  if (!configured(env)) return reply({error: 'backend_not_configured'}, 503);
  try {
    const upstream = upstreamClient(request, url, env, fetcher);
    const actorId = await verifiedActor(upstream);
    const plan = routePlan(url, request.method);
    if (!plan) return reply({error: 'not_found'}, 404);
    const {response, commandType} = await executePlan(request, plan, upstream);
    const body = await upstreamJSON(response, LIMITS.responseBytes);
    if (!response.ok) throw mapUpstreamError(body, response.status);
    return projectResult(body, plan, commandType, actorId, reply);
  } catch (error) {
    const mapped = mapFailure(error);
    return reply({error: mapped.code}, mapped.status);
  }
}
export default {fetch(request, env) { return handle(request, env); }};
