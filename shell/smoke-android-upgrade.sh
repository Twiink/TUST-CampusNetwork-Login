#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Release upgrade smoke requires an isolated CI emulator.' >&2; exit 1; }
serial=$(adb devices | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1 }')
[[ "$serial" =~ ^emulator-[0-9]+$ ]]
export ANDROID_SERIAL="$serial"
adb() { command adb -s "$serial" "$@"; }
mkdir -p release-smoke
capture() { adb logcat -d > release-smoke/android-logcat.txt; adb exec-out screencap -p > release-smoke/android.png; }
trap capture EXIT
previous=$(find previous-release -name '*.apk' -type f | head -n 1)
next=$(find apps/mobile/android/app/build/outputs/apk/release -name '*universal*.apk' -type f | head -n 1)
adb install "$previous"
adb shell pm grant com.netmate.app android.permission.ACCESS_COARSE_LOCATION
adb shell pm grant com.netmate.app android.permission.ACCESS_FINE_LOCATION
adb shell pm grant com.netmate.app android.permission.ACCESS_BACKGROUND_LOCATION
run_flow() {
  maestro --device "$serial" test --format junit --output "release-smoke/$1.xml" "apps/mobile/e2e/$1.yaml"
  python3 - "release-smoke/$1.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
root=ET.parse(sys.argv[1]).getroot()
if not list(root.iter('testcase')) or any(list(root.iter(tag)) for tag in ['failure','error','skipped']): raise SystemExit('Upgrade smoke failed or incomplete')
PY
}
run_flow release-upgrade-before
adb install -r "$next"
run_flow release-upgrade-after
adb shell dumpsys package com.netmate.app > release-smoke/android-installed-package.txt
