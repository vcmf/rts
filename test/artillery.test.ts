// Artillery (S1d-3, docs/plans/active/s1d3-artillery.md, docs/systems/artillery.md): who fires and how fast, the
// ball over the ground (grazes, burying in a steep rise, carrying over a crest), depth along its line, friendly
// fire, canister, and determinism. The cases stand on a levelled field, open and dry, with ridges raised where a
// test needs one; the golden plays the page's scenario on the real one.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { data, root, longIt } from './fx.ts'
import { levelled } from '../src/scenarios/s1c-firefight.ts'
import { s1dGuns } from '../src/scenarios/s1d-guns.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { buildTerrain, rebuildImpassable, compileRuleset, makeWorld, advanceTick, issue, record, play, serialize, deserialize, hashWorld, hex, menOf,
  shootRay, shootCone, blockGeometry, formationSlot, makeHandle, KIND_FORMATION, M_TICK, SHOT_RAY, SHOT_CONE, type Command, type Ruleset, type SimData, type World } from '../src/sim/index.ts'

const PI = Math.PI, NE = PI / 4, SW = -3 * PI / 4
// the shipped ruleset with the battery's numbers changed
const withGuns = (r: Partial<NonNullable<Ruleset['types']['battery']['artillery']>['ray']>, rest: Partial<NonNullable<Ruleset['types']['battery']['artillery']>> = {}): Ruleset => {
  const B = napoleonic.types.battery, A = B.artillery!
  return { ...napoleonic, types: { ...napoleonic.types, battery: { ...B, artillery: { ...A, ...rest, ray: { ...A.ray, ...r } } } } }
}
const aimed = withGuns({ spread: 0, short: 0 })   // no dispersion: one ball goes where it is aimed
// levelled ground; `ridge` raises a ridge across the diagonal at s metres along it (s = (x + z)/√2), `h` high,
// sloping `slope` (rise over run)
const ground = (ridge?: { s: number; h: number; slope: number }): SimData => {
  const d = levelled(data); if (!ridge) return d
  const H = d.height, h = new Float64Array(H.h.length)
  for (let j = 0; j < H.nz; j++) for (let i = 0; i < H.nx; i++) { const s = (H.x0 + i * H.cell + H.z0 + j * H.cell) / Math.SQRT2; h[j * H.nx + i] = Math.max(0, ridge.h - Math.abs(s - ridge.s) * ridge.slope) }
  return { ...d, height: { ...H, h } }
}

class W {
  w: World; dropped: string[] = []
  constructor(rs: Ruleset = aimed, d: SimData = ground(), seed = 1) {
    const cr = compileRuleset(rs), t = buildTerrain(d, cr); t.cls.fill(Object.keys(napoleonic.terrain).indexOf('open')); t.depth.fill(0); rebuildImpassable(t)
    this.w = makeWorld(d, cr, seed, true, t)
  }
  tick(): void { this.dropped.push(...advanceTick(this.w).dropped.map(d => d.reason)) }
  run(sec: number): void { for (let n = Math.round(sec * 20); n > 0; n--) this.tick() }
  order(c: Command): void { issue(this.w, c); this.tick() }
  spawn(side: number, x: number, z: number, heading: number, shape: string, unit?: string, fire = 'hold', men?: number): number {
    const slot = this.w.free[this.w.meta[1] - 1], U = this.w.cr.types[unit ? this.w.cr.typeIndex(unit) : 0]
    this.order({ type: 'debug-spawn', side, x, z, heading, shape, men: men ?? Math.min(400, U.slots), unit, fire })
    return makeHandle(KIND_FORMATION, slot, this.w.f.gen[slot])
  }
  i(h: number): number { return formationSlot(this.w, h) }
  men(h: number): number { return menOf(this.w, this.i(h)) }
  owed(h: number): number { const i = this.i(h), C = this.w.cr.maxC; let n = 0; for (let c = 0; c < C; c++) n += this.w.f.owed[i * C + c]; return n }
  fired(h: number): boolean { const i = this.i(h), C = this.w.cr.maxC; for (let c = 0; c < C; c++) if (this.w.f.volleyTick[i * C + c]) return true; return false }
}
const diag = (s: number): [number, number] => [s / Math.SQRT2, s / Math.SQRT2]   // a point s metres along the diagonal
// the centre of company c's block (a piece aims at a company's centre)
const centre = (s: W, h: number, c = 0): [number, number] => { const G = blockGeometry(s.w), k = s.i(h) * s.w.cr.maxC + c; return [G.cx[k], G.cz[k]] }

