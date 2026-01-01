#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# macOS Port Checker & Killer
#
# EXECUTION:
#   ./check-ports.sh
#
# CLI BEHAVIOR:
#   - Default (no args): CHECK ONLY (no killing)
#       ./check-ports.sh
#
#   - Kill mode:
#       * Kill on default port list:
#           ./check-ports.sh --kill
#       * Kill on a single port ONLY:
#           ./check-ports.sh --kill=3000
#
#   - Protection:
#       * Protect ports from being killed (comma-separated list):
#           ./check-ports.sh --kill --protect=3000,5173
#       * Force killing protected ports (dangerous):
#           ./check-ports.sh --kill --protect=3000,5173 --force-protected
#
# NOTES:
#   - Uses `lsof` to find PIDs listening on TCP ports.
#   - Uses `ps` to print process details.
#   - Uses `kill` to terminate processes (TERM then KILL if needed).
# ============================================================

# ------------------------------------------------------------
# Runtime flags (defaults)
# ------------------------------------------------------------
KILL_MODE=0
FORCE_PROTECTED=0
PROTECTED_PORTS=()     # array of protected ports
KILL_SINGLE_PORT=""    # if set, only check this port

# ------------------------------------------------------------
# DEFAULT PORT LIST + COMMENTARY
# ------------------------------------------------------------
# Port Reference:
#   80     : HTTP reverse proxy / web server (nginx, apache)
#   443    : HTTPS reverse proxy / web server
#   8080   : Common app HTTP (Spring Boot, Tomcat, dev servers)
#   8843   : Non-standard HTTPS / admin consoles
#   3000   : Frontend dev servers (React, Next.js)
#   5173   : Vite default dev server
#   8000   : Backend dev (Django, FastAPI, Uvicorn)
#   9000   : Ops / middleware (Portainer, admin tools)
#   5432   : PostgreSQL
#   3306   : MySQL / MariaDB
#   6379   : Redis
#   27017  : MongoDB
#   8081   : Alternate HTTP / secondary instances
#   7001   : Java admin / WebLogic common
#   5000   : Backend dev (Flask, local APIs)
DEFAULT_PORTS=(80 443 8080 8843 3000 5173 8000 9000 5432 3306 6379 27017 8081 7001 5000)

# ------------------------------------------------------------
# Colors (portable ANSI)
# ------------------------------------------------------------
c_reset="\033[0m"
c_gray="\033[90m"
c_red="\033[31m"
c_green="\033[32m"
c_yellow="\033[33m"
c_cyan="\033[36m"

print_line() {
  # Usage: print_line "message" "color"
  local msg="$1"
  local color="${2:-reset}"
  local code="$c_reset"
  case "$color" in
    gray)   code="$c_gray" ;;
    red)    code="$c_red" ;;
    green)  code="$c_green" ;;
    yellow) code="$c_yellow" ;;
    cyan)   code="$c_cyan" ;;
    reset)  code="$c_reset" ;;
  esac
  printf "%b%s%b\n" "$code" "$msg" "$c_reset"
}

# ------------------------------------------------------------
# Parse args
# Supported:
#   --kill
#   --kill=<port>
#   --protect=<p1,p2,...>
#   --force-protected
# ------------------------------------------------------------
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --kill)
        KILL_MODE=1
        shift
        ;;
      --kill=*)
        KILL_MODE=1
        KILL_SINGLE_PORT="${1#*=}"
        shift
        ;;
      --protect=*)
        local raw="${1#*=}"
        IFS=',' read -r -a PROTECTED_PORTS <<< "$raw"
        shift
        ;;
      --force-protected)
        FORCE_PROTECTED=1
        shift
        ;;
      *)
        # Unknown token: ignore for robustness
        shift
        ;;
    esac
  done
}

is_protected_port() {
  # Returns 0 if protected, 1 otherwise
  local port="$1"
  for p in "${PROTECTED_PORTS[@]:-}"; do
    [[ "$p" == "$port" ]] && return 0
  done
  return 1
}

