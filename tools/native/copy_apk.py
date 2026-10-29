#!/usr/bin/env python3
import os
from pathlib import Path
import shutil
import subprocess
import tomllib
ROOT=Path(__file__).resolve().parents[2]
version=tomllib.loads((ROOT/'Cargo.toml').read_text())['workspace']['package']['version']
release=ROOT/'apps/mobile/android/app/build/outputs/apk/release'
apks=list(release.glob('*.apk'))
if len(apks)!=1:raise SystemExit('Expected one native release APK')
subprocess.run(['python3',str(ROOT/'tools/native/check_apk.py'),str(apks[0])],check=True)
if os.environ.get('ANDROID_KEYSTORE_FILE') and 'unsigned' in apks[0].name:raise SystemExit('Distribution APK was not signed')
output=ROOT/'dist-native';output.mkdir(exist_ok=True)
shutil.copy2(apks[0],output/f'NetMate-{version}-android.apk')
shutil.copy2(ROOT/'apps/mobile/android/app/build/outputs/apk/benchmark/app-benchmark.apk',output/f'NetMate-{version}-android-benchmark.apk')
