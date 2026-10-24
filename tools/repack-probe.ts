// The re-packing probe (docs/plans/active/s1c3-repack-gate.md): battalions of every shape, spawned dry along
// the stream at many headings, lose men one at a time from each company in turn (100 down to 40). It runs on
// the S1a block (4 companies of 9 files, 100 men), the ruleset test/repack.test.ts replays its events on
// (`small`, test/fx.ts); the shipped block is covered by test/scale.test.ts. Counts the
// losses after which a man stands newly on impassable ground, without the gate (the company's count cut
// directly) and with it (removeMan), and how often the gate had to fall back to `pressed`.
// Usage: node tools/repack-probe.ts [--events]   (--events prints each ungated case as JSON)
import fs from 'node:fs'
import {
  loadSimData,
  compileRuleset,
  buildTerrain,
  makeWorld,
  issue,
  advanceTick,
  anyWet,
  removeMan,
  M_FREE,
  withBlock,
} from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'

// the S1a block (test/fx.ts, small)
const small = withBlock({ ...napoleonic, name: `${napoleonic.name}, the S1a block` }, 'infantry', {
  companies: 4,
  files: 9,
  bins: 3,
})

const data = loadSimData(new Uint8Array(fs.readFileSync(new URL('../data/formation-field.simdata', import.meta.url))))
const cr = compileRuleset(small)
const terrain = buildTerrain(data, cr)
const C = cr.types[0].C
const CS = cr.maxC
const print = process.argv.includes('--events')
const HEADINGS = [
  0,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI,
  Math.PI / 4,
  -Math.PI / 4,
  (3 * Math.PI) / 4,
  (-3 * Math.PI) / 4,
  0.3,
  -1.2,
]
const run = (gated: boolean) => {
  let positions = 0
  let losses = 0
  let wet = 0
  let pressed = 0
  for (const shape of Object.keys(napoleonic.types.infantry.formations)) {
    for (const heading of HEADINGS) {
      for (let z = -160; z <= 160; z += 40) {
        for (let x = 30; x <= 75; x += 0.25) {
          const w = makeWorld(data, cr, 1, false, terrain)
          const i = w.free[w.meta[M_FREE] - 1]
          issue(w, { type: 'debug-spawn', side: 0, x, z, heading, shape, men: 100, fire: 'hold' })
          advanceTick(w)
          if (!w.f.alive[i] || anyWet(w, i)) continue
          positions++
          for (let n = 0; n < 60; n++) {
            const c = n % C
            if (w.f.men[i * CS + c] <= 0) continue
            losses++
            if (gated) removeMan(w, i, c)
            else w.f.men[i * CS + c]--
            if (anyWet(w, i)) {
              wet++
              if (print && !gated) console.log(JSON.stringify({ shape, heading: +heading.toFixed(4), x, z, n }))
              break
            }
          }
          if (w.f.pressed[i] > 0) pressed++
        }
      }
    }
  }
  return { positions, losses, wet, pressed }
}
const raw = run(false)
const gated = run(true)
console.log(
  `without the gate: ${raw.wet} of ${raw.positions} positions put a man on impassable ground (${raw.losses} losses)`,
)
console.log(`with the gate:    ${gated.wet} of ${gated.positions} positions; pressed ${gated.pressed}`)
process.exit(gated.wet === 0 ? 0 : 1)
