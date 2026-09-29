from pathlib import Path
import hashlib,json
root=Path.cwd().resolve()
allowed={'AGENTS.md','package.json','vertex/dist/index.html','vertex/dist/manifest.webmanifest','vertex/dist/release.json','vertex/dist/sw.js','vertex/dist/group.js','vertex/dist/mobility.js','vertex/dist/web-entry.js','vertex/tools/app-release.test.cjs'}
records=json.loads((root/'.ci/red-taxi/changes.json').read_text())
if set(records)!=allowed:raise RuntimeError('Unexpected source path set')
prepared={}
for name,data in records.items():
    target=root/name
    if target.is_symlink() or not target.resolve().is_relative_to(root):raise RuntimeError('Unsafe path')
    before=target.read_bytes()
    if hashlib.sha256(before).hexdigest()!=data['before']:raise RuntimeError('Concurrent source change: '+name)
    text=before.decode('utf8')
    for start,end,value in reversed(data['edits']):
        if not 0<=start<=end<=len(text):raise RuntimeError('Invalid edit range')
        text=text[:start]+value+text[end:]
    after=text.encode('utf8')
    if hashlib.sha256(after).hexdigest()!=data['after']:raise RuntimeError('Result hash mismatch: '+name)
    prepared[target]=after
for target,data in prepared.items():target.write_bytes(data)
print('PASS exact before/after SHA256 for all existing-source edits')
