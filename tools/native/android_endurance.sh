#!/usr/bin/env bash
set -euo pipefail
mkdir -p endurance
trap 'adb logcat -d -t 3000 > endurance/android-logcat.txt 2>&1 || true' EXIT
mapfile -t apks < <(find installation-artifacts -name 'NetMate-*-android.apk')
test "${#apks[@]}" -eq 1
adb install "${apks[0]}"
for permission in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION NEARBY_WIFI_DEVICES POST_NOTIFICATIONS; do
  adb shell pm grant com.netmate.app "android.permission.$permission"
done
adb shell am start -W -n com.netmate.app/.MainActivity
adb shell input keyevent KEYCODE_HOME
python3 tools/native/measure_android.py --seconds 7200 --out endurance/android.json
python3 tools/native/check_budget.py --android endurance/android.json
