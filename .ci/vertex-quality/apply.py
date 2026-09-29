from pathlib import Path
import base64, gzip, hashlib, json

root = Path.cwd().resolve()
folder = root / '.ci/vertex-quality'
parts = [(folder / f'part-{i}').read_bytes() for i in range(1, 5)]
# Restore one known transport transcription error, never a source-code edit.
# The entire delta must match the verified local SHA256 before application.
encoded = base64.b64encode(parts[1]).decode('ascii')
if hashlib.sha256(b''.join(parts)).hexdigest() != '0260e3ac005ed15d7966400a2b2fc306145a47caed522a942eafbfbed8b73a23':
    if encoded.count('Xnzv4ouLf7v4zYrx') != 1:
        raise RuntimeError('Unexpected transport content; refusing to apply')
    parts[1] = base64.b64decode(encoded.replace('Xnzv4ouLf7v4zYrx', 'Xnzv4ouLf7z4Yrx') + 'h', validate=True)
blob = b''.join(parts)
if hashlib.sha256(blob).hexdigest() != '0260e3ac005ed15d7966400a2b2fc306145a47caed522a942eafbfbed8b73a23':
    raise RuntimeError('Delta SHA256 mismatch; refusing to apply')
delta = json.loads(gzip.decompress(blob))
allowed = {
'concierge-server/atomic-store.mjs', 'concierge-server/atomic-store.test.mjs',
'concierge-server/server.mjs', 'concierge-server/test.mjs', 'docs/ARCHITECTURE-QUALITY.md',
'package.json', 'scripts/browser-quality.py', 'vertex/dist/app.js', 'vertex/dist/business.js',
'vertex/dist/concierge-learning.js', 'vertex/dist/design-interactions.js', 'vertex/dist/design-shell.js',
'vertex/dist/group.js', 'vertex/dist/host-console-more.js', 'vertex/dist/host-console.css',
'vertex/dist/host-console.js', 'vertex/dist/index.html', 'vertex/dist/mobile.js',
'vertex/dist/release.json', 'vertex/dist/rental-domain.js', 'vertex/dist/rentals.js',
'vertex/dist/sw.js', 'vertex/tools/concierge-demo.test.cjs', 'vertex/tools/rental-domain.test.cjs'
}
if set(delta) != allowed:
    raise RuntimeError('Unexpected changed-file set')
prepared = {}
for name, record in delta.items():
    target = root / name
    if target.is_symlink() or not target.resolve().is_relative_to(root):
        raise RuntimeError('Unsafe target')
    before = target.read_bytes() if target.exists() else b''
    if hashlib.sha256(before).hexdigest() != record['before']:
        raise RuntimeError(f'Concurrent or unexpected source change: {name}')
    result = before.decode('utf-8')
    for start, end, replacement in reversed(record['edits']):
        if not 0 <= start <= end <= len(result):
            raise RuntimeError('Invalid edit coordinates')
        result = result[:start] + replacement + result[end:]
    after = result.encode('utf-8')
    if hashlib.sha256(after).hexdigest() != record['after']:
        raise RuntimeError(f'Result hash mismatch: {name}')
    prepared[target] = after
for target, content in prepared.items():
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
print(f'PASS: {len(prepared)} source files restored to exact tested SHA256 values')
