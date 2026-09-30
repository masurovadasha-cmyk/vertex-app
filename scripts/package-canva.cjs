#!/usr/bin/env node
'use strict';

// Build from committed-style static assets only. No browser data, environment
// variables, credentials, or application source execution are involved.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { PROJECT, attributes, localResource, loadEsbuild } = require('./check-release.cjs');
const ROOT = path.join(PROJECT, 'vertex', 'dist');
const INPUT = path.join(ROOT, 'index.html');
const OUTPUT = path.join(PROJECT, 'artifacts', 'Vertex-Canva-Latest.html');
const mime = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml', '.avif':'image/avif', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf' };

function main() {
  const esbuild = loadEsbuild();
  const encoded = new Map();
  const scripts = [];
  let cssCount = 0, omittedFonts = 0;
  function source(file) {
    const text = fs.readFileSync(file, 'utf8');
    if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/.test(text)) throw new Error(`Possible private credential in ${path.relative(ROOT,file)}; export stopped.`);
    return text;
  }
  function dataUrl(value, from) {
    const file = localResource(value, from, ROOT);
    if (!file) return value;
    if (/\.(woff2?|ttf|otf|eot|ttc)$/i.test(file)) throw new Error('Font binaries are excluded from preview exports.');
    const type = mime[path.extname(file).toLowerCase()];
    if (!type) throw new Error(`Unsupported inline asset: ${path.relative(ROOT,file)}`);
    if (!encoded.has(file)) encoded.set(file, `data:${type};base64,${fs.readFileSync(file).toString('base64')}`);
    const fragment = value.includes('#') ? value.slice(value.indexOf('#')) : '';
    return encoded.get(file) + fragment;
  }
  function images(text, from) {
    return text.replace(/(['"])((?:[^'"<>\r\n]{1,240})\.(?:png|jpe?g|webp|gif|svg|avif|ico)(?:[?#][^'"<>\r\n]*)?)\1/gi, (whole,quote,url) => {
      if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(url)) return whole;
      return quote + dataUrl(url, from) + quote;
    });
  }
  function css(file, ancestors = []) {
    if (ancestors.includes(file)) throw new Error(`Circular CSS import: ${path.relative(ROOT,file)}`);
    let text = source(file).replace(/@import\s+(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)\s*([^;]*);/gi, (whole,_q,url,_q2,quoted,condition) => {
      const reference = url || quoted;
      if (/^https?:\/\/fonts\.googleapis\.com\//i.test(reference)) { omittedFonts++; return '/* Online font import omitted; CSS fallback fonts remain available. */'; }
      const imported = localResource(reference,file,ROOT);
      if (!imported) throw new Error(`External CSS import cannot be bundled: ${reference}`);
      const contents = css(imported,[...ancestors,file]);
      return condition.trim() ? `@media ${condition.trim()}{${contents}}` : contents;
    });
    text = text.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole,_q,url) => {
      if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(url)) return whole;
      return `url("${dataUrl(url,file)}")`;
    });
    const checked = esbuild.transformSync(text, { loader:'css', sourcefile:path.relative(ROOT,file), logLevel:'silent' });
    if (checked.warnings.length) throw new Error(`CSS warning in ${path.relative(ROOT,file)}: ${checked.warnings[0].text}`);
    cssCount++;
    return text.replace(/<\/style/gi,'\\3c /style');
  }
  function js(file) {
    let text = images(source(file), file);
    // Replace registration with an already resolved promise, preserving any
    // surrounding guard/catch while preventing an artifact from installing SWs.
    text = text.replace(/navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(\s*(['"])[^'"]*\1\s*\)/g, 'Promise.resolve(null)');
    if (/serviceWorker\s*\.\s*register\s*\(/.test(text)) throw new Error(`Unrecognized service worker registration in ${path.relative(ROOT,file)}.`);
    text = text.replace(/\b(?:(?:window|root|globalThis)\.)?(?:localStorage|sessionStorage)\b/g, 'window.__vertexCanvaStore');
    new vm.Script(text, { filename:path.relative(ROOT,file) });
    scripts.push(text);
    return text.replace(/<\/script/gi,'<\\/script');
  }
  let html = source(INPUT);
  html = html.replace(/<link\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi, tag => {
    const attrs = attributes(tag);
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('manifest') || rel.includes('apple-touch-icon')) return '';
    if (rel.includes('stylesheet')) {
      const file = localResource(attrs.href,INPUT,ROOT);
      if (!file) throw new Error('External stylesheet links cannot be bundled.');
      const media = attrs.media ? ` media="${attrs.media.replaceAll('"','&quot;')}"` : '';
      return `<style${media}>\n/* ${path.relative(ROOT,file).replaceAll('\\','/')} */\n${css(file)}\n</style>`;
    }
    return images(tag, INPUT);
  });
  html = html.replace(/<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi, tag => /^(?:apple-mobile-web-app-|mobile-web-app-capable)/i.test(attributes(tag).name || '') ? '' : tag);
  html = images(html, INPUT);
  html = html.replace(/<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>[\s\S]*?<\/script\s*>/gi, (whole,raw) => {
    const attrs = attributes(`<script ${raw}>`);
    if (!attrs.src) throw new Error('Inline source scripts need explicit review before packaging.');
    if (attrs.type && attrs.type !== 'text/javascript') throw new Error(`Unsupported script type: ${attrs.type}`);
    const file = localResource(attrs.src,INPUT,ROOT);
    if (!file) throw new Error('External scripts cannot be bundled.');
    if (/^(?:sw|service-worker)\./i.test(path.basename(file))) return '';
    return `<script>\n/* ${path.relative(ROOT,file).replaceAll('\\','/')} */\n${js(file)}\n</script>`;
  });
  const memory = `(()=>{const values=new Map();Object.defineProperty(window,'__vertexCanvaStore',{value:{getItem:key=>values.get(String(key))??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(String(key)),clear:()=>values.clear(),key:index=>[...values.keys()][index]??null,get length(){return values.size;}}});})();`;
  const annotation = `<style id="vertex-artifact-style">#installButton,#profileInstall{display:none!important}#vertexArtifactNotice{font:12px/1.6 Arial,sans-serif;text-align:center;color:#596477;margin:20px auto;padding:0 20px 20px;max-width:900px}</style>`;
  html = html.replace(/<head\b[^>]*>/i, opening => `${opening}\n<!-- Standalone Vertex demonstration; fresh in-memory data on every reload. -->\n<script>${memory}</script>\n`);
  html = html.replace(/<\/head\s*>/i, `${annotation}</head>`);
  html = html.replace(/<\/body\s*>/i, '<p id="vertexArtifactNotice">Интерактивный прототип · изменения сбрасываются после обновления. Оплаты и заявки демонстрационные.<br>Interactive prototype · changes reset on reload. Payments and requests are demonstrations.</p></body>');
  // Compile the combined classic scripts to catch cross-file declaration clashes.
  new vm.Script([memory,...scripts].join('\n;\n'), { filename:'Vertex-Canva-Latest.html' });
  if (/\b(?:localStorage|sessionStorage)\b|serviceWorker\s*\.\s*register\s*\(/.test(html)) throw new Error('Persistent storage or service worker registration remained in the artifact.');
  fs.mkdirSync(path.dirname(OUTPUT), { recursive:true });
  fs.writeFileSync(OUTPUT, html, 'utf8');
  const hash = crypto.createHash('sha256').update(html).digest('hex');
  console.log(`PASS Canva package: ${scripts.length} scripts, ${cssCount} stylesheets, ${encoded.size} embedded assets; ${omittedFonts} online font import omitted.`);
  console.log(`${path.relative(PROJECT,OUTPUT).replaceAll('\\','/')} (${Buffer.byteLength(html)} bytes)`);
  console.log(`SHA256 ${hash}`);
}

try { main(); } catch (error) {
  const concise = error.errors?.map(item => item.text).join('; ') || error.message;
  console.error(`FAIL Canva package: ${concise}`);
  process.exitCode = 1;
}