# ------------------------------------------------------------
# Get PIDs listening on a port (TCP LISTEN)
# - De-duplicate PIDs
# - Ignore empty results
# ------------------------------------------------------------
get_listening_pids() {
  local port="$1"
  # lsof output:
  #   -nP : no DNS, no service name (fast & consistent)
  #   -iTCP:PORT : filter by TCP port
  #   -sTCP:LISTEN : only listeners
  #
  # We parse PID column and de-duplicate via sort -u.
  lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u
}

show_process() {
  local pid="$1"
  print_line "    Process info (PID=$pid):" cyan

  if ps -p "$pid" -o pid=,ppid=,user=,comm=,args= >/dev/null 2>&1; then
    ps -p "$pid" -o pid=,ppid=,user=,comm=,args= | while IFS= read -r line; do
      print_line "      $line" cyan
    done
  else
    print_line "      (No ps output. PID may have exited or requires privileges.)" gray
  fi
}

kill_pid() {
  local pid="$1"
  local port="$2"

  print_line "    Killing PID $pid (port $port) ..." yellow

  # First try graceful terminate (TERM). If still alive, force kill (KILL).
  kill -TERM "$pid" >/dev/null 2>&1 || true

  # Small wait to allow graceful exit
  sleep 0.2

  if kill -0 "$pid" >/dev/null 2>&1; then
    kill -KILL "$pid" >/dev/null 2>&1 || true
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    print_line "    [FAIL]   Could not kill PID $pid (try sudo)." red
  else
    print_line "    [KILLED] PID $pid terminated." green
  fi
}

maybe_kill() {
  local pid="$1"
  local port="$2"

  if is_protected_port "$port"; then
    if [[ "$FORCE_PROTECTED" -eq 0 ]]; then
      print_line "    [SKIP] Port $port is protected. Not killing PID $pid." yellow
      print_line "           Use --force-protected to override." yellow
      return 0
    else
      print_line "    [WARN] Forcing kill on protected port $port (PID $pid)." yellow
    fi
  fi

  kill_pid "$pid" "$port"
}

check_port() {
  local port="$1"

  # Collect PIDs (already deduped)
  mapfile -t pids < <(get_listening_pids "$port")

  if [[ "${#pids[@]}" -eq 0 ]]; then
    print_line "[OK]   Port $port is free" green
    return 0
  fi

  print_line "[BUSY] Port $port is in use. PID(s)=$(printf " %s" "${pids[@]}")" red

  for pid in "${pids[@]}"; do
    show_process "$pid"
    if [[ "$KILL_MODE" -eq 1 ]]; then
      maybe_kill "$pid" "$port"
    fi
  done
}

# -------------------------
# Main
# -------------------------
parse_args "$@"

PORTS=("${DEFAULT_PORTS[@]}")
if [[ -n "$KILL_SINGLE_PORT" ]]; then
  PORTS=("$KILL_SINGLE_PORT")
fi

print_line "==========================================" gray
print_line "macOS Port Checker" gray
print_line "==========================================" gray
echo

print_line "Ports to check:" gray
print_line "${PORTS[*]}" gray
echo

if [[ "${#PROTECTED_PORTS[@]}" -gt 0 ]]; then
  print_line "Protected ports (skip when killing): ${PROTECTED_PORTS[*]}" yellow
else
  print_line "Protected ports: (none)" yellow
fi

if [[ "$KILL_MODE" -eq 1 ]]; then
  if [[ -n "$KILL_SINGLE_PORT" ]]; then
    print_line "Mode: CHECK + KILL (single port)" yellow
  else
    print_line "Mode: CHECK + KILL (default port list)" yellow
  fi
else
  print_line "Mode: CHECK ONLY" yellow
fi

if [[ "$FORCE_PROTECTED" -eq 1 ]]; then
  print_line "WARNING: FORCE killing protected ports is enabled" red
fi

echo

for port in "${PORTS[@]}"; do
  check_port "$port"
done

echo
print_line "==========================================" gray
print_line "Done" gray
print_line "==========================================" gray
