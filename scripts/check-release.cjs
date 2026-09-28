#!/usr/bin/env node
'use strict';

// Static release gate: compile and inspect files without running application code.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const PROJECT = path.resolve(__dirname, '..');
const SITE_ROOTS = ['vertex/dist', 'android/app/src/main/assets/site'];

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not release assets: ${path.relative(PROJECT, file)}`);
    return entry.isDirectory() ? filesUnder(file) : entry.isFile() ? [file] : [];
  });
}

function loadEsbuild() {
  try { return require(require.resolve('esbuild', { paths: [PROJECT] })); } catch {}
  const store = path.join(PROJECT, 'node_modules', '.pnpm');
  if (fs.existsSync(store)) {
    for (const name of fs.readdirSync(store).filter(name => name.startsWith('esbuild@')).sort().reverse()) {
      const entry = path.join(store, name, 'node_modules', 'esbuild', 'lib', 'main.js');
      if (fs.existsSync(entry)) return require(entry);
    }
  }
  throw new Error('Local esbuild was not found. Restore the project dependencies before checking a release.');
}

function attributes(tag) {
  const result = {};
  const body = tag.replace(/^<\/?[\w:-]+/, '').replace(/\/?\s*>$/, '');
  for (const match of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

function localResource(value, from, root) {
  const url = String(value).trim().replace(/&amp;/gi, '&');
  if (!url || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(url)) return null;
  const plain = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  if (!plain) return null;
  let target = path.resolve(plain.startsWith('/') ? root : path.dirname(from), plain.replace(/^\/+/, ''));
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Resource leaves the site directory: ${url}`);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`Missing local resource: ${url}`);
  const realRelative = path.relative(fs.realpathSync(root), fs.realpathSync(target));
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error(`Resource resolves outside the site directory: ${url}`);
  return target;
}

// Accept only a static string array; never eval a service worker or its source.
function assetList(source) {
  const declaration = /\b(?:const|let|var)\s+ASSETS\s*=\s*\[/.exec(source);
  if (!declaration) throw new Error('Service worker must declare a static ASSETS string array.');
  let cursor = declaration.index + declaration[0].length;
  const values = [];
  function skip() {
    while (cursor < source.length) {
      if (/\s/.test(source[cursor])) { cursor++; continue; }
      if (source.startsWith('//', cursor)) { const end = source.indexOf('\n', cursor); cursor = end < 0 ? source.length : end + 1; continue; }
      if (source.startsWith('/*', cursor)) { const end = source.indexOf('*/', cursor + 2); if (end < 0) throw new Error('Unclosed ASSETS comment.'); cursor = end + 2; continue; }
      break;
    }
  }
  while (cursor < source.length) {
    skip();
    if (source[cursor] === ']') return values;
    const quote = source[cursor++];
    if (quote !== '"' && quote !== "'") throw new Error('ASSETS entries must be quoted strings, without expressions or spreads.');
    let value = '', closed = false;
    while (cursor < source.length) {
      let char = source[cursor++];
      if (char === quote) { closed = true; break; }
      if (char === '\n' || char === '\r') throw new Error('Unescaped newline in ASSETS string.');
      if (char !== '\\') { value += char; continue; }
      char = source[cursor++];
      const escapes = { n:'\n', r:'\r', t:'\t', b:'\b', f:'\f', v:'\v', '0':'\0' };
      if (char === 'x' || char === 'u') {
        const length = char === 'x' ? 2 : 4;
        const code = source.slice(cursor, cursor + length);
        if (!new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(code)) throw new Error('Unsupported character escape in ASSETS.');
        value += String.fromCharCode(parseInt(code, 16)); cursor += length;
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && source[cursor] === '\n') cursor++;
      } else value += escapes[char] ?? char;
    }
    if (!closed) throw new Error('Unclosed ASSETS string.');
    values.push(value); skip();
    if (source[cursor] === ']') return values;
    if (source[cursor++] !== ',') throw new Error('Expected a comma between ASSETS entries.');
  }
  throw new Error('Unclosed ASSETS array.');
}

function main() {
  const errors = [];
  const totals = { js:0, css:0, html:0, resources:0, workers:0, manifests:0 };
  let esbuild;
  try { esbuild = loadEsbuild(); } catch (error) { errors.push(error.message); }
  function check(file, action) {
    try { action(); } catch (error) { errors.push(`${path.relative(PROJECT, file).replaceAll('\\','/')}: ${error.message}`); }
  }
  for (const name of SITE_ROOTS) {
    const root = path.join(PROJECT, name);
    let files;
    try { files = filesUnder(root); } catch (error) { errors.push(`${name}: ${error.message}`); continue; }
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (['.js','.mjs','.cjs'].includes(extension)) check(file, () => {
        totals.js++;
        const parsed = spawnSync(process.execPath, ['--check', file], { encoding:'utf8', windowsHide:true });
        if (parsed.error) throw parsed.error;
        if (parsed.status !== 0) throw new Error((parsed.stderr.match(/SyntaxError:[^\r\n]+/) || ['JavaScript syntax check failed.'])[0]);
      });
      if (extension === '.css' && esbuild) check(file, () => {
        totals.css++;
        let result;
        try { result = esbuild.transformSync(fs.readFileSync(file,'utf8'), { loader:'css', sourcefile:path.relative(PROJECT,file), logLevel:'silent' }); }
        catch (error) { throw new Error((error.errors || []).map(item => `${item.location?.line ?? '?'}: ${item.text}`).join('; ') || 'CSS parse failed.'); }
        if (result.warnings.length) throw new Error(result.warnings.map(item => `${item.location?.line ?? '?'}: ${item.text}`).join('; '));
      });
      if (extension === '.html') check(file, () => {
        totals.html++;
        const markup = fs.readFileSync(file,'utf8').replace(/<!--[\s\S]*?-->/g,'').replace(/(<(script|style)\b[^>]*>)[\s\S]*?<\/\2\s*>/gi,'$1');
        for (const match of markup.matchAll(/<[a-z][\w:-]*\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
          const attrs = attributes(match[0]);
          for (const attribute of ['src','href']) if (attrs[attribute] && localResource(attrs[attribute],file,root)) totals.resources++;
        }
      });
      if (/^(?:sw|service-worker)\.(?:js|mjs)$/i.test(path.basename(file))) check(file, () => {
        totals.workers++;
        const assets = assetList(fs.readFileSync(file,'utf8'));
        if (!assets.length) throw new Error('ASSETS is empty.');
        for (const asset of assets) if (localResource(asset,file,root)) totals.resources++;
      });
      if (extension === '.webmanifest' || path.basename(file).toLowerCase() === 'manifest.json') check(file, () => {
        totals.manifests++;
        const manifest = JSON.parse(fs.readFileSync(file,'utf8'));
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Manifest must be a JSON object.');
        if (!Array.isArray(manifest.icons) || !manifest.icons.length) throw new Error('Manifest needs an icons array.');
        for (const icon of manifest.icons) {
          if (!icon || typeof icon.src !== 'string' || !icon.src.trim()) throw new Error('Every manifest icon needs a src.');
          if (localResource(icon.src,file,root)) totals.resources++;
        }
      });
    }
  }
  if (errors.length) {
    console.error(`FAIL release check (${errors.length} issue${errors.length === 1 ? '' : 's'})`);
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
  } else console.log(`PASS release: ${totals.js} JS, ${totals.css} CSS, ${totals.html} HTML, ${totals.workers} workers, ${totals.manifests} manifests, ${totals.resources} local references.`);
}

module.exports = { PROJECT, filesUnder, loadEsbuild, attributes, localResource, assetList };
if (require.main === module) main();
