#!/usr/bin/env bash
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != true ]]; then
  echo 'Android E2E runs only in GitHub Actions.' >&2
  exit 1
fi
cd "$(dirname "$0")/../../.."
E2E_ARTIFACTS="$PWD/test-results/android"
mkdir -p "$E2E_ARTIFACTS"
node apps/mobile/e2e/portal.mjs "$PWD/android-e2e-apks" >"$E2E_ARTIFACTS/portal.log" 2>&1 &
PORTAL_PID=$!
capture() {
  adb exec-out screencap -p > "$E2E_ARTIFACTS/final-screen.png" || true
  adb shell uiautomator dump /sdcard/netmate-hierarchy.xml || true
  adb pull /sdcard/netmate-hierarchy.xml "$E2E_ARTIFACTS/final-hierarchy.xml" || true
  adb logcat -d > "$E2E_ARTIFACTS/logcat.txt" || true
  curl -fsS http://127.0.0.1:38081/evidence > "$E2E_ARTIFACTS/portal-evidence.json" || true
  kill "$PORTAL_PID" || true
}
trap capture EXIT
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:38081/radio >/dev/null; then break; fi
  sleep 1
done
adb install -r android-e2e-apks/base.apk
adb install -r android-e2e-apks/test.apk
adb shell am instrument -w -r com.netmate.app.e2e.test/androidx.test.runner.AndroidJUnitRunner | tee "$E2E_ARTIFACTS/instrumentation.txt"
node - "$E2E_ARTIFACTS/instrumentation.txt" <<'JS'
const text = require('node:fs').readFileSync(process.argv[2], 'utf8');
const count = /OK \((\d+) tests?\)/.exec(text);
if (!count || Number(count[1]) < 3 || /FAILURES|INSTRUMENTATION_FAILED|INSTRUMENTATION_STATUS_CODE:\s*-[34]/.test(text)) throw new Error('Native integration tests are missing, failed or skipped');
JS
adb shell am force-stop com.netmate.app.e2e
adb shell pm clear com.netmate.app.e2e
adb shell pm grant com.netmate.app.e2e android.permission.ACCESS_COARSE_LOCATION
adb shell pm grant com.netmate.app.e2e android.permission.ACCESS_FINE_LOCATION
if [[ "$API_LEVEL" -ge 29 ]]; then adb shell pm grant com.netmate.app.e2e android.permission.ACCESS_BACKGROUND_LOCATION; fi
if [[ "$API_LEVEL" -ge 33 ]]; then
  adb shell pm grant com.netmate.app.e2e android.permission.NEARBY_WIFI_DEVICES
  adb shell pm grant com.netmate.app.e2e android.permission.POST_NOTIFICATIONS
fi
adb shell dumpsys deviceidle whitelist +com.netmate.app.e2e
adb shell settings put secure location_mode 3
run_flow() {
  maestro test --format junit --output "$E2E_ARTIFACTS/$1.xml" --debug-output "$E2E_ARTIFACTS/$1" --test-output-dir "$E2E_ARTIFACTS/$1" "apps/mobile/e2e/$1.yaml"
  python3 - "$E2E_ARTIFACTS/$1.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
if not list(root.iter('testcase')) or any(list(root.iter(tag)) for tag in ['failure', 'error', 'skipped']):
    raise SystemExit('Maestro flow is missing, failed or skipped')
PY
}
run_flow config-auth
run_flow config-crud
curl -fsS 'http://127.0.0.1:38081/control?ssid=&failConnections=true&online=false'
run_flow reconnect-failure
curl -fsS 'http://127.0.0.1:38081/control?failConnections=false'
run_flow reconnect-recovery
curl -fsS 'http://127.0.0.1:38081/control?slow=true'
run_flow update
curl -fsS 'http://127.0.0.1:38081/control?slow=false&invalid=true'
run_flow update-invalid
curl -fsS 'http://127.0.0.1:38081/control?invalid=false'
run_flow update-install
adb shell dumpsys package com.netmate.app.e2e > "$E2E_ARTIFACTS/installed-package.txt"
node - "$E2E_ARTIFACTS/installed-package.txt" <<'JS'
const text = require('node:fs').readFileSync(process.argv[2], 'utf8');
if (!text.includes('versionName=1.0.2-e2e') || !text.includes('versionCode=10020')) throw new Error('Coverage installation did not complete');
JS
curl -fsS http://127.0.0.1:38081/evidence > "$E2E_ARTIFACTS/portal-evidence.json"
node - "$E2E_ARTIFACTS/portal-evidence.json" <<'JS'
const data = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (!data.attempts.some(user => user.includes('reject')) || !data.attempts.some(user => user.includes('accept'))) throw new Error('Account fallback was not exercised');
JS
