// The selected unit's info box (src/app/unit-card.ts, docs/proposals/formations.md § 5): it shows what the sim uses.
import { describe, it, expect } from 'vitest'
import { Sim, OPEN_DATA, openBattlefield } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { unitCard } from '../src/app/unit-card.ts'
import { FULL } from '../src/scenarios/sizes.ts'

describe('the info box', () => {
  it("shows a column's traits as the table gives them, and an enemy on its flank by side", () => {
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    const col = s.spawn(0, 0, 0, 'column', FULL.infantry, 0)
    const e = s.spawn(60, -8, -Math.PI / 2, 'line', FULL.infantry, 1)
    s.order({ type: 'fire', id: e, mode: 'hold' })
    const card = unitCard(s.w, s.slot(col)).join('\n')
    expect(card).toContain(`· column · at will · ${FULL.infantry} figures (${FULL.infantry * 25} men)`)
    expect(card).toContain('melee 1.40 · hits taken 1.30 front, × 1.20 flank, × 1.10 rear')
    expect(card).toContain('braced 0.50 front, 0.25 flank, 0.00 rear · may move')
    expect(card).toContain('shock taken × 0.75 · flank shock × 0.70')
    expect(card).toMatch(/#\d+ infantry at 6\d m: flank 1\.00/)
  })
  it('while changing shape, shows what the sim uses: the higher of the two hits, the bracing by progress', () => {
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    const h = s.spawn(0, 0, 0, 'line', FULL.infantry, 0)
    s.order({ type: 'form', id: h, shape: 'square' })
    s.advance(45)
    const card = unitCard(s.w, s.slot(h)).join('\n')
    expect(card).toMatch(/line → square \((4\d|5\d)%\)/)
    expect(card).toContain('hits taken the higher of 1.00 front, × 1.80 flank, × 1.20 rear and 1.40 every side')
    expect(card).toMatch(/braced 0\.[45]\d front, 0\.[45]\d flank, 0\.[45]\d rear/)
  })
  it('says a square cannot move, and its hits taken are the same on every side', () => {
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    const sq = s.spawn(0, 0, 0, 'square', FULL.infantry, 0)
    const card = unitCard(s.w, s.slot(sq)).join('\n')
    expect(card).toContain('hits taken 1.40 every side')
    expect(card).toContain('cannot move')
    expect(card).toContain('nearest enemy none within')
  })
})
