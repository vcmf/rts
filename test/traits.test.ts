// The traits table's fields beyond hits, melee and brace (docs/plans/active/formations.md § C1): each read through
// src/sim/traits.ts and doing what docs/proposals/formations.md § 5a says, tried on ruleset variants (the shipped
// values are neutral until C2).
import { describe, it, expect } from 'vitest'
import { Sim, OPEN_DATA, openBattlefield } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { blockGeometry, buildFaces, pointWeights, moraleShare, type Ruleset, type TraitsDef } from '../src/sim/index.ts'
import { braceOf, movesOf } from '../src/sim/traits.ts'
import { applyNow } from '../src/sim/commands.ts'
import { FULL } from '../src/scenarios/sizes.ts'

const FIELD = openBattlefield()
const D = Math.PI / 180
const inf = napoleonic.types.infantry
// the shipped ruleset with infantry shape n's traits set over its own
const withTraits = (n: string, t: TraitsDef): Ruleset => ({
  ...napoleonic,
  types: {
    ...napoleonic.types,
    infantry: {
      ...inf,
      formations: { ...inf.formations, [n]: { ...inf.formations[n], traits: { ...inf.formations[n].traits, ...t } } },
    },
  },
})
const sim = (rs: Ruleset = napoleonic) => new Sim(1, rs, FIELD, OPEN_DATA)

describe('moves', () => {
  const still = withTraits('square', { moves: false })
  it('refuses a move or a retreat to a shape that cannot move, formed or forming; takes one forming out of it', () => {
    const s = sim(still)
    const sq = s.spawn(0, 0, 0, 'square', FULL.infantry)
    const why = (c: Parameters<Sim['cmd']>[0]) => {
      const n = s.dropped.length
      s.order(c)
      return s.dropped.slice(n).map(d => d.reason)
    }
    expect(why({ type: 'move', id: sq, append: false, points: [[0, 100]] })).toEqual(['cannot move in this shape'])
    expect(why({ type: 'retire', id: sq, metres: 50 })).toEqual(['cannot move in this shape'])
    expect(why({ type: 'wheel', id: sq, angle: 0.5 })).toEqual(['cannot move in this shape'])
    expect(why({ type: 'face', id: sq })).toEqual([])
    s.order({ type: 'form', id: sq, shape: 'line' })
    expect(movesOf(s.w, s.slot(sq))).toBe(false) // it still stands in the square, but forms line
    expect(why({ type: 'move', id: sq, append: true, points: [[0, 100]] })).toEqual([])
    const ln = s.spawn(200, 0, 0, 'line', FULL.infantry)
    s.order({ type: 'form', id: ln, shape: 'square' })
    expect(why({ type: 'move', id: ln, append: true, points: [[200, 100]] })).toEqual(['cannot move in this shape'])
  })
  it('reads the queue: a move appended behind a square still to form is refused, behind a line still to form taken', () => {
    const s = sim(still)
    const ln = s.spawn(0, 0, 0, 'line', FULL.infantry)
    const sq = s.spawn(200, 0, 0, 'square', FULL.infantry)
    // both in one tick, so the form is still queued when the move comes
    s.cmd({ type: 'form', id: ln, shape: 'square' })
    s.cmd({ type: 'move', id: ln, append: true, points: [[0, 100]] })
    s.cmd({ type: 'form', id: sq, shape: 'line' })
    s.cmd({ type: 'move', id: sq, append: true, points: [[200, 100]] })
    const n = s.dropped.length
    s.tick()
    expect(s.dropped.slice(n).map(d => d.reason)).toEqual(['cannot move in this shape'])
  })
  it("keeps a scenario's plan's move to a square, for the shape it forms next", () => {
    const s = sim(still)
    const h = s.spawn(0, 0, 0, 'square', FULL.infantry)
    expect(applyNow(s.w, { type: 'move', id: h, append: false, points: [[0, 100]] })).toBe('')
    const z = s.z(h)
    s.advance(5)
    expect(s.z(h)).toBe(z)
    expect(s.orders(h)).toBe(1)
  })
  it('a router runs, whatever its shape', () => {
    const s = sim(still)
    const h = s.spawn(0, 0, 0, 'square', FULL.infantry)
    const z = s.z(h)
    s.w.f.bar[s.slot(h)] = -100
    s.advance(20)
    expect(Math.abs(s.z(h) - z)).toBeGreaterThan(10)
  })
  it('a shape that cannot move, handed a move (as the square against cavalry keeps one), stands and keeps it', () => {
    const s = sim(still)
    const h = s.spawn(0, 0, 0, 'line', FULL.infantry)
    s.order({ type: 'move', id: h, append: false, points: [[0, 100]] })
    const i = s.slot(h)
    s.w.f.shape[i] = s.w.cr.types[s.w.f.type[i]].shapeIndex('square')
    const z = s.z(h)
    s.advance(10)
    expect(s.z(h)).toBe(z)
    expect(s.orders(h)).toBe(1)
  })
})

