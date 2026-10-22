#!/usr/bin/env bash
# Windows Chrome for browser checks from WSL: it renders on the machine's GPU through Direct3D, as a player's Chrome
# does, where Chrome inside WSL falls back to software GL. Needs WSL's mirrored networking (`networkingMode=mirrored`
# in %USERPROFILE%\.wslconfig), so the DevTools port and the dev server share localhost; the port listens on
# 127.0.0.1 only. The chrome-devtools MCP attaches with `--browserUrl http://127.0.0.1:9222` (AGENTS.md, Commands).
# Usage: tools/win-chrome.sh [start|stop|status] [--headless]   (PORT=9222 by default)
set -euo pipefail
PORT=${PORT:-9222}
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
usage() { echo "usage: tools/win-chrome.sh [start|stop|status] [--headless]" >&2; exit 2; }

cmd=start headless=
for a in "$@"; do
  case "$a" in
    start|stop|status) cmd=$a ;;
    --headless) headless=--headless=new ;;
    *) usage ;;
  esac
done
[ -n "$headless" ] && [ "$cmd" != start ] && usage

up() { curl -s -m 2 "http://127.0.0.1:$PORT/json/version"; }
need_windows() { command -v powershell.exe >/dev/null && [ -x "$CHROME" ] || { echo "needs WSL with Windows interop and Chrome at $CHROME" >&2; exit 2; }; }
# its own profile, apart from the user's (a profile open in another Chrome refuses the debugging port)
profile() { echo "$(powershell.exe -NoProfile -Command '[Environment]::GetFolderPath("LocalApplicationData")' | tr -d '\r')\\rts-chrome"; }
# the PIDs of the Chrome on exactly this profile. Get-Process has no command line in Windows PowerShell 5.1, so CIM; the
# profile is matched as the whole --user-data-dir value, quoted or not, so another profile's name never matches
pids() {
  powershell.exe -NoProfile -Command "\$p = [regex]::Escape('$1'); Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" -ErrorAction Stop |
    Where-Object { \$_.CommandLine -match ('--user-data-dir=\"?' + \$p + '\"?(\s|\$)') } | ForEach-Object { \$_.ProcessId }" | tr -d '\r'
}

case "$cmd" in
  start)
    need_windows; P=$(profile); running=$(pids "$P")
    if v=$(up); then
      [ -n "$running" ] && echo "$v" | grep -q 'Windows NT' || { echo "port $PORT is taken by another browser or tool" >&2; exit 1; }
      echo "Chrome already on http://127.0.0.1:$PORT"; exit 0
    fi
    # Chrome hands a second launch on an open profile to the running one, which keeps its own flags: no port would open
    [ -z "$running" ] || { echo "rts-chrome is open without port $PORT: run tools/win-chrome.sh stop first" >&2; exit 1; }
    # detached, so closing the shell that started it does not take the interop process (and Chrome's lifetime) with it
    setsid nohup "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$P" --no-first-run --no-default-browser-check \
      $headless about:blank >/dev/null 2>&1 < /dev/null &
    for _ in $(seq 20); do up >/dev/null && { echo "Chrome on http://127.0.0.1:$PORT"; exit 0; }; sleep 0.5; done
    echo "Chrome started but port $PORT did not open (is networkingMode=mirrored set?)" >&2; exit 1 ;;
  stop)
    need_windows; P=$(profile); running=$(pids "$P")
    if [ -n "$running" ]; then
      powershell.exe -NoProfile -Command "$(echo $running | sed 's/ /,/g') | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }"
    fi
    for _ in $(seq 20); do [ -z "$(pids "$P")" ] && ! up >/dev/null && { echo "stopped ($(echo $running | wc -w) processes)"; exit 0; }; sleep 0.5; done
    echo "rts-chrome or port $PORT still up" >&2; exit 1 ;;
  status)
    v=$(up) || { echo "not running"; exit 1; }
    echo "$v" | grep -E '"Browser"' ;;
esac
