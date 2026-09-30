/* VISION Views client: transport and state ownership, independent of the DOM.
 * The server is authoritative for identity, permissions and committed operations.
 * Only a pending command's IDs/dates/amount are kept in tab-scoped sessionStorage;
 * tokens, passwords, guest documents and loaded rows are never persisted here.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root?.document) root.VertexViewsClient = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const LIMITS = Object.freeze({pageSize: 50, maxResponseBytes: 1024 * 1024,
    requestTimeoutMs: 25_000, maxStoredBytes: 8192});
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const CURSOR = /^[A-Za-z0-9_-]{1,384}$/;
  const RESOURCES = Object.freeze(['bookings', 'units', 'cleaning']);
  const PERMISSIONS = Object.freeze({create_booking: 'views.booking.create',
    confirm_booking: 'views.booking.manage', check_in: 'views.booking.manage',
    check_out: 'views.booking.manage', cancel_booking: 'views.booking.manage',
    cleaning_start: 'views.cleaning.execute', cleaning_submit: 'views.cleaning.execute',
    cleaning_verify: 'views.cleaning.verify'});
  const RESULTS = Object.freeze({create_booking: ['PENDING'], confirm_booking: ['CONFIRMED'],
    check_in: ['CHECKED_IN'], check_out: ['CHECKED_OUT', 'REQUIRED'], cancel_booking: ['CANCELLED'],
    cleaning_start: ['CHECKED_OUT', 'IN_PROGRESS'], cleaning_submit: ['CHECKED_OUT', 'INSPECTION'],
    cleaning_verify: ['COMPLETED', 'VERIFIED']});
  const clone = value => JSON.parse(JSON.stringify(value));
  const failure = (code, status = 0) => Object.assign(new Error(code), {code, status});
  const transient = error => !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
  const emptyData = () => Object.fromEntries(RESOURCES.map(name => [name, []]));
  const emptyPages = () => Object.fromEntries(RESOURCES.map(name => [name, {nextCursor: null, loaded: false, applicable: false}]));
  const validId = value => typeof value === 'string' && UUID.test(value);

  function validateContext(body, identity) {
    if (!body || !validId(body.actorId) || body.tenantId !== identity.tenantId ||
        body.organizationId !== identity.organizationId || body.module !== 'views' || body.moduleEnabled !== true ||
        !Array.isArray(body.permissions) || body.permissions.some(p => typeof p !== 'string') ||
        !Array.isArray(body.roles) || !body.capabilities || typeof body.capabilities !== 'object') {
      throw failure('context_mismatch', 403);
    }
    return {actorId: body.actorId, tenantId: body.tenantId, organizationId: body.organizationId,
      permissions: [...body.permissions], roles: [...body.roles], guestLinked: body.guestLinked === true,
      capabilities: {...body.capabilities}};
  }

  function validateCommand(type, fields, context, key, requirePermission = true) {
    if (!Object.hasOwn(PERMISSIONS, type)) throw failure('invalid_command', 400);
    if (requirePermission && !context.permissions.includes(PERMISSIONS[type])) throw failure('forbidden', 403);
    const names = type === 'create_booking'
      ? ['organization_id', 'unit_id', 'customer_id', 'check_in', 'check_out', 'source', 'total', 'currency']
      : [type.startsWith('cleaning_') ? 'cleaning_job_id' : 'booking_id', 'expected_version'];
    if (!fields || Object.keys(fields).some(k => !names.includes(k)) ||
        Object.values(fields).some(v => !['string', 'number'].includes(typeof v))) throw failure('invalid_command', 400);
    if (type === 'create_booking' && fields.organization_id !== context.organizationId) throw failure('forbidden', 403);
    return {type, tenant_id: context.tenantId, idempotency_key: key, ...fields};
  }

  function validateResult(type, body) {
    const rule = RESULTS[type];
    if (!body || !validId(body.booking_id) || !validId(body.unit_id) || !validId(body.correlation_id) ||
        !Number.isSafeInteger(body.booking_version) || body.booking_version < 1 || body.booking_status !== rule[0]) {
      throw failure('invalid_response');
    }
    if (rule[1] && (!validId(body.cleaning_job_id) || body.cleaning_status !== rule[1] ||
        !Number.isSafeInteger(body.cleaning_version) || body.cleaning_version < 1)) throw failure('invalid_response');
    return body;
  }

  async function readJSON(response) {
    if (!(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json')) throw failure('invalid_response');
    if (Number(response.headers.get('content-length')) > LIMITS.maxResponseBytes) throw failure('invalid_response');
    const reader = response.body?.getReader();
    if (!reader) throw failure('invalid_response');
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > LIMITS.maxResponseBytes) { await reader.cancel().catch(() => {}); throw failure('invalid_response'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
    catch { throw failure('invalid_response'); }
  }

  function create({fetcher = globalThis.fetch.bind(globalThis), storage = null,
    onChange = () => {}, now = Date.now, makeId = () => crypto.randomUUID()} = {}) {
    let identity = null, context = null, epoch = 0, generation = 0, busy = false, operation = null;
    let pending = null, pendingKey = null, retryPersistence = true, lastCommand = null, error = null;
    let data = emptyData(), pages = emptyPages(), loading = false;
    const controllers = new Set(), loadingMore = new Set();
    const snapshot = () => clone({configured: !!context, context, data, pages, loading, busy, error,
      loadingMore: [...loadingMore], pending: pending ? {type: pending.command.type, key: pending.command.idempotency_key} : null,
      retryPersistence, lastCommand});
    const notify = () => onChange(snapshot());
    const current = ticket => ticket === epoch;
    const can = permission => !!context?.permissions.includes(permission);
    const cancel = () => { controllers.forEach(controller => controller.abort()); controllers.clear(); };
    const setError = e => { error = {code: e.code || e.message || 'network_error', status: e.status || 0}; };

    async function request(path, ticket, credentials, options = {}) {
      const controller = new AbortController(); controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), LIMITS.requestTimeoutMs);
      try {
        const response = await fetcher(path, {...options, signal: controller.signal, cache: 'no-store', redirect: 'error',
          headers: {authorization: 'Bearer ' + credentials.token, ...(options.body ? {'content-type': 'application/json'} : {})}});
        const body = await readJSON(response);
        if (!current(ticket)) throw failure('session_changed');
        if (!response.ok) throw failure(typeof body?.error === 'string' ? body.error : 'request_failed', response.status);
        return {body, response};
      } catch (e) {
        if (!current(ticket)) throw failure('session_changed');
        if (e.code) throw e;
        throw failure(controller.signal.aborted ? 'request_timeout' : 'network_error');
      } finally { clearTimeout(timer); controllers.delete(controller); }
    }

    function remember() {
      try {
        if (!storage || !pendingKey) { retryPersistence = false; return; }
        if (pending) storage.setItem(pendingKey, JSON.stringify(pending)); else storage.removeItem(pendingKey);
        retryPersistence = true;
      } catch { retryPersistence = false; }
    }

    function restore() {
      if (!storage || !pendingKey) return;
      try {
        const raw = storage.getItem(pendingKey); if (!raw) return;
        if (raw.length > LIMITS.maxStoredBytes) throw new Error('stored_command_too_large');
        const saved = JSON.parse(raw), command = saved.command;
        if (!Number.isFinite(saved.savedAt) || saved.savedAt > now() ||
            !command || command.tenant_id !== context.tenantId || !validId(command.idempotency_key)) throw new Error('invalid_stored_command');
        const {type, tenant_id, idempotency_key, ...fields} = command;
        validateCommand(type, fields, context, idempotency_key, false);
        pending = saved;
      } catch { try { storage.removeItem(pendingKey); } catch {} }
    }

    function reset(forgetPending) {
      if (forgetPending) { pending = null; remember(); }
      epoch++; generation++; cancel(); identity = null; context = null; pending = null; pendingKey = null;
      operation = null; busy = false; loading = false; error = null; lastCommand = null;
      data = emptyData(); pages = emptyPages(); loadingMore.clear();
    }

    async function configure(input) {
      if (!validId(input?.tenantId) || !validId(input?.organizationId) || typeof input?.token !== 'string' ||
          !/^[A-Za-z0-9_.-]{11,8192}$/.test(input.token)) throw failure('invalid_views_session', 400);
      reset(false); const ticket = epoch;
      identity = {tenantId: input.tenantId, organizationId: input.organizationId, token: input.token};
      const captured = {...identity}; notify();
      try {
        const params = new URLSearchParams({tenant_id: captured.tenantId, organization_id: captured.organizationId});
        const result = await request('/api/v1/context?' + params, ticket, captured);
        if (!current(ticket)) throw failure('session_changed');
        context = validateContext(result.body, captured);
        pendingKey = 'vertex-vision-pending-v1:' + context.tenantId + ':' + context.organizationId + ':' + context.actorId;
        restore(); notify(); return clone(context);
      } catch (e) { if (current(ticket)) { reset(false); setError(e); notify(); } throw e; }
    }

    function applicable(name) {
      if (name === 'bookings') return can('views.operations.read') || context?.guestLinked === true;
      if (name === 'units') return can('views.operations.read');
      return can('views.operations.read') || can('views.cleaning.execute') || can('views.cleaning.verify');
    }

    async function page(name, cursor, ticket, captured) {
      const params = new URLSearchParams({tenant_id: captured.tenantId, organization_id: captured.organizationId, limit: String(LIMITS.pageSize)});
      if (cursor) params.set('cursor', cursor);
      const {body, response} = await request('/api/v1/views/' + name + '?' + params, ticket, captured);
      const nextCursor = response.headers.get('x-next-cursor');
      if (!Array.isArray(body) || body.length > LIMITS.pageSize || body.some(row => !row || !validId(row.id)) ||
          (nextCursor && (!CURSOR.test(nextCursor) || nextCursor === cursor || !body.length))) throw failure('invalid_response');
      return {rows: body, nextCursor};
    }

    async function refresh() {
      if (!context) return;
      const ticket = epoch, revision = ++generation, captured = {...identity};
      loading = true; error = null; notify();
      try {
        const results = await Promise.all(RESOURCES.map(async name => [name, applicable(name)
          ? await page(name, null, ticket, captured) : null]));
        if (!current(ticket) || revision !== generation) return;
        for (const [name, result] of results) {
          data[name] = result?.rows || [];
          pages[name] = {nextCursor: result?.nextCursor || null, loaded: true, applicable: !!result};
        }
      } catch (e) {
        if (!current(ticket) || revision !== generation) return;
        if (e.status === 401 || e.status === 403) reset(false);
        setError(e);
      } finally { if (current(ticket) && revision === generation) { loading = false; notify(); } else if (!context) notify(); }
    }

    async function loadMore(name) {
      if (!context || !RESOURCES.includes(name) || loading || busy || loadingMore.has(name) || !pages[name].nextCursor) return;
      const ticket = epoch, revision = generation, cursor = pages[name].nextCursor;
      loadingMore.add(name); error = null; notify();
      try {
        const result = await page(name, cursor, ticket, {...identity});
        if (!current(ticket) || revision !== generation) return;
        const ids = new Set(data[name].map(row => row.id));
        data[name].push(...result.rows.filter(row => { if (ids.has(row.id)) return false; ids.add(row.id); return true; }));
        pages[name].nextCursor = result.nextCursor;
      } catch (e) { if (current(ticket) && revision === generation) { if(e.status===401||e.status===403)reset(false); setError(e); } }
      finally { if (current(ticket)) { loadingMore.delete(name); notify(); } }
    }

    function execute(type, fields = {}) {
      if (operation) return operation;
      if (!context) return Promise.reject(failure('session_required', 401));
      if (pending) return Promise.reject(failure('pending_command_exists', 409));
      let command;try{command=validateCommand(type, fields, context, makeId());}catch(e){return Promise.reject(e);}
      pending = {command, savedAt: now()}; remember(); return sendPending();
    }

    function sendPending() {
      if (operation) return operation;
      if (!context || !pending) return Promise.reject(failure('no_pending_command', 400));
      if (!can(PERMISSIONS[pending.command.type])) return Promise.reject(failure('forbidden', 403));
      const ticket = epoch, captured = {...identity}, saved = clone(pending.command);
      busy = true; error = null; lastCommand = null; notify();
      const task = (async () => {
        try {
          const {body} = await request('/api/v1/views/commands', ticket, captured, {method: 'POST', body: JSON.stringify(saved)});
          validateResult(saved.type, body);
          if (!current(ticket)) return null;
          pending = null; remember(); lastCommand = {type: saved.type, correlationId: body.correlation_id, acknowledged: true};
          busy = false; await refresh(); return clone(body);
        } catch (e) {
          if (!current(ticket)) return null;
          // A revoked/expired session cannot prove whether an earlier ambiguous request committed.
          if (!transient(e) && e.status !== 401 && e.status !== 403) { pending = null; remember(); }
          if (e.status === 401 || e.status === 403) reset(false);
          setError(e); return null;
        } finally { if (current(ticket)) { busy = false; operation = null; notify(); } else if (!context) notify(); }
      })();
      operation = task; return task;
    }

    function clearSession() { reset(true); notify(); }
    return Object.freeze({configure, refresh, loadMore, execute, retry: sendPending, clearSession, snapshot, can});
  }
  return Object.freeze({create, LIMITS});
});
