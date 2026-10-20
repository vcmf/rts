---
status: proposed
date: 2026-10-20
---

# 0046 WebGL2 is the minimum

## Context

The look page still carries WebGL1 fallbacks in `src/look`: 9 uses of `webgl1` (`mats.webgl1`), 8 `#ifdef WEBGL2`
blocks in the shaders (`macro.glsl`, `shore.glsl`), 10 `GL_OES_standard_derivatives` extension lines (WebGL1's
derivatives), and gates that name neither, such as the meadow's (`src/look/main.ts`, `engine.version >= 2`; decision
0041 keeps the brush pattern as its fallback "where the meadow cannot run (WebGL1, `?meadow=off`)"). Features switched
off or replaced without WebGL2 include the live roads (float textures), the combed meadow and the macro bake's arms;
the render scale's upscale (FSR 1's EASU, GLSL ES 3: its own PR, decision 0045 there) needs another guard. Each is a
second path to write, review and check, for players who are not there:

- WebGL2 ships in every current browser: Chrome and Firefox since 2017, Edge since 2020 (79, its first Chromium
  version), Safari since 15 (2021) (caniuse.com/webgl2).
- Surveys of visitors' browsers (web3dsurvey.com, 2026-10) put it at about 97.9 % overall: Android 99.4 %, iOS 98.9 %,
  macOS 97.1 %, and **Linux 87.8 %**, the largest gap (WebGL through OpenGL drivers, the most often blocklisted).
- It depends on the browser and the GPU's driver, not the OS as such. Chromium runs WebGL through ANGLE: on Direct3D 11
  on Windows (any GPU of about the last twelve years), Metal on the Mac, OpenGL or Vulkan on Linux.
- The owner (2026-10-20): the game will ship wrapped in Electron, so the browser is ours (its Chromium); only the
  player's GPU and driver vary. The min-spec (decision 0011, an RTX 3060 laptop) has WebGL2 with a wide margin. (No
  decision records the Electron shipping yet; this one rests on the owner's word and the min-spec, and holds for the
  browser too, below.)

## Decision

- **WebGL2 is the minimum** for the game and the look page, in Electron and in a browser.
- **Without it the page stops with a plain message** (no WebGL2: update the graphics driver), not a degraded look.
  This gate (the engine's version under 2) lands first, before or with the first code that is WebGL2 only.
- New code then writes for WebGL2 only (GLSL ES 3, float and half-float targets, `texelFetch`), with no WebGL1 path.
- The existing WebGL1 paths are removed in a later cleanup PR: the uses and blocks above, the extension lines, the
  meadow's gate, and the system doc's WebGL1 notes (`docs/systems/look.md`).
- **Amends decision 0041**: its brush pattern stays as the fallback for `?meadow=off` only; WebGL1 is no longer a case.

## Consequences

- Good: one path per feature: less code, fewer arms to check, no feature held back for WebGL1.
- Bad: the about 2 % of browsers without WebGL2 get the message instead of the game, about 12 % on Linux desktops: a
  Linux build (Electron's included) meets old or blocklisted OpenGL drivers more than any other. At the min-spec,
  none.
- WebGPU stays open for later (Electron's Chromium has it); not decided here.

## Alternatives considered

- Keep WebGL1 as a degraded fallback: the cost above, for no player at the min-spec.
- WebGPU as the minimum: every GLSL shader of the look would be ported, and its gain is on the CPU side (Babylon's
  docs: "GPU performance roughly the same", `docs/research/painterly-style-in-real-time.md`), an estimate, not
  measured here: not now.
