#!/usr/bin/env python3
import argparse
from pathlib import Path
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('apk', type=Path)
    args = parser.parse_args()
    if args.apk.stat().st_size > 5 * 1048576:
        raise SystemExit('APK exceeds 5 MiB')
    with zipfile.ZipFile(args.apk) as archive:
        names = archive.namelist()
        if any(name.endswith('.so') or name.endswith('index.android.bundle') for name in names):
            raise SystemExit('Unexpected native/JavaScript runtime in APK')
        if 'assets/dexopt/baseline.prof' not in names:
            raise SystemExit('Baseline Profile missing')
    print(f'APK budget passed: {args.apk.stat().st_size} bytes; no embedded native or JS runtime')

if __name__ == '__main__':
    main()
