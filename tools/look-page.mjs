// Driving the look page (or the prototype) headless for the look tools: tools/golden.mjs, tools/guard.mjs and the L2
// checks (docs/plans/active/l2-detail.md). Steps for tools/shot.mjs, and the run itself.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// the page is built (it may build after an await: the look page fetches its data), the UI hidden, the page's own
// loop stopped (each view renders exactly the frames asked for, and a slow frame cannot race the capture), and the
// clock frozen (or clouds and water move between two renders)
export const prepSteps = () => [
  ['wait', 1000],
  ['eval', '(async () => { for (let i = 0; i < 1200 && !window.__proto; i++) await new Promise(r => setTimeout(r, 100)); if (!window.__proto) throw new Error("the page never set window.__proto (120 s)"); return "page built" })()'],
  ['wait', 2000],
  // the render scale pinned to 1 (the page's Auto lowers it at the widest zoom: docs/plans/done/dynamic-scale.md)
  ['eval', 'for (const id of ["panel", "fps", "drop"]) { const e = document.getElementById(id); if (e) e.style.display = "none" } __proto.scene.getEngine().stopRenderLoop(); __proto.S.res = 1; "ui hidden, loop stopped, scale 1"'],
  ['eval', '__proto.scene.render(); __proto.scene.render(); if (__proto.S.t !== 0) throw new Error("the page ignores ?frozen (S.t = " + __proto.S.t + ")"); "frozen"'],
]

// a camera [name, alpha, beta, radius, target, season], checked against the page's limits (a clamped view would be
// rendered somewhere else, silently), then every material and render target made ready and 3 frames rendered; after
// them the camera's radius must still be the one asked for (the closest zooms are held out over high ground,
// decision 0051: a view there would measure another radius, so it fails and its target must move)
export const viewStep = ([name, a, b, r, t, season]) => ['eval', `(async () => { const c = __proto.camera, lim = (v, lo, hi) => (lo == null || v >= lo - 1e-9) && (hi == null || v <= hi + 1e-9)
  const t = [${t}], P = __proto.play
  if (!lim(${a}, c.lowerAlphaLimit, c.upperAlphaLimit) || !lim(${b}, c.lowerBetaLimit, c.upperBetaLimit) || !lim(${r}, c.lowerRadiusLimit, c.upperRadiusLimit)
    || typeof P !== "number" || Math.abs(t[0]) > P || Math.abs(t[2]) > P)
    throw new Error("camera ${name} is outside the page's camera limits or play area")
  c.alpha = ${a}; c.beta = ${b}; c.radius = ${r}; c.target.set(...t); __proto.S.season = ${season}
  await Promise.race([__proto.scene.whenReadyAsync(true), new Promise((_, no) => setTimeout(() => no(new Error("scene never ready at camera ${name} (120 s)")), 120000))])
  for (let i = 0; i < 3; i++) __proto.scene.render()
  if (Math.abs(c.radius - ${r}) > 1e-6) throw new Error("camera ${name}: the zoom was held out to " + c.radius.toFixed(2) + " m over high ground, not ${r} m (decision 0051): move its target")
  return "${name}" })()`]

// runs tools/shot.mjs on the page (with ?frozen unless frozen is false, and with ?dof=0 unless the URL sets ?dof: the
// checks measure the paint, decision 0024); env adds to the environment and wins over it; returns its stdout; throws
// with the full output on a failure
export function shoot(url, dir, steps, w, h, { frozen = true, env = {} } = {}) {
  const u = new URL(url); if (frozen) u.searchParams.set('frozen', ''); if (!u.searchParams.has('dof')) u.searchParams.set('dof', '0')
  const r = spawnSync('node', [path.join(ROOT, 'tools/shot.mjs'), u.href, dir, String(w), String(h), JSON.stringify(steps)],
    { encoding: 'utf8', maxBuffer: 64 * 2 ** 20, env: { SHOT_TIMEOUT_S: '300', SHOT_LOAD_S: '300', ...process.env, ...env } })
  if (r.status !== 0) throw new Error(`rendering ${url} failed (shot.mjs exit ${r.status}), full output:\n${r.stdout}${r.stderr}`)
  return r.stdout
}
