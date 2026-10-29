#!/usr/bin/env python3
"""Compare packaged helper launch before and after removing unrelated entitlements, in CI."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile
import time


def probe(binary):
    with tempfile.TemporaryDirectory(prefix='netmate-signing-probe-') as directory:
        env = dict(os.environ, NETMATE_DATA_DIR=directory)
        process = subprocess.Popen([str(binary), '--background'], env=env,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        try:
            time.sleep(2)
            print('Packaged background return code:', process.poll(), flush=True)
            if process.poll() is None:
                status = subprocess.run([str(binary), '--status'], env=env, capture_output=True)
                print('IPC status exit code:', status.returncode, flush=True)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, 15)
            output, _ = process.communicate(timeout=10)
            print(output.decode(errors='replace')[-4000:], flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('app', type=Path)
    args = parser.parse_args()
    binary = args.app.resolve() / 'Contents/MacOS/netmate-agent'
    print('Original distribution signature', flush=True)
    probe(binary)
    subprocess.run(['codesign', '--force', '--options', 'runtime', '--sign', '-', str(binary)], check=True)
    print('Background signature without WiFi host entitlements', flush=True)
    probe(binary)


if __name__ == '__main__':
    main()
