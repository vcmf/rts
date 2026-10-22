---
status: active
last_reviewed: 2026-10-22
---

# Plan: driving the page in Chrome from Claude Code, and Windows Chrome from WSL

## Problem

An agent can check a page only through scripts (`tools/shot.mjs` and the checks built on it), which launch their own
Chrome and default to the Mac's. It cannot open the game, play it, look at it and read its console as it goes. And on
a Windows machine working in WSL, Chrome inside WSL renders WebGL in software (SwiftShader) or through Mesa's
Direct3D 12 translation, so its frames say nothing about a player's: Windows Chrome renders on the GPU through
Direct3D 11 (ANGLE), measured on the owner's RTX 3080.

## Scope

- The `chrome-devtools` MCP server (`chrome-devtools-mcp`) for every contributor, in `.mcp.json`, pinned to a version
  out for a month (1.10.1), launching its own Chrome with a temporary profile (`--isolated`).
- `tools/win-chrome.sh start|stop|status [--headless]`: Windows Chrome from WSL with its DevTools port on 127.0.0.1
  and its own profile, and a stop that ends only that Chrome.
- One entry in `AGENTS.md` (Commands): the server, the script, the per-user override that attaches the server to
  Windows Chrome in WSL.

Out of scope: an option in `tools/shot.mjs` (and the checks built on it) to attach to a running Chrome; the Linux
libraries for Chrome inside WSL; changing `.nvmrc`.

## Approach

- The project's `.mcp.json` is what works everywhere without setup (Mac, Windows, Linux). WSL is the exception, and
  its fix is per machine: a local-scope server of the same name, which takes precedence over the project's.
- The port is never on the network: WSL's mirrored networking (`networkingMode=mirrored`) shares localhost with
  Windows, so Chrome keeps its default 127.0.0.1 and the dev server in WSL is reachable from it.
- The stop finds Chrome's processes by its profile's name through CIM: `Get-Process` in Windows PowerShell 5.1 has no
  command line, and a filter on it matches nothing.

The script and the configuration were written before this plan, while finding out what works on the owner's machine;
the plan records what they are and how they are accepted.

## Acceptance

- `tools/win-chrome.sh start --headless` opens the port; `status` names the browser; a WebGL2 context's renderer is
  the GPU (`ANGLE (NVIDIA …, D3D11)`), not SwiftShader; `stop` leaves no Chrome with the profile and the port closed.
- With the local override, the MCP server's tools reach that Chrome: they open a page served from WSL, take a
  screenshot and list its console messages.
- `node tools/check-docs.mjs` passes; `npm test` as before (the cost tests are measured locally against Mac budgets).

## Review rounds

- **Round 1** (`/code-review high`): no severe issue, ten moderate or light. Fixed in `tools/win-chrome.sh`: Windows
  is needed only by `start` and `stop`; strict arguments; `start` refuses a port held by another browser and a profile
  already open without the port; the profile matched as the whole `--user-data-dir` value; `stop` waits until the
  processes and the port are gone and fails otherwise; Chrome detached from the shell. `AGENTS.md` points at
  `.mcp.json` for the version instead of repeating it. Left: the plan written after the code (said above); the project
  server in WSL without the override (`AGENTS.md` says what to do). No severe issue, so the review stops.
