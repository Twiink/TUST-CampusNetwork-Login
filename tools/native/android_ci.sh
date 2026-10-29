#!/usr/bin/env bash
set -euo pipefail
collect_diagnostics() {
  mkdir -p dist-native
  adb logcat -d -t 5000 > dist-native/android-logcat.txt 2>&1 || true
  adb shell dumpsys activity activities > dist-native/android-activities.txt 2>&1 || true
}
trap collect_diagnostics EXIT
# This integration suite runs only in CI. Hardware/campus acceptance is separate.
python3 tools/native/run_android_tests.py
adb install -r apps/mobile/android/app/build/outputs/apk/benchmark/app-benchmark.apk
for permission in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION NEARBY_WIFI_DEVICES POST_NOTIFICATIONS; do
  adb shell pm grant com.netmate.app "android.permission.$permission"
done
adb shell am start -W -n com.netmate.app/.MainActivity
python3 tools/native/prepare_android_profile.py
if ! python3 tools/native/startup_android.py --compilation baseline-profile --apk apps/mobile/android/app/build/outputs/apk/benchmark/app-benchmark.apk --out dist-native/android-startup.json; then
  python3 tools/native/trace_android_startup.py || true
  exit 1
fi
python3 tools/native/measure_android.py --ui --seconds 120 --out dist-native/android-foreground.json
python3 tools/native/check_budget.py --android dist-native/android-foreground.json
adb shell input keyevent KEYCODE_HOME
python3 tools/native/measure_android.py --seconds 600 --out dist-native/android-background.json
python3 tools/native/check_budget.py --android dist-native/android-background.json
if [ "${NETMATE_ENDURANCE:-false}" = true ]; then
  python3 tools/native/measure_android.py --seconds 7200 --out dist-native/android-endurance.json
  python3 tools/native/check_budget.py --android dist-native/android-endurance.json
fi