describe('who fires', () => {
  const pair = (shape: string) => { const s = new W(); const b = s.spawn(0, -100, -100, NE, shape, 'battery', 'at will'), t = s.spawn(1, 60, 60, SW, 'line'); return { s, b, t } }
  it('an unlimbered battery fires on an enemy in range; limbered, changing shape or holding fire it does not', () => {
    const a = pair('unlimbered'); a.s.run(40); expect(a.s.fired(a.b)).toBe(true); expect(a.s.men(a.t)).toBeLessThan(400)
    const l = pair('limbered'); l.s.run(40); expect(l.s.fired(l.b)).toBe(false)
    const c = pair('limbered'); c.s.order({ type: 'form', id: c.b, shape: 'unlimbered' }); c.s.run(40); expect(c.s.fired(c.b)).toBe(false)
    const h = pair('unlimbered'); h.s.order({ type: 'fire', id: h.b, mode: 'hold' }); h.s.run(40); expect(h.s.fired(h.b)).toBe(false)
  })
  it('does not fire through a friend across its line of fire', () => {
    const s = new W(), b = s.spawn(0, -100, -100, NE, 'unlimbered', 'battery', 'at will'), friend = s.spawn(0, -20, -20, NE, 'line'); s.spawn(1, 60, 60, SW, 'line')
    s.run(60); expect(s.men(friend)).toBe(400)
    const C = s.w.cr.maxC, i = s.i(b)   // the middle pieces, whose line the friend stands across, are silent
    expect([3, 4].map(c => s.w.f.volleyTick[i * C + c])).toEqual([0, 0])
  })
  it('reloads slower with its crew thinned: half the men, twice the time', () => {
    const one = (men: number) => { const s = new W(withGuns({ spread: 0, short: 0 }, { reloadJitter: 0 })), b = s.spawn(0, -100, -100, NE, 'unlimbered', 'battery', 'at will', men * 8); s.spawn(1, 60, 60, SW, 'line')
      const i = s.i(b); s.w.f.reload.fill(0, i * s.w.cr.maxC, i * s.w.cr.maxC + 8)
      s.run(1); return s.w.f.reload[i * s.w.cr.maxC] }
    expect(one(12)).toBeGreaterThan(23); expect(one(12)).toBeLessThan(25)
    expect(one(6) / one(12)).toBeCloseTo(2, 1)
  })
})

describe('the ball', () => {
  it('on level ground runs past its aim point (the first graze) and on', () => {
    const s = new W(withGuns({ spread: 0, short: 0, energy: 250 })), b = s.spawn(0, -150, -150, NE, 'unlimbered', 'battery')
    const [x, z] = shootRay(s.w, s.i(b), 3, ...diag(-100)), d = Math.hypot(x + 150, z + 150)
    expect(d).toBeGreaterThan(70); expect(d).toBeLessThan(250 - 50)   // its energy, less flight and its grazes
  })
  it('buries in a steep rise; carries over a gentle crest and the hollow behind it', () => {
    const shot = (slope: number, men: boolean) => {
      const s = new W(aimed, ground({ s: -40, h: 4, slope })), b = s.spawn(0, -150, -150, NE, 'unlimbered', 'battery')
      const t = men ? s.spawn(1, ...diag(30), SW, 'column') : 0
      const [x, z] = shootRay(s.w, s.i(b), 3, ...(men ? centre(s, t) : diag(20))); return { stop: (x + z) / Math.SQRT2, hit: men ? s.owed(t) : 0 }
    }
    expect(shot(0.6, false).stop).toBeLessThan(-40)   // buried in the ridge's face
    const over = shot(0.15, true), open = (() => { const s = new W(), b = s.spawn(0, -150, -150, NE, 'unlimbered', 'battery'), t = s.spawn(1, ...diag(30), SW, 'column'); shootRay(s.w, s.i(b), 3, ...centre(s, t)); return s.owed(t) })()
    expect(over.stop).toBeGreaterThan(30); expect(over.hit).toBe(0); expect(open).toBeGreaterThan(0)
  })
  it('a column end-on loses more to one ball than a line frontally; a line enfiladed more than frontally', () => {
    // one ball from the battery's middle piece at the battalion's first company's centre, over several seeds
    const one = (shape: string, heading: number, seed: number) => { const s = new W(aimed, ground(), seed), b = s.spawn(0, -150, -150, NE, 'unlimbered', 'battery'), t = s.spawn(1, 0, 0, heading, shape)
      shootRay(s.w, s.i(b), 3, ...centre(s, t)); return s.owed(t) }
    const sum = (shape: string, h: number) => [1, 2, 3, 4, 5, 6, 7, 8].reduce((a, seed) => a + one(shape, h, seed), 0)
    const column = sum('column', SW), line = sum('line', SW), enfiladed = sum('line', SW + PI / 2)
    expect(column).toBeGreaterThan(1.5 * line); expect(enfiladed).toBeGreaterThan(1.5 * line)
  })
  it('each man struck slows it: it stops sooner after a column than over open ground', () => {
    const go = (men: boolean) => { const s = new W(withGuns({ spread: 0, short: 0, energy: 300, kill: 1 })), b = s.spawn(0, -150, -150, NE, 'unlimbered', 'battery'); const t = men ? s.spawn(1, ...diag(-120), SW, 'column') : 0
      const [x, z] = shootRay(s.w, s.i(b), 3, ...(men ? centre(s, t) : diag(-120))); return Math.hypot(x + 150, z + 150) }
    expect(go(true)).toBeLessThan(go(false) - 20)
  })
  it('strikes friends on its line beyond the target', () => {
    const s = new W(withGuns({ spread: 0, short: 0, kill: 1 })), b = s.spawn(0, -150, -150, NE, 'unlimbered', 'battery')
    const t = s.spawn(1, ...diag(-100), SW, 'line'), friend = s.spawn(0, ...diag(-40), SW, 'column')
    shootRay(s.w, s.i(b), 3, ...centre(s, t, 3)); expect(s.owed(friend)).toBeGreaterThan(0)
  })
  it('a battery\'s pieces fire rays beyond the cone\'s range, canister inside it', () => {
    const kind = (far: number) => { const s = new W(), b = s.spawn(0, -far, -far, NE, 'unlimbered', 'battery', 'at will'); s.spawn(1, far, far, SW, 'line'); s.run(40)
      const i = s.i(b), C = s.w.cr.maxC; return [...s.w.f.shotKind.slice(i * C, i * C + 8)].filter(k => k).map(k => k)[0] }
    expect([kind(140), kind(50)]).toEqual([SHOT_RAY, SHOT_CONE])
  })
})

