#!/usr/bin/env python3
"""Import the CI certificate without printing credentials or altering a login keychain."""
import base64
import os
from pathlib import Path
import subprocess
import tempfile

def main():
    for name in ('CERTIFICATE','CERTIFICATE_PASSWORD','KEYCHAIN_PASSWORD'):
        if not os.environ.get(name): raise SystemExit(f'Missing signing setting: {name}')
    keychain=Path(os.environ['RUNNER_TEMP'])/'netmate-signing.keychain-db'
    def run(*args): subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
    run('security','create-keychain','-p',os.environ['KEYCHAIN_PASSWORD'],str(keychain))
    run('security','set-keychain-settings','-lut','21600',str(keychain))
    run('security','unlock-keychain','-p',os.environ['KEYCHAIN_PASSWORD'],str(keychain))
    with tempfile.NamedTemporaryFile(suffix='.p12') as cert:
        cert.write(base64.b64decode(os.environ['CERTIFICATE'],validate=True));cert.flush()
        run('security','import',cert.name,'-P',os.environ['CERTIFICATE_PASSWORD'],'-A','-t','cert','-f','pkcs12','-k',str(keychain))
    run('security','set-key-partition-list','-S','apple-tool:,apple:','-k',os.environ['KEYCHAIN_PASSWORD'],str(keychain))
    run('security','list-keychains','-d','user','-s',str(keychain))
if __name__=='__main__':main()
