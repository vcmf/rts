#!/usr/bin/env bash
# Windows Chrome for browser checks from WSL: it renders on the machine's GPU through Direct3D, as a player's Chrome
# does, where Chrome inside WSL falls back to software GL. Needs WSL's mirrored networking (`networkingMode=mirrored`
# in %USERPROFILE%\.wslconfig), so the DevTools port and the dev server share localhost; the port listens on
# 127.0.0.1 only. The page tools attach with SHOT_CDP=http://127.0.0.1:9222 (tools/shot.mjs), the chrome-devtools MCP
# when added with `--browserUrl http://127.0.0.1:9222` in place of `--isolated` (AGENTS.md, Commands; decision 0060).
# Usage: tools/win-chrome.sh [start|stop|status] [--headed] [--angle swiftshader|d3d11] [-- <Chrome flags>]
#   (PORT=9222 by default. WIN_CHROME: the chrome.exe to start; else the one in Program Files, else the per-user
#   one in %LOCALAPPDATA%)
# Headless by default, as tools/shot.mjs wants (it refuses a visible window, which can be throttled or covered);
# --headed opens one, for the MCP or a look by eye. --angle sets the WebGL backend: swiftshader (software, the default,
# as tools/shot.mjs's SHOT_ANGLE: the goldens' and checks') or d3d11 (the GPU, for SHOT_ANGLE=d3d11). tools/shot.mjs
# checks the backend a run asks for against the renderer the browser reports, and the flags it asks for
# (SHOT_CHROME_ARGS) against the command line: the look bench on the GPU wants `start --angle d3d11 --
# --disable-gpu-vsync --disable-frame-rate-limit` and `--gpu d3d11`. Flags change only with a stop and a start.
# One Chrome for everyone attached to it: several agents running checks on it at once skew each other's benches.
set -euo pipefail
PORT=${PORT:-9222}
usage() {
  echo "usage: tools/win-chrome.sh [start|stop|status] [--headed] [--angle swiftshader|d3d11] [-- <Chrome flags>]" >&2
  exit 2
}

cmd=start headless=--headless=new angle=swiftshader explicit= flags=()
while [ $# -gt 0 ]; do
  case "$1" in
    start|stop|status) cmd=$1 ;;
    --headed) headless= explicit=1 ;;
    --headless) explicit=1 ;;   # the default; kept for the commands written before it was
    --angle) [ $# -ge 2 ] || usage; case "$2" in swiftshader|d3d11) angle=$2 ;; *) usage ;; esac; explicit=1; shift ;;
    --) shift; flags=("$@"); explicit=1; break ;;
    *) usage ;;
  esac
  shift
done
[ -n "$explicit" ] && [ "$cmd" != start ] && usage
[ -n "${WSL_DISTRO_NAME:-}" ] || { echo "tools/win-chrome.sh runs in WSL only" >&2; exit 2; }

up() { curl -s -m 2 "http://127.0.0.1:$PORT/json/version"; }
# Windows' per-user application data folder (%LOCALAPPDATA%), as Windows names it
localappdata() {
  powershell.exe -NoProfile -Command '[Environment]::GetFolderPath("LocalApplicationData")' | tr -d '\r'
}
# the chrome.exe to start: WIN_CHROME, else the machine-wide install, else the per-user one
chrome_exe() {
  if [ -n "${WIN_CHROME:-}" ]; then echo "$WIN_CHROME"; return; fi
  local machine="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
  if [ -x "$machine" ]; then echo "$machine"; return; fi
  echo "$(wslpath -u "$(localappdata)")/Google/Chrome/Application/chrome.exe"
}
need_interop() {
  command -v powershell.exe >/dev/null || { echo "needs WSL with Windows interop (powershell.exe)" >&2; exit 2; }
}
need_chrome() {
  CHROME=$(chrome_exe)
  [ -x "$CHROME" ] || { echo "no Chrome at $CHROME (set WIN_CHROME)" >&2; exit 2; }
}
# its own profile, apart from the user's (a profile open in another Chrome refuses the debugging port)
profile() { echo "$(localappdata)\\rts-chrome"; }
# the PIDs of the Chrome on exactly this profile. Get-Process has no command line in Windows PowerShell 5.1, so CIM; the
# profile is matched as the whole --user-data-dir value, quoted or not, so another profile's name never matches
pids() {
  set -- "${1//\'/\'\'}"   # a ' in the path doubled, for PowerShell's single quotes
  powershell.exe -NoProfile -Command "\$p = [regex]::Escape('$1'); Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" -ErrorAction Stop |
    Where-Object { \$_.CommandLine -match ('--user-data-dir=\"?' + \$p + '\"?(\s|\$)') } | ForEach-Object { \$_.ProcessId }" | tr -d '\r'
}

case "$cmd" in
  start)
    need_interop; need_chrome; P=$(profile); running=$(pids "$P")
    if v=$(up); then
      [ -n "$running" ] && echo "$v" | grep -q 'Windows NT' || { echo "port $PORT is taken by another browser or tool" >&2; exit 1; }
      # its flags are those of its launch: asking for others would silently get these
      [ -z "$explicit" ] || { echo "Chrome already on port $PORT with its own flags: tools/win-chrome.sh stop first" >&2; exit 1; }
      echo "Chrome already on http://127.0.0.1:$PORT (its flags those of its launch)"; exit 0
    fi
    # Chrome hands a second launch on an open profile to the running one, which keeps its own flags: no port would open
    [ -z "$running" ] || { echo "rts-chrome is open without port $PORT: run tools/win-chrome.sh stop first" >&2; exit 1; }
    # detached, so closing the shell that started it does not take the interop process (and Chrome's lifetime) with it;
    # --enable-automation lets a tool read the flags back (Browser.getBrowserCommandLine); the GPU and SwiftShader flags
    # are the ones tools/shot.mjs launches with; a window behind others (headed) keeps rendering at full rate
    setsid nohup "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$P" --no-first-run --no-default-browser-check \
      --enable-automation --use-angle="$angle" --ignore-gpu-blocklist --enable-unsafe-swiftshader \
      --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling \
      $headless "${flags[@]}" about:blank \
      >/dev/null 2>&1 < /dev/null &
    for _ in $(seq 60); do up >/dev/null && { echo "Chrome on http://127.0.0.1:$PORT"; exit 0; }; sleep 0.5; done
    echo "Chrome started but port $PORT did not open (is networkingMode=mirrored set?)" >&2; exit 1 ;;
  stop)
    need_interop; P=$(profile); running=$(pids "$P")
    if [ -n "$running" ]; then
      powershell.exe -NoProfile -Command "$(echo $running | sed 's/ /,/g') | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }"
    fi
    for _ in $(seq 20); do [ -z "$(pids "$P")" ] && { echo "stopped ($(echo $running | wc -w) processes)"; exit 0; }; sleep 0.5; done
    echo "rts-chrome still running" >&2; exit 1 ;;
  status)
    v=$(up) || { echo "not running"; exit 1; }
    echo "$v" | grep -E '"Browser"'
    # another browser or tool may hold the port (the MCP's own Chrome): say so
    if command -v powershell.exe >/dev/null && [ -z "$(pids "$(profile)")" ]; then echo "(not rts-chrome)"; exit 1; fi ;;
esac
