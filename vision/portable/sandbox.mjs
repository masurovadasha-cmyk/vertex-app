import {PGlite} from '@electric-sql/pglite';
import {demo, profiles, organizations, provisionDemo} from '../backend/demo.mjs';

// This is an OFFLINE development sandbox, not authentication or a cloud client.
// The device owner controls this synthetic database. Never enter real guest data.
// VISION_MIGRATIONS is embedded from the reviewed SQL files by build.mjs.
const migrations = VISION_MIGRATIONS;
const nativeFetch = globalThis.fetch.bind(globalThis);
const message = document.querySelector('#message');
const controls = () => document.querySelectorAll('button, select');
const reply = (body, status = 200) => Response.json(body, {status});
let queue = Promise.resolve();
const serial = work => {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
};

async function migrateBrowser(db) {
  await db.exec(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$;
    create schema if not exists vision_private;
    revoke all on schema vision_private from public;
    create table if not exists vision_private.schema_migrations(name text primary key,sha256 text not null);`);
  for (const {name, sql, sha256} of migrations) {
    const prior = (await db.query('select sha256 from vision_private.schema_migrations where name=$1', [name])).rows[0];
    if (prior) {
      if (prior.sha256 !== sha256) throw new Error('Applied migration changed: ' + name);
      continue;
    }
    const end = sql.lastIndexOf('commit;');
    if (end < 0) throw new Error('Migration has no explicit commit: ' + name);
    try {
      await db.exec(sql.slice(0, end));
      await db.query('insert into vision_private.schema_migrations values($1,$2)', [name, sha256]);
      await db.exec(sql.slice(end));
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  }
}

function localAPI(db, request, path) {
  if (path === '/api/profiles' && request.method === 'GET') {
    return Promise.resolve(reply({demo, organizations, profiles: profiles.map(({key, name}) => ({key, name}))}));
  }
  const profile = profiles.find(p => p.key === request.headers.get('x-vision-profile'));
  if (!profile) return Promise.resolve(reply({error: 'choose_demo_profile'}, 401));
  // Capture each request's identity BEFORE queuing. Never read the current UI role later.
  return serial(async () => {
    let command;
    if (path === '/api/commands' && request.method === 'POST') {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return reply({error: 'json_required'}, 415);
      }
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > 8192) return reply({error: 'body_too_large'}, 413);
      try { command = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
      catch { return reply({error: 'invalid_json'}, 400); }
      if (!command || Array.isArray(command) || typeof command !== 'object') return reply({error: 'invalid_command'}, 400);
    } else if (!(request.method === 'GET' && ['/api/orders', '/api/audit'].includes(path))) {
      return reply({error: 'not_found'}, 404);
    }
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub: profile.id})]);
      const result = command
        ? await db.query('select public.vision_command($1::jsonb) result', [JSON.stringify(command)])
        : await db.query(`select * from public.${path === '/api/audit' ? 'vision_audit_events' : 'vision_orders'} order by created_at desc,id desc limit 50`);
      await db.query('commit');
      return reply(command ? result.rows[0].result : result.rows);
    } catch (error) {
      await db.query('rollback');
      const status = error.code === '42501' ? 403 : ['23505', '40001'].includes(error.code) ? 409 : 400;
      return reply({error: error.message}, status);
    }
  });
}

async function boot() {
  if (!globalThis.isSecureContext || !navigator.locks || !globalThis.indexedDB) {
    throw new Error('Нужен современный браузер / Android System WebView с IndexedDB и Web Locks.');
  }
  const allowed = location.origin === 'https://appassets.androidplatform.net' ||
    (location.protocol === 'http:' && location.hostname === '127.0.0.1');
  if (!allowed) throw new Error('Тестовая сборка работает только локально; публичный хостинг запрещён.');
  await navigator.locks.request('vertex-vision-dev-020-database', {ifAvailable: true}, async lock => {
    if (!lock) throw new Error('VISION уже открыт в другой вкладке. Закройте её и обновите эту страницу.');
    const db = new PGlite('idb://vertex-vision-dev-020');
    await db.waitReady;
    await migrateBrowser(db);
    await provisionDemo(db);
    globalThis.fetch = async (input, init) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(new URL(input, location.href), init);
      const url = new URL(request.url);
      if (url.origin !== location.origin) return reply({error: 'offline_only'}, 403);
      if (url.pathname.startsWith('/api/')) return localAPI(db, request, url.pathname);
      return nativeFetch(request);
    };
    message.textContent = '';
    controls().forEach(c => { c.disabled = false; });
    await import('./dev-ui.js');
    document.documentElement.dataset.visionReady = 'true';
    // One writer per browser profile. The lock is released when the page closes.
    await new Promise(() => {});
  });
}
controls().forEach(c => { c.disabled = true; });
message.textContent = 'Подготовка локальной базы VISION…';
boot().catch(error => {
  document.documentElement.dataset.visionReady = 'error';
  controls().forEach(c => { c.disabled = true; });
  message.textContent = 'Запуск не выполнен: ' + error.message;
  console.error('VISION sandbox initialization failed:', error);
});
