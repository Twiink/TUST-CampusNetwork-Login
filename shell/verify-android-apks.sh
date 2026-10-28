#!/usr/bin/env bash
set -euo pipefail
apk_root=$1
previous_apk=$2
version=$3
sdk_tools="$ANDROID_HOME/build-tools/36.0.0"
old_code=$("$sdk_tools/aapt" dump badging "$previous_apk" | sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p" | head -n 1)
old_certificate=$("$sdk_tools/apksigner" verify --print-certs "$previous_apk" | sed -n '/certificate SHA-256 digest:/p')
[[ -n "$old_code" && -n "$old_certificate" ]]
count=0
fail() { printf 'APK verification failed: %s\n' "$*" >&2; exit 1; }
for apk in "$apk_root"/*.apk; do
  printf 'Verifying %s\n' "$(basename "$apk")"
  badge=$("$sdk_tools/aapt" dump badging "$apk" | sed -n '1p')
  [[ "$badge" == *"name='com.netmate.app'"* && "$badge" == *"versionName='$version'"* ]] || fail 'package identity/version'
  code=$(sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p" <<< "$badge")
  (( code > old_code )) || fail 'versionCode does not permit upgrade'
  certificate=$("$sdk_tools/apksigner" verify --print-certs "$apk" | sed -n '/certificate SHA-256 digest:/p')
  [[ "$certificate" == "$old_certificate" ]] || fail 'production signing certificate mismatch'
  node shell/android-apk-policy.mjs "$sdk_tools/aapt" "$apk"
  python3 - "$apk" <<'PYCODE'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    for name in archive.namelist():
        if name.endswith('.dex') and b'10.0.2.2:38081' in archive.read(name): raise SystemExit('Production APK includes E2E endpoint')
PYCODE
  count=$((count+1))
done
[[ $count == 5 ]]
printf 'Verified %s release APKs: version, upgrade codes, production signature and manifest\n' "$count"
