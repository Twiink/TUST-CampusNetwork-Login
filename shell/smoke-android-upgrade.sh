#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Release upgrade smoke requires an isolated CI emulator.' >&2; exit 1; }
serial=$(adb devices | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1 }')
[[ "$serial" =~ ^emulator-[0-9]+$ ]]
export ANDROID_SERIAL="$serial"
adb() { command adb -s "$serial" "$@"; }
smoke_root=${NETMATE_UPGRADE_ARTIFACTS:-release-smoke}
mkdir -p "$smoke_root"
capture() {
  adb logcat -d > "$smoke_root/android-logcat.txt" || true
  adb exec-out screencap -p > "$smoke_root/android.png" || true
  adb shell dumpsys input_method > "$smoke_root/android-input-method.txt" || true
  adb shell dumpsys package com.netmate.app > "$smoke_root/android-installed-package.txt" || true
}
trap capture EXIT
previous=$(find previous-release -name '*.apk' -type f | head -n 1)
adb install "$previous"
adb shell pm grant com.netmate.app android.permission.ACCESS_COARSE_LOCATION
adb shell pm grant com.netmate.app android.permission.ACCESS_FINE_LOCATION
adb shell pm grant com.netmate.app android.permission.ACCESS_BACKGROUND_LOCATION
run_flow() {
  maestro --device "$serial" test --driver-host-port 7001 --format junit --output "$smoke_root/$1.xml" --debug-output "$smoke_root/$1" --test-output-dir "$smoke_root/$1" "apps/mobile/e2e/$1.yaml"
  python3 - "$smoke_root/$1.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
root=ET.parse(sys.argv[1]).getroot()
if not list(root.iter('testcase')) or any(list(root.iter(tag)) for tag in ['failure','error','skipped']): raise SystemExit('Upgrade smoke failed or incomplete')
PY
}
run_flow release-upgrade-before
if [[ "${1:-}" == --prepare-only ]]; then exit 0; fi
next=$(find apps/mobile/android/app/build/outputs/apk/release -name '*universal*.apk' -type f | head -n 1)
adb install -r "$next"
run_flow release-upgrade-after
adb shell dumpsys package com.netmate.app > "$smoke_root/android-installed-package.txt"
