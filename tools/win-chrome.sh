#!/usr/bin/env bash
# Windows Chrome for browser checks from WSL: it renders on the machine's GPU through Direct3D, as a player's Chrome
# does, where Chrome inside WSL falls back to software GL. Needs WSL's mirrored networking (`networkingMode=mirrored`
# in %USERPROFILE%\.wslconfig), so the DevTools port and the dev server share localhost; the port listens on
# 127.0.0.1 only. The chrome-devtools MCP attaches with `--browserUrl http://127.0.0.1:9222` (AGENTS.md, Commands).
# Usage: tools/win-chrome.sh [start|stop|status] [--headless]   (PORT=9222 by default)
set -euo pipefail
PORT=${PORT:-9222}
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
# its own profile, apart from the user's: a profile in use by another Chrome refuses the debugging port
PROFILE="$(powershell.exe -NoProfile -Command '[Environment]::GetFolderPath("LocalApplicationData")' | tr -d '\r')\\rts-chrome"
# Get-Process has no command line in Windows PowerShell 5.1: filter on it through CIM, by our profile
PIDS="Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { \$_.CommandLine -like '*rts-chrome*' }"

up() { curl -s -m 2 "http://127.0.0.1:$PORT/json/version" >/dev/null; }

case "${1:-start}" in
  start)
    if up; then echo "Chrome already on port $PORT"; exit 0; fi
    [ -x "$CHROME" ] || { echo "Chrome not found at $CHROME" >&2; exit 2; }
    "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
      ${2:+--headless=new} about:blank >/dev/null 2>&1 &
    for _ in $(seq 20); do up && { echo "Chrome on http://127.0.0.1:$PORT"; exit 0; }; sleep 0.5; done
    echo "Chrome did not open port $PORT (is networkingMode=mirrored set?)" >&2; exit 1 ;;
  stop)
    powershell.exe -NoProfile -Command "$PIDS | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }"
    echo stopped ;;
  status)
    if up; then curl -s "http://127.0.0.1:$PORT/json/version" | grep -E '"Browser"'; else echo "not running"; exit 1; fi ;;
  *) echo "usage: tools/win-chrome.sh [start|stop|status] [--headless]" >&2; exit 2 ;;
esac
