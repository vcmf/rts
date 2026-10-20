---
status: proposed
date: 2026-10-20
---

# 0046 WebGL2 is the minimum

## Context

The look page still carries WebGL1 fallbacks: 26 places in `src/look` (`mats.webgl1`, `WEBGL2` in the shaders) where
a feature is switched off or replaced without WebGL2. The live roads' shader (float textures) is one; the macro
bake's arms are another; the render scale's upscale (decision 0045, FSR 1's EASU, GLSL ES 3) and later work add more.
Each is a second path to write, review and check, for players who are not there:

- WebGL2 ships in every current browser (Chrome and Edge since 2017, Firefox since 2017, Safari since 15, 2021).
  Public surveys of visitors' browsers (web3dsurvey.com) put it at about 97-99 % of devices; the rest are very old
  phones, old iOS and blocklisted drivers.
- It depends on the browser and the GPU's driver, not the OS. Chromium runs WebGL through ANGLE: on Direct3D 11 on
  Windows (any GPU of about the last twelve years), Metal on the Mac, OpenGL or Vulkan on Linux.
- The owner (2026-10-20): the game will ship wrapped in Electron, so the browser is ours (its Chromium); only the
  player's GPU and driver vary. The min-spec (decision 0011, an RTX 3060 laptop) has WebGL2 with a wide margin.

## Decision

- **WebGL2 is the minimum** for the game and the look page. Without it the page stops with a plain message (no
  WebGL2: update the graphics driver), not a degraded look.
- New code writes for WebGL2 only (GLSL ES 3 features, float and half-float targets, `texelFetch`) with no WebGL1
  path.
- The existing WebGL1 paths are removed in a later cleanup PR (the code and its checks' WebGL1 arms), not in passing.

## Consequences

- Good: one path per feature: less code, fewer arms to check, no feature held back for WebGL1 (the render scale's
  upscale needed a guard).
- Bad: the about 1-3 % of browsers without WebGL2 get a message instead of the game; on the web (outside Electron) the
  very old devices among them could not play. Under Electron with the min-spec, none.
- WebGPU stays open for later (Electron's Chromium has it); not decided here.

## Alternatives considered

- Keep WebGL1 as a degraded fallback: the cost above, for no player at the min-spec.
- WebGPU as the minimum: Babylon's WebGPU engine is usable, but every GLSL shader of the look would be ported, and
  measured gains on the Mac are mixed (the frame headroom research, PR #122): not now.
