#!/usr/bin/env bash
# Windows Chrome for browser checks from WSL: it renders on the machine's GPU through Direct3D, as a player's Chrome
# does, where Chrome inside WSL falls back to software GL. Needs WSL's mirrored networking (`networkingMode=mirrored`
# in %USERPROFILE%\.wslconfig), so the DevTools port and the dev server share localhost; the port listens on
# 127.0.0.1 only. The page tools attach with SHOT_CDP=http://127.0.0.1:9222 (tools/shot.mjs), the chrome-devtools MCP
# with `--browserUrl http://127.0.0.1:9222` (AGENTS.md, Commands; decision 0047).
# Usage: tools/win-chrome.sh [start|stop|status] [--headless] [-- <Chrome flags>]   (PORT=9222, WIN_CHROME by default)
# Chrome renders on the GPU through Direct3D 11 by default. tools/shot.mjs checks the backend a run asks for against
# the renderer the browser reports, and SwiftShader is its default (the goldens' and checks'): those want
# `start -- --use-angle=swiftshader`; SHOT_ANGLE=d3d11 runs on the GPU as started. Flags a run asks for (SHOT_CHROME_ARGS)
# must be on the command line: the look bench on the GPU wants `start --headless -- --disable-gpu-vsync
# --disable-frame-rate-limit` and `--gpu d3d11`. Flags change only with a stop and a start.
set -euo pipefail
PORT=${PORT:-9222}
CHROME=${WIN_CHROME:-"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"}   # WIN_CHROME: another install
usage() { echo "usage: tools/win-chrome.sh [start|stop|status] [--headless] [-- <Chrome flags>]" >&2; exit 2; }

cmd=start headless= flags=()
while [ $# -gt 0 ]; do
  case "$1" in
    start|stop|status) cmd=$1 ;;
    --headless) headless=--headless=new ;;
    --) shift; flags=("$@"); break ;;
    *) usage ;;
  esac
  shift
done
{ [ -n "$headless" ] || [ ${#flags[@]} -gt 0 ]; } && [ "$cmd" != start ] && usage

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
      # its flags are those of its launch: asking for others would silently get these
      { [ -z "$headless" ] && [ ${#flags[@]} -eq 0 ]; } || { echo "Chrome already on port $PORT with its own flags: tools/win-chrome.sh stop first" >&2; exit 1; }
      echo "Chrome already on http://127.0.0.1:$PORT"; exit 0
    fi
    # Chrome hands a second launch on an open profile to the running one, which keeps its own flags: no port would open
    [ -z "$running" ] || { echo "rts-chrome is open without port $PORT: run tools/win-chrome.sh stop first" >&2; exit 1; }
    # detached, so closing the shell that started it does not take the interop process (and Chrome's lifetime) with it;
    # --enable-automation lets a tool read the flags back (Browser.getBrowserCommandLine); the GPU and SwiftShader flags
    # are the ones tools/shot.mjs launches with; a window behind others (headed) keeps rendering at full rate
    setsid nohup "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$P" --no-first-run --no-default-browser-check \
      --enable-automation --ignore-gpu-blocklist --enable-unsafe-swiftshader --disable-backgrounding-occluded-windows \
      --disable-renderer-backgrounding --disable-background-timer-throttling $headless "${flags[@]}" about:blank \
      >/dev/null 2>&1 < /dev/null &
    for _ in $(seq 20); do up >/dev/null && { echo "Chrome on http://127.0.0.1:$PORT"; exit 0; }; sleep 0.5; done
    echo "Chrome started but port $PORT did not open (is networkingMode=mirrored set?)" >&2; exit 1 ;;
  stop)
    need_windows; P=$(profile); running=$(pids "$P")
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
