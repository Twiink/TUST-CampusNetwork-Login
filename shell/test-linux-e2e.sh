#!/usr/bin/env bash
set -euo pipefail
if [[ "${NETMATE_E2E_KEYRING:-}" != 1 ]]; then
  exec dbus-run-session -- env NETMATE_E2E_KEYRING=1 bash "$0" "$@"
fi
test_state_dir=$(mktemp -d)
export XDG_DATA_HOME="$test_state_dir/data"
export XDG_CONFIG_HOME="$test_state_dir/config"
export XDG_RUNTIME_DIR="$test_state_dir/run"
export GNOME_KEYRING_CONTROL="$test_state_dir/keyring"
export XDG_CURRENT_DESKTOP=GNOME
mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
cleanup() { rm -rf "$test_state_dir"; }
trap cleanup EXIT
printf '%s' 'netmate-isolated-fixture' | gnome-keyring-daemon --unlock --components=secrets --control-directory="$test_state_dir/keyring" >/dev/null
gnome-keyring-daemon --start --components=secrets --control-directory="$GNOME_KEYRING_CONTROL" >/dev/null
xvfb-run -a pnpm test:e2e "$@"
