---
status: done
last_reviewed: 2026-10-24
---

# Plan: the page tools on a running Chrome, Windows Chrome from WSL, the DevTools MCP for exploring

Decision 0060 (`docs/decisions/0060-browser-checks-are-scripts.md`). The plan grew in review: it first set up the MCP
server for everyone and left `tools/shot.mjs` alone; it ended with the checks attaching to a running Chrome and the
MCP server opt-in.

## Problem

An agent can check a page only through scripts (`tools/shot.mjs` and the checks built on it), which launch their own
Chrome and default to the Mac's. It cannot open the game, play it, look at it and read its console as it goes. And on
a Windows machine working in WSL, Chrome inside WSL renders WebGL in software (SwiftShader) or through Mesa's
Direct3D 12 translation, so its frames say nothing about a player's: Windows Chrome renders on the GPU through
Direct3D 11 (ANGLE), measured on the owner's RTX 3080.

## Scope

- `tools/shot.mjs` attaches to a running Chrome when `SHOT_CDP` names it (a fresh browser context per run), and checks
  that browser's backend (`SHOT_ANGLE`) and flags (`SHOT_CHROME_ARGS`) against what the run asks for. What it tells
  the caller to start names `tools/win-chrome.sh` only in WSL (`tools/attach.ts`), the Chrome flags elsewhere.
- `tools/win-chrome.sh start|stop|status [--headed] [--angle swiftshader|d3d11]`: Windows Chrome from WSL, headless and
  in SwiftShader by default (as `tools/shot.mjs`), its DevTools port on 127.0.0.1 and its own profile, a stop that ends
  only that Chrome; the machine-wide Chrome, else the per-user one (`WIN_CHROME` overrides).
- The `chrome-devtools` MCP server, opt-in: one `claude mcp add` line in `AGENTS.md` (Commands), pinned to a version
  out for a month (1.10.1), its own Chrome with a temporary profile (`--isolated`). No `.mcp.json`.
- The load wait in `tools/shot.mjs` counts the load of the document the navigation commits, or of one the page
  navigates to before its own load (`tools/page-load.ts`); a navigation error fails the run at once.

Out of scope: the Linux libraries for Chrome inside WSL; changing `.nvmrc`.

## Approach

- The port is never on the network: WSL's mirrored networking (`networkingMode=mirrored`) shares localhost with
  Windows, so Chrome keeps its default 127.0.0.1 and the dev server in WSL is reachable from it.
- The stop finds Chrome's processes by its profile's name through CIM: `Get-Process` in Windows PowerShell 5.1 has no
  command line, and a filter on it matches nothing.
- Windows knowledge sits behind a WSL check (`WSL_DISTRO_NAME`): the Mac's runs never take those paths.

## Acceptance

- `tools/win-chrome.sh start` opens the port; `status` names the browser; with `--angle d3d11` a WebGL2 context's
  renderer is the GPU (`ANGLE (NVIDIA …, D3D11)`); `stop` leaves no Chrome with the profile and the port closed.
- Default-mode `tools/shot.mjs` on the Mac as main's: the built app page and the look page (`?frozen&dof=0`), in
  SwiftShader and `SHOT_ANGLE=metal`, the same exit codes, the SwiftShader screenshots byte-identical.
- `test/page-load.test.ts`: a page that replaces itself before its load event loads and exits 0 (it timed out before);
  a missing page exits 1 with `net::ERR_FILE_NOT_FOUND`. `test/attach.test.ts`: the hints and the WSL file URLs.
- `npm test`, `format:check`, `node tools/check-docs.mjs` and the build pass.

## Review rounds

- **Round 1** (`/code-review high`, the first version): no severe issue, ten moderate or light. Fixed in
  `tools/win-chrome.sh`: Windows is needed only by `start` and `stop`; strict arguments; `start` refuses a port held
  by another browser and a profile already open without the port; the profile matched as the whole `--user-data-dir`
  value; `stop` waits until the processes and the port are gone and fails otherwise; Chrome detached from the shell.
- **Later round** (after the attach mode): one severe issue, a 3.9 MB image from another PR brought in by a merge,
  removed; fixed too: the plan restored here; the load wait on a page that navigates itself; Windows hints only in
  WSL; `tools/win-chrome.sh` headless and SwiftShader by default, `--angle`, the per-user Chrome; the MCP server
  opt-in instead of `.mcp.json`.
