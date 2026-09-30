'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const site = path.join(root, 'vertex/dist');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = fs.readdirSync(site, {recursive: true}).filter(p => fs.statSync(path.join(site, p)).isFile()).sort();
const worktree = Object.fromEntries(files.map(p => [p.replaceAll('\\', '/'), hash(fs.readFileSync(path.join(site, p)))]));
// Native Cloudflare builds check out Git blobs on Linux. Hash those exact bytes,
// retaining a separate Windows worktree snapshot to detect concurrent edits.
const snapshot = Object.fromEntries(Object.keys(worktree).map(p => [p, hash(execFileSync('git', ['show', ':vertex/dist/' + p], {cwd: root}))]));
const release = JSON.parse(fs.readFileSync(path.join(site, 'release.json'), 'utf8'));
const base = 'https://vertex-app.masurovadasha.workers.dev/';
async function main() {
  const report = {version: release.version, revision: release.revision, checkedAt: new Date().toISOString(), url: base, files: snapshot};
  fs.mkdirSync(path.join(root, 'artifacts/release'), {recursive: true});
  fs.writeFileSync(path.join(root, 'artifacts/release/source-manifest.json'), JSON.stringify(report, null, 2) + '\n');
  if (process.argv.includes('--snapshot')) return console.log(`Snapshot: ${files.length} files, ${release.version}/${release.revision}`);
  const failures = [];
  let checked = 0;
  for (const name of Object.keys(snapshot).filter(p => !['_headers', '_redirects'].includes(p))) {
    const response = await fetch(new URL(name, base), {headers: {'Cache-Control': 'no-cache'}, signal: AbortSignal.timeout(30000)});
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || hash(bytes) !== snapshot[name]) failures.push({name, status: response.status, hash: hash(bytes)});
    checked++;
  }
  for (const name of Object.keys(worktree)) if (hash(fs.readFileSync(path.join(site, name))) !== worktree[name]) failures.push({name, error:'Source changed during verification'});
  const result = {...report, checked, failures, passed: failures.length === 0};
  fs.writeFileSync(path.join(root, 'artifacts/release/live-verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({version: release.version, revision: release.revision, checked, failures, passed: result.passed}));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
