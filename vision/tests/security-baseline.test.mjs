import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('VISION static security policy denies ambient browser capabilities',async()=>{
  const headers=await readFile(new URL('../../vertex/dist/_headers',import.meta.url),'utf8');
  for(const required of [
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "X-Frame-Options: DENY",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ])assert.ok(headers.includes(required),required);
  assert.ok(!/script-src[^\n]*'unsafe-inline'/.test(headers),'inline script execution must stay blocked');
  assert.ok(!/script-src[^\n]*'unsafe-eval'/.test(headers),'eval must stay blocked');
});

test('Cloudflare runtimes are pinned to the current reviewed compatibility date',async()=>{
  for(const path of ['../../wrangler.jsonc','../wrangler.jsonc']){
    const config=await readFile(new URL(path,import.meta.url),'utf8');
    assert.match(config,/"compatibility_date"\s*:\s*"2026-10-01"/);
  }
});
