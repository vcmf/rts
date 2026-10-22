---
status: accepted
date: 2026-10-22
---

# 0047 Browser checks are scripts over CDP; the DevTools MCP is for exploring

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

We will also keep the `chrome-devtools` MCP server in `.mcp.json`, pinned, for exploring: playing the game to find
what to check, following a bug from what the screen shows, reading a performance trace. What exploring finds becomes
a script before it counts as checked. Nothing depends on the server.

## Consequences

- Good: one set of checks everywhere; on Windows they run on the GPU a player's Chrome uses.
- Good: an agent can look at the game and play it without writing a script for every step.
- Bad: an attached browser's flags were fixed at its launch, so a tool cannot set them. `tools/shot.mjs` checks the
  backend a run asks for (`SHOT_ANGLE`, SwiftShader by default as when it launches) against the renderer the browser
  reports, and the flags it asks for (`SHOT_CHROME_ARGS`) against its command line (Chrome started with
  `--enable-automation`), and fails on a mismatch rather than measure something else.
- Bad: two ways to drive a browser to know about; the MCP server is one more pinned version to bump.

## Alternatives considered

- **The MCP server as the way to check:** each step is a tool call whose result an agent reads and judges, so a check
  is neither repeatable nor reviewable as a script is, and CI cannot run it.
- **Only scripts, no MCP server:** exploring then means writing and rerunning a script for every look at the page;
  the server costs a few lines of configuration and nothing to those who do not use it.
- **Chrome inside WSL:** software rendering, and missing system libraries (`libnss3` and others) to install first.
- **Launching Windows Chrome from `tools/shot.mjs`:** its profile and the DevTools port file would have to live on the
  Windows side, and the Mac's launch path would split in two; attaching keeps one path for both.
