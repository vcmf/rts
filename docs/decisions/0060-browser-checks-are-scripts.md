---
status: accepted
date: 2026-10-22
---

# 0060 Browser checks are scripts over CDP; the DevTools MCP is for exploring

## Context

Agents check pages in Chrome. The repository's tools (`tools/shot.mjs`, and everything built on it: the goldens,
the guard, the look bench, the page checks) drive Chrome over the DevTools protocol (CDP) from scripts. On the Mac
that needs nothing: `tools/shot.mjs` launches Chrome, which renders on the GPU through Metal when asked.

On a Windows machine working in WSL, Chrome inside WSL renders WebGL in software (SwiftShader) or through Mesa's
Direct3D 12 translation, neither of which is a player's Chrome. Windows Chrome renders on the GPU through Direct3D 11
(ANGLE: measured on the owner's RTX 3080), and with WSL's mirrored networking its DevTools port and the dev server
share localhost. `tools/shot.mjs` could not use it: it launches its own browser, with a profile in WSL that Windows Chrome
cannot use.

The `chrome-devtools` MCP server gives an agent the same browser as tools it calls one at a time: open a page, click,
type, take a screenshot, read the console and the network, record a performance trace.

## Decision

We will check pages with scripts over CDP. `tools/shot.mjs` attaches to a running Chrome when `SHOT_CDP` names it, so every
tool runs against Windows Chrome from WSL (`tools/win-chrome.sh`) as it runs against the Mac's. A check is a committed
script with an exit code, the same on every machine and in review.

The `chrome-devtools` MCP server is for exploring, and opt-in: playing the game to find what to check, following a
bug from what the screen shows, reading a performance trace. Who wants it adds it for themselves with the pinned
one-liner in `AGENTS.md` (Commands; `--isolated`, its own Chrome and a temporary profile); the repository commits no
`.mcp.json`, so no session starts a server it did not ask for. What exploring finds becomes a script before it counts
as checked. Nothing depends on the server.

What `tools/shot.mjs` says about a browser to start names `tools/win-chrome.sh` only in WSL (`tools/attach.ts`), the
Chrome flags themselves elsewhere: the Mac's runs never take the Windows paths. `tools/win-chrome.sh` starts Chrome
headless and in SwiftShader by default, as `tools/shot.mjs` launches its own. `SHOT_CDP` is set per run: exported, it
makes every tool attach, and agents sharing one browser skew each other's benches.

## Consequences

- Good: one set of checks everywhere; on Windows they run on the GPU a player's Chrome uses.
- Good: an agent can look at the game and play it without writing a script for every step.
- Bad: an attached browser's flags were fixed at its launch, so a tool cannot set them. `tools/shot.mjs` checks the
  backend a run asks for (`SHOT_ANGLE`, SwiftShader by default as when it launches) against the renderer the browser
  reports, and the flags it asks for (`SHOT_CHROME_ARGS`) against its command line (Chrome started with
  `--enable-automation`), and fails on a mismatch rather than measure something else.
- Bad: two ways to drive a browser to know about; the MCP server's pinned version in `AGENTS.md` to bump by hand.

## Alternatives considered

- **The MCP server as the way to check:** each step is a tool call whose result an agent reads and judges, so a check
  is neither repeatable nor reviewable as a script is, and CI cannot run it.
- **Only scripts, no MCP server:** exploring then means writing and rerunning a script for every look at the page;
  the server costs one line in `AGENTS.md` and nothing to those who do not add it.
- **The MCP server in a committed `.mcp.json`:** every session in the repository would be offered a server, and a
  Chrome, it may not want; opting in costs one command.
- **Chrome inside WSL:** software rendering, and missing system libraries (`libnss3` and others) to install first.
- **Launching Windows Chrome from `tools/shot.mjs`:** its profile and the DevTools port file would have to live on the
  Windows side, and the Mac's launch path would split in two; attaching keeps one path for both.
