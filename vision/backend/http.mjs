/** HTTP primitives shared by the staging gateway. Limits refer to bytes, not JS characters. */
export const LIMITS = Object.freeze({
  authorizationBytes: 8 * 1024,
  commandBytes: 8 * 1024,
  identityBytes: 64 * 1024,
  responseBytes: 1024 * 1024,
  legacyPageSize: 50,
  upstreamTimeoutMs: 10_000
});

export function gatewayError(code, status) {
  return Object.assign(new Error(code), {publicCode: code, status});
}

export function jsonReply(requestId, body, status = 200, extra = {}) {
  return Response.json(body, {status, headers: {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'x-request-id': requestId, ...extra
  }});
}

export async function boundedJSON(source, limit) {
  if (Number(source.headers.get('content-length')) > limit) {
    await source.body?.cancel().catch(() => {});
    throw new Error('body_too_large');
  }
  const reader = source.body?.getReader();
  if (!reader) throw new Error('invalid_json');
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel().catch(() => {});
        throw new Error('body_too_large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw new Error('invalid_json'); }
}

export async function upstreamJSON(response, limit) {
  try {
    const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (type !== 'application/json') {
      await response.body?.cancel().catch(() => {});
      throw new Error('unexpected_media_type');
    }
    return await boundedJSON(response, limit);
  } catch { throw new Error('upstream_invalid_response'); }
}

const CONFLICTS = new Set(['23505', '40001', '23P01']);
const INVALID_INPUT = new Set(['22023', '22P02', '22003', '22007', '22008', '23503', '23502', '23514']);
export function mapUpstreamError(body, status) {
  if (status === 401) return gatewayError('unauthorized', 401);
  if (status === 429 || status >= 500) return gatewayError('backend_unavailable', 503);
  if (CONFLICTS.has(body?.code)) return gatewayError('conflict', 409);
  if (body?.code === '42501' || status === 403) return gatewayError('forbidden', 403);
  if (INVALID_INPUT.has(body?.code)) return gatewayError('invalid_command', 400);
  return gatewayError('backend_unavailable', 503);
}

const CALLER_ERRORS = new Set(['invalid_page_query', 'tenant_id_required', 'organization_id_required',
  'invalid_context_query', 'invalid_command', 'invalid_json']);
export function mapFailure(error) {
  if (error?.publicCode) return {code: error.publicCode, status: error.status};
  if (CALLER_ERRORS.has(error?.message)) return {code: error.message, status: 400};
  if (error?.message === 'body_too_large') return {code: 'body_too_large', status: 413};
  return {code: 'backend_unavailable', status: 503};
}
