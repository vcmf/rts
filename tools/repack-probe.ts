// The re-packing probe (docs/plans/active/s1c3-repack-gate.md): battalions of every shape, spawned dry along
// the stream at many headings, lose men one at a time from each company in turn (100 down to 40). Counts the
// losses after which a man stands newly on impassable ground, without the gate (the company's count cut
// directly) and with it (removeMan), and how often the gate had to fall back to `pressed`.
// Usage: node tools/repack-probe.ts [--events]   (--events prints each ungated case as JSON)
import fs from 'node:fs'
import { loadSimData, compileRuleset, buildTerrain, makeWorld, issue, advanceTick, wetBins, removeMan, M_FREE } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'

const data = loadSimData(new Uint8Array(fs.readFileSync(new URL('../data/formation-field.simdata', import.meta.url)))), cr = compileRuleset(napoleonic)
const terrain = buildTerrain(data, cr), C = cr.geo.companies, print = process.argv.includes('--events')
const HEADINGS = [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, 0.3, -1.2]
const run = (gated: boolean) => {
  let positions = 0, losses = 0, wet = 0, pressed = 0
  for (const shape of Object.keys(napoleonic.formations)) for (const heading of HEADINGS) for (let z = -160; z <= 160; z += 40) for (let x = 30; x <= 75; x += 0.25) {
    const w = makeWorld(data, cr, 1, false, terrain), i = w.free[w.meta[M_FREE] - 1]
    issue(w, { type: 'debug-spawn', side: 0, x, z, heading, shape, men: 100, fire: 'hold' }); advanceTick(w)
    if (!w.f.alive[i] || wetBins(w, i)) continue
    positions++
    for (let n = 0; n < 60; n++) {
      const c = n % C; if (w.f.men[i * C + c] <= 0) continue
      losses++
      if (gated) removeMan(w, i, c); else w.f.men[i * C + c]--
      if (wetBins(w, i)) { wet++; if (print && !gated) console.log(JSON.stringify({ shape, heading: +heading.toFixed(4), x, z, n })); break }
    }
    if (w.f.pressed[i] > 0) pressed++
  }
  return { positions, losses, wet, pressed }
}
const raw = run(false), gated = run(true)
console.log(`without the gate: ${raw.wet} of ${raw.positions} positions put a man on impassable ground (${raw.losses} losses)`)
console.log(`with the gate:    ${gated.wet} of ${gated.positions} positions; pressed ${gated.pressed}`)
process.exit(gated.wet === 0 ? 0 : 1)
