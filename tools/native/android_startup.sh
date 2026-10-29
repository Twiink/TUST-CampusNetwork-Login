#!/usr/bin/env bash
set -euo pipefail
mkdir -p dist-native
trap 'adb logcat -d -t 5000 > dist-native/android-startup-logcat.txt 2>&1 || true' EXIT
apk=apps/mobile/android/app/build/outputs/apk/benchmark/app-benchmark.apk
adb install "$apk"
for permission in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION NEARBY_WIFI_DEVICES POST_NOTIFICATIONS; do
  adb shell pm grant com.netmate.app "android.permission.$permission"
done
python3 tools/native/prepare_android_profile.py
python3 tools/native/startup_android.py --compilation baseline-profile --apk "$apk" --out dist-native/android-startup.json
