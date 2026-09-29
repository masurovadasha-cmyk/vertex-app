"""Restore the 19 reviewed text changes with strict before/after SHA-256 checks."""
import base64
import hashlib
import json
import lzma
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
allowed = {
    'vertex/dist/host-console.js', 'vertex/dist/views-catalog.js',
    'vertex/dist/design-shell.js', 'vertex/dist/design-interactions.js',
    'vertex/dist/sw.js', 'vertex/dist/studio-theme.css',
    'vertex/dist/host-domain.js', 'vertex/dist/profile-menu.js',
    'vertex/dist/index.html', 'vertex/dist/host-console.css',
    'vertex/dist/release.json', 'vertex/tools/app-release.test.cjs',
    'vertex/tools/host-domain.test.cjs', 'scripts/browser-studio.py',
    'android/app/src/main/java/com/vertex/demo/MainActivity.java',
    'android/app/src/main/AndroidManifest.xml', 'docs/HOST-STUDIO-1.12.md',
    'package.json', 'android/app/build.gradle',
}
encoded = ''.join((ROOT / '.ci/studio' / f'chunk-{i}.b64').read_text().strip() for i in range(5))
data = base64.b64decode(encoded, validate=True)
assert hashlib.sha256(data).hexdigest() == '6e13a602bd9b3d96e9fd00cb43d92778b96f23a390f443ac197a40715feb88c9', 'Transport checksum mismatch'
entries = json.loads(lzma.decompress(data))
assert len(entries) == len(allowed)
assert {e['path'] for e in entries} == allowed
pending = []
for entry in entries:
    path = ROOT / entry['path']
    assert path.resolve().is_relative_to(ROOT)
    assert not path.is_symlink()
    if entry['before'] is None:
        assert not path.exists(), f'Unexpected existing file: {path}'
        text = ''
    else:
        text = path.read_text(encoding='utf-8')
        assert hashlib.sha256(text.encode()).hexdigest() == entry['before'], f'Base changed: {path}'
    previous_end = 0
    for start, end, replacement in entry['edits']:
        assert isinstance(replacement, str)
        assert previous_end <= start <= end <= len(text)
        previous_end = end
    for start, end, replacement in reversed(entry['edits']):
        text = text[:start] + replacement + text[end:]
    assert hashlib.sha256(text.encode()).hexdigest() == entry['after'], f'Output checksum mismatch: {path}'
    pending.append((path, text))
for path, text in pending:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')
    print('Verified:', path.relative_to(ROOT))
print('PASS: all 19 source files restored from reviewed checksummed text; no payload code was executed.')