describe('canister', () => {
  it('strikes only companies inside the cone, and fewer with range', () => {
    // one piece's shots at a line's middle company; a second line beside it, in range but outside the cone
    const go = (far: number, seed: number) => { const s = new W(aimed, ground(), seed), b = s.spawn(0, -far, -far, NE, 'unlimbered', 'battery'), t = s.spawn(1, far, far, SW, 'line')
      const off = s.spawn(1, far + 60, far - 60, SW, 'line'); let hit = 0
      for (let n = 0; n < 10; n++) { s.w.f.owed.fill(0); shootCone(s.w, s.i(b), 3, s.i(t), ...centre(s, t, 2)); hit += s.owed(t); expect(s.owed(off)).toBe(0); s.tick() }
      return hit }
    expect(go(30, 1)).toBeGreaterThan(go(100, 1))
  })
})

describe('determinism', () => {
  it('the artillery step\'s visiting order does not change the result: two batteries on one column', () => {
    const go = (rev: boolean) => { const s = new W(napoleonic, ground(), 3); s.w.scratch.reverse = rev
      s.spawn(0, -140, -140, NE, 'unlimbered', 'battery', 'at will'); s.spawn(0, -60, -150, PI / 6, 'unlimbered', 'battery', 'at will'); s.spawn(1, 100, 100, SW, 'column'); s.run(120)
      return JSON.stringify([s.w.f.men, s.w.f.morale, s.w.f.shotX, s.w.f.shotZ].map(a => [...a])) }
    expect(go(true)).toBe(go(false))
  })
  const goldenFile = path.join(root, 'test', 'golden', 's1d-guns.json'), TICKS = 4000
  longIt('the page\'s guns give the committed golden hashes; the replay and a save round trip reproduce them', () => {
    const cr = compileRuleset(napoleonic), h = (slot: number) => makeHandle(KIND_FORMATION, slot, 0)
    const script = (w: World, ext: (c: Command) => void) => { if (w.meta[M_TICK] === 1) ext({ type: 'fire', id: h(0), mode: 'at will' }) }
    const run = record(data, cr, s1dGuns, 9, TICKS, script)
    const hashes = run.hashes.map(p => [p.tick, hex(p.hash)])
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(goldenFile, JSON.stringify({ dataVersion: hex(data.version), ruleset: hex(cr.hash), ticks: TICKS, hashes }) + '\n')
    const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'))
    expect([golden.dataVersion, golden.ruleset]).toEqual([hex(data.version), hex(cr.hash)])
    expect(hashes).toEqual(golden.hashes)
    expect(play(run.replay, data, cr, s1dGuns, run.hashes)).toBeNull()
    const w = makeWorld(data, cr, 9); s1dGuns.setup(w); while (w.meta[M_TICK] < 2000) { script(w, c => issue(w, c)); advanceTick(w) }
    expect(menOf(w, 1)).toBeLessThan(400)   // the guns struck the column
    const w2 = deserialize(serialize(w), data, cr); while (w.meta[M_TICK] < 2600) { advanceTick(w); advanceTick(w2) }
    expect(hex(hashWorld(w2))).toBe(hex(hashWorld(w)))
  })
})
