#!/usr/bin/env python3
"""Create and verify a signed native update index; private keys stay in the environment."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlparse
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization


def message(release):
    return '\n'.join(str(release[key]) for key in ('version','platform','arch','url','length','sha256')).encode()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('assets',type=Path)
    parser.add_argument('--version',required=True)
    parser.add_argument('--base-url',required=True)
    args=parser.parse_args()
    if not re.fullmatch(r'\d+\.\d+\.\d+',args.version):raise SystemExit('Invalid version')
    if urlparse(args.base_url).scheme!='https':raise SystemExit('HTTPS update source required')
    key=Ed25519PrivateKey.from_private_bytes(base64.b64decode(os.environ['NETMATE_UPDATE_PRIVATE_KEY'],validate=True))
    expected=base64.b64decode(os.environ['NETMATE_UPDATE_PUBLIC_KEY'],validate=True)
    if key.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw)!=expected:raise SystemExit('Update signing key does not match compiled public key')
    releases=[]
    for file in sorted(args.assets.iterdir()):
        match=re.fullmatch(rf'NetMate-{re.escape(args.version)}-(linux|windows|macos)-(x64|arm64)\.(deb|rpm|exe|zip)',file.name)
        if match:
            system,arch,kind=match.groups()
            system={'macos':'macos','windows':'windows','linux':'linux'}[system]
            arch={'x64':'x86_64','arm64':'aarch64'}[arch]
            if kind not in {'linux':('deb','rpm'),'windows':('exe',),'macos':('zip',)}[system]:raise SystemExit('Unexpected platform asset')
        elif file.name==f'NetMate-{args.version}-android.apk':system,arch='android','universal'
        else:continue
        digest=hashlib.sha256()
        with file.open('rb') as stream:
            for block in iter(lambda:stream.read(65536),b''):digest.update(block)
        release=dict(version=args.version,platform=system,arch=arch,url=args.base_url.rstrip('/')+'/'+file.name,length=file.stat().st_size,sha256=digest.hexdigest())
        signature=key.sign(message(release));key.public_key().verify(signature,message(release))
        release['signature']=base64.b64encode(signature).decode();releases.append(release)
    required={('linux','x86_64'),('linux','aarch64'),('windows','x86_64'),('windows','aarch64'),('macos','aarch64'),('android','universal')}
    if not required <= {(r['platform'],r['arch']) for r in releases}:raise SystemExit('Native platform artifacts are incomplete')
    (args.assets/'native-updates.json').write_text(json.dumps(releases,indent=2)+'\n')
    with (args.assets/'SHA256SUMS').open('w') as output:
        for file in sorted(args.assets.iterdir()):
            if file.name=='SHA256SUMS' or not file.is_file():continue
            digest=hashlib.file_digest(file.open('rb'),'sha256').hexdigest()
            output.write(f'{digest}  {file.name}\n')
    print(f'Verified {len(releases)} signed native update entries')
if __name__=='__main__':main()
