#!/usr/bin/env python3
"""Measure the exact CI installation artifacts after all short checks pass."""
import argparse
import sys
from pathlib import Path
import platform
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('artifacts', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    system = platform.system()
    extension = {'Linux': 'deb', 'Windows': 'exe', 'Darwin': 'zip'}[system]
    packages = list(args.artifacts.rglob(f'NetMate-*.{extension}'))
    if len(packages) != 1:
        raise SystemExit(f'Expected one {extension} installation artifact, found {len(packages)}')
    with tempfile.TemporaryDirectory(prefix='netmate-installed-') as temporary:
        destination = Path(temporary)
        if system == 'Linux':
            subprocess.run(['dpkg-deb', '--extract', str(packages[0]), str(destination)], check=True)
            binary = destination / 'usr/lib/netmate-native/netmate-agent'
            tool = 'measure.py'
        elif system == 'Windows':
            subprocess.run([str(packages[0].resolve()), '/S', f'/D={destination}'], check=True)
            binary = destination / 'netmate-agent.exe'
            tool = 'measure_desktop.py'
        else:
            subprocess.run(['ditto', '-x', '-k', str(packages[0]), str(destination)], check=True)
            binary = destination / 'NetMate.app/Contents/MacOS/netmate-agent'
            tool = 'measure_desktop.py'
        if not binary.is_file():
            raise SystemExit('Installer did not produce the background executable')
        subprocess.run([sys.executable, str(ROOT / 'tools/native' / tool), str(binary),
                        '--seconds', '7200', '--out', str(args.out)], check=True)
        subprocess.run([sys.executable, str(ROOT / 'tools/native/check_budget.py'),
                        str(args.out)], check=True)


if __name__ == '__main__':
    main()
