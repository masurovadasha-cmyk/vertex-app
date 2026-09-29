"""Apply reviewed text edits only after verifying every before/after SHA256."""
from pathlib import Path
import hashlib, json
from PIL import Image
root=Path.cwd().resolve()
changes=json.loads((root/'.ci/red/changes.json').read_text())
prepared={}
for name,record in changes.items():
    target=root/name
    if target.is_symlink() or not target.resolve().is_relative_to(root): raise RuntimeError('Unsafe path')
    before=target.read_bytes()
    if name.startswith('.github/workflows/'):
        # Workflow files are saved explicitly by the authorized GitHub connector.
        # The Actions token must never create, edit or delete workflow files.
        if hashlib.sha256(before).hexdigest()!=record['after']: raise RuntimeError('Workflow revision mismatch: '+name)
        continue
    if hashlib.sha256(before).hexdigest()!=record['before']: raise RuntimeError('Concurrent source change: '+name)
    text=before.decode('utf-8')
    for start,end,value in reversed(record['edits']):
        if not 0<=start<=end<=len(text): raise RuntimeError('Invalid edit')
        text=text[:start]+value+text[end:]
    after=text.encode('utf-8')
    if hashlib.sha256(after).hexdigest()!=record['after']: raise RuntimeError('Result mismatch: '+name)
    prepared[target]=after
for target,content in prepared.items(): target.write_bytes(content)
for name in ['icon-192.png','icon-512.png','apple-touch-icon.png']:
    target=root/'vertex/dist'/name
    image=Image.open(target).convert('RGBA');pixels=[]
    for r,g,b,a in image.getdata():
        if a and b>r and b>g:
            blend=max(0,min(1,(255-r)/(255-66)))
            r,g,b=[round(255*(1-blend)+v*blend) for v in (229,29,87)]
        pixels.append((r,g,b,a))
    image.putdata(pixels);image.save(target,optimize=True)
print('PASS: exact reviewed text hashes; existing app icons recoloured, photos untouched')
