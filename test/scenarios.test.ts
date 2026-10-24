// The scenarios the page offers (src/scenarios/page.ts), each on its map (src/scenarios/maps.ts): every one
// sets up with nothing dropped, on the data version it was placed for; a plan names units its scenario
// spawns, on the right sides; the page's tables agree with each other. A scenario broken by a ruleset or map
// change fails here, not on the page.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  makeWorld,
  advanceTick,
  loadSimData,
  compileRuleset,
  attachScenario,
  unitHandle,
  formationSlot,
  type SimData,
} from '../src/sim/index.ts'
import { PAGE_SCENARIOS, PAGE_VIEWS, DEFAULT_SCENARIO } from '../src/scenarios/page.ts'
import { MAP_VERSIONS, DEFAULT_MAP } from '../src/scenarios/maps.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { root } from './fx.ts'

const cr = compileRuleset(napoleonic)
const maps: Record<string, SimData> = {}
const mapOf = (name = DEFAULT_MAP): SimData =>
  (maps[name] ??= loadSimData(
    new Uint8Array(fs.readFileSync(path.join(root, 'data', `${name}.simdata`))),
    MAP_VERSIONS[name],
  ))

describe('the page scenarios', () => {
  it('the default and every view name a page scenario; every scenario names a map the page knows', () => {
    expect(PAGE_SCENARIOS[DEFAULT_SCENARIO]).toBeDefined()
    for (const k of Object.keys(PAGE_VIEWS)) expect(PAGE_SCENARIOS[k], k).toBeDefined()
    for (const [k, s] of Object.entries(PAGE_SCENARIOS)) {
      expect(s.name, k).toBe(k)
      expect(MAP_VERSIONS[s.map ?? DEFAULT_MAP], `${k}: map ${s.map}`).toBeDefined()
    }
  })
  it('every committed map loads at the version its scenarios were placed for', () => {
    for (const name of Object.keys(MAP_VERSIONS)) expect(mapOf(name).version, name).toBe(MAP_VERSIONS[name])
  })
  for (const [k, s] of Object.entries(PAGE_SCENARIOS)) {
    it(`${k}: sets up with nothing dropped, every formation spawned`, () => {
      const w = makeWorld(mapOf(s.map), cr, 1)
      attachScenario(w, s)
      s.setup(w)
      const spawns = w.pending.filter(p => p.cmd.type === 'debug-spawn').length
      const r = advanceTick(w)
      expect(r.dropped).toEqual([])
      expect(w.f.alive.reduce((n, a) => n + a, 0)).toBe(spawns)
      expect(spawns).toBeGreaterThan(0)
      // a plan names units this scenario spawned, and a target on the other side
      for (const p of s.plan ?? []) {
        const i = formationSlot(w, unitHandle(p.unit))
        expect(i, `plan step at ${p.at} s: unit ${p.unit}`).toBeGreaterThanOrEqual(0)
        if (s.player !== undefined) expect(w.f.side[i], `plan step at ${p.at} s`).not.toBe(s.player)
        const target = 'target' in p.cmd ? p.cmd.target : undefined
        if (target !== undefined && target >= 0) {
          const j = formationSlot(w, unitHandle(target))
          expect(j, `plan step at ${p.at} s: target ${target}`).toBeGreaterThanOrEqual(0)
          expect(w.f.side[j]).not.toBe(w.f.side[i])
        }
      }
    })
  }
})