describe('brace by the side struck', () => {
  it("weighs each side's bracing by the side's weight, and a shape braced alike gives it exactly", () => {
    const s = sim(withTraits('column', { brace: { front: 0.5, flank: 0.25 } }))
    const c = s.slot(s.spawn(0, 0, 0, 'column', FULL.infantry))
    const q = s.slot(s.spawn(200, 0, 0, 'square', FULL.infantry))
    const by = (i: number, a: number[]) => braceOf(s.w, i, new Float64Array(a))
    expect([by(c, [1, 0, 0]), by(c, [0, 1, 0]), by(c, [0, 0, 1])]).toEqual([0.5, 0.25, 0])
    expect(by(c, [0.5, 0.5, 0])).toBeCloseTo(0.375, 12)
    expect(by(q, [0.3, 0.3, 0.4 - 1e-12])).toBe(1)
  })
})

describe('flankFrom', () => {
  it('moves where the flank begins: 60° off a face’s end is the flank at 45°, the front at 80°', () => {
    const at = (rs: Ruleset) => {
      const s = sim(rs)
      const j = s.slot(s.spawn(0, 0, 0, 'line', FULL.infantry))
      s.advance(1)
      const F = buildFaces(s.w, blockGeometry(s.w))
      const x = F.R[2 * j] + 30 * Math.sin(60 * D)
      const z = F.F[2 * j] + 30 * Math.cos(60 * D)
      return Array.from(pointWeights(s.w, j, x, z, new Float64Array(3)))
    }
    expect(at(napoleonic)[1]).toBeCloseTo(1, 6)
    expect(at(withTraits('line', { flankFrom: 80 * D }))[0]).toBeCloseTo(1, 6)
  })
})

describe('shock', () => {
  it("multiplies the drain on the bar (the shape's shock taken)", () => {
    const share = (rs: Ruleset) => {
      const s = sim(rs)
      const i = s.slot(s.spawn(0, 0, 0, 'line', FULL.infantry))
      s.w.f.drain[i] = 10
      return moraleShare(s.w, i)
    }
    const one = 1 - share(napoleonic)
    expect(1 - share(withTraits('line', { shock: 1.05 }))).toBeCloseTo(1.05 * one, 9)
  })
})

describe('fire', () => {
  it("multiplies a line's musketry: at a quarter it kills far fewer", () => {
    const lost = (rs: Ruleset) => {
      const s = sim(rs)
      s.spawn(0, 0, 0, 'line', FULL.infantry, 0)
      const t = s.spawn(0, 40, Math.PI, 'line', FULL.infantry, 1)
      s.order({ type: 'fire', id: t, mode: 'hold' })
      s.advance(240)
      return FULL.infantry - s.men(t)
    }
    const full = lost(napoleonic)
    expect(full).toBeGreaterThan(10)
    expect(lost(withTraits('line', { fire: 0.25 }))).toBeLessThan(full * 0.5)
  })
})
