import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('public VISION build embeds one exact git source identity',async()=>{
  const release=JSON.parse(await readFile(new URL('../../vertex/dist/release.json',import.meta.url),'utf8'));
  const buildInfo=await readFile(new URL('../platform/build-info.generated.mjs',import.meta.url),'utf8');
  assert.match(release.source_commit||'',/^[a-f0-9]{40}$/);
  assert.ok(buildInfo.includes(JSON.stringify(release.source_commit)));
});
