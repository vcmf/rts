// The visual bench's overlay (docs/plans/active/c0-bench.md): over the staff map, what the sim tests where
// formations meet. Each company's block and each bin as the hull of its places (the places the footprint gate tests,
// from src/sim/geometry.ts), bins shaded by their lag, the pairs of companies that touch, each formation's status and
// its queue of orders. It reads the world at its tick, never writes to it, and is drawn only while it is on.
import {
  type World,
  type Placed,
  type Contact,
  mkPlaced,
  placeAll,
  contacts,
  TOUCH,
  outOfFight,
  typeOf,
  STATUS,
  MORALE_STATES,
  CHARGE_PHASES,
  M_TICK,
  MS_STEADY,
  O_MOVE,
  O_FORM,
  O_WHEEL,
  O_FACE,
  O_DRESS,
  O_CHARGE,
  sheltering,
} from '../sim/index.ts'
import { toS, type View } from './map.ts'

/** The overlay's layers, each toggled on the panel. */
export const LAYERS = ['blocks', 'strips', 'contacts', 'statuses', 'orders'] as const
export type Layer = (typeof LAYERS)[number]

// how near two companies of different formations are drawn as touching (metres)
const NEAR = 5
const INK = {
  block: 'rgba(33,31,28,.9)',
  strip: 'rgba(52,95,140,',
  friend: 'rgba(95,90,82,.8)',
  enemy: 'rgba(170,40,30,.85)',
  charge: 'rgba(214,120,20,.95)',
  overlap: 'rgba(200,30,20,.35)',
  label: '#211f1c',
  order: 'rgba(40,90,60,.9)',
}
const ORDER_NAME: Record<number, string> = {
  [O_FORM]: 'form',
  [O_WHEEL]: 'wheel',
  [O_FACE]: 'face about',
  [O_DRESS]: 'dress',
  [O_CHARGE]: 'charge',
}

/** The overlay: its buffers, kept between frames. */
export class Overlay {
  P: Placed
  constructor(w: World) {
    this.P = mkPlaced(w)
  }

  /** Draws the layers in `on` for the world as it stands at its tick. */
  draw(g: CanvasRenderingContext2D, v: View, w: World, on: Set<Layer>): void {
    const P = placeAll(w, this.P)
    const near = contacts(w, P, NEAR)
    if (on.has('strips')) this.strips(g, v, w, P)
    if (on.has('contacts')) this.overlaps(g, v, w, P, near)
    if (on.has('blocks')) this.blocks(g, v, w, P)
    if (on.has('contacts')) this.touching(g, v, w, near)
    if (on.has('orders')) this.orders(g, v, w)
    if (on.has('statuses')) this.statuses(g, v, w)
  }

  // each company's block: the hull of its places, solid in the fight and dashed out of it
  private blocks(g: CanvasRenderingContext2D, v: View, w: World, P: Placed): void {
    g.strokeStyle = INK.block
    g.lineWidth = 1.6
    groups(
      P,
      p => P.f[p] * 64 + P.c[p],
      (pts, p) => {
        g.setLineDash(outOfFight(w.f.mstate[P.f[p]]) ? [4, 3] : [])
        hullPath(g, v, P, pts)
        g.stroke()
      },
    )
    g.setLineDash([])
  }

  // each bin: the hull of its places, shaded by its lag over the lag limit (dark: held back)
  private strips(g: CanvasRenderingContext2D, v: View, w: World, P: Placed): void {
    const f = w.f
    groups(
      P,
      p => P.f[p] * 1024 + P.b[p],
      (pts, p) => {
        const i = P.f[p]
        const lmax = w.cr.rs.orders[w.cr.presets[f.style[i]]].Lmax
        const lag = f.lags[i * w.cr.maxNB + P.b[p]]
        g.fillStyle = `${INK.strip}${(0.16 + 0.5 * Math.min(1, lag / lmax)).toFixed(2)})`
        g.strokeStyle = `${INK.strip}.55)`
        g.lineWidth = 0.8
        hullPath(g, v, P, pts)
        g.fill()
        g.stroke()
      },
    )
  }

  // two companies of formations both in the fight that overlap: both filled red
  private overlaps(g: CanvasRenderingContext2D, v: View, w: World, P: Placed, near: Contact[]): void {
    const f = w.f
    const bad = new Set<number>()
    for (const c of near) {
      if (c.d < TOUCH && !outOfFight(f.mstate[c.i]) && !outOfFight(f.mstate[c.j])) {
        bad.add(c.i * 64 + c.ci)
        bad.add(c.j * 64 + c.cj)
      }
    }
    if (!bad.size) return
    g.fillStyle = INK.overlap
    groups(
      P,
      p => P.f[p] * 64 + P.c[p],
      (pts, p) => {
        if (!bad.has(P.f[p] * 64 + P.c[p])) return
        hullPath(g, v, P, pts)
        g.fill()
      },
    )
  }

  // each pair of companies within NEAR: a line between their nearest places, grey for friends, red for enemies,
  // orange for a charge and its target, thick for a melee pair
  private touching(g: CanvasRenderingContext2D, v: View, w: World, near: Contact[]): void {
    const f = w.f
    for (const c of near) {
      const enemy = f.side[c.i] !== f.side[c.j]
      const melee = enemy && (f.foe[c.i] !== 0 || f.foe[c.j] !== 0)
      const charge = enemy && (f.chPhase[c.i] !== 0 || f.chPhase[c.j] !== 0)
      g.strokeStyle = !enemy ? INK.friend : charge ? INK.charge : INK.enemy
      g.lineWidth = melee ? 3 : 1.2
      const [ax, ay] = toS(v, c.ax, c.az)
      const [bx, by] = toS(v, c.bx, c.bz)
      g.beginPath()
      g.moveTo(ax, ay)
      g.lineTo(bx, by)
      g.stroke()
      g.fillStyle = g.strokeStyle
      g.fillRect(ax - 1.5, ay - 1.5, 3, 3)
      g.fillRect(bx - 1.5, by - 1.5, 3, 3)
    }
  }

  // each formation's queue: a line through its moves' waypoints, the other orders named where they fall in it,
  // and a mark at its last destination
  private orders(g: CanvasRenderingContext2D, v: View, w: World): void {
    const f = w.f
    g.font = '10px ui-monospace, monospace'
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    for (let i = 0; i < f.alive.length; i++) {
      if (!f.alive[i] || f.ordHead[i] < 0) continue
      let [px, py] = toS(v, f.x[i], f.z[i])
      g.strokeStyle = INK.order
      g.fillStyle = INK.order
      g.lineWidth = 1.2
      g.setLineDash([5, 3])
      let k = 0
      for (let n = f.ordHead[i]; n >= 0; n = w.ord.next[n], k++) {
        const t = w.ord.type[n]
        if (t === O_MOVE && w.ord.resolved[n]) {
          const [qx, qy] = toS(v, w.ord.x[n], w.ord.z[n])
          g.beginPath()
          g.moveTo(px, py)
          g.lineTo(qx, qy)
          g.stroke()
          px = qx
          py = qy
          g.fillRect(px - 2, py - 2, 4, 4)
        } else if (ORDER_NAME[t]) {
          const what = t === O_FORM ? `form ${typeOf(w, i).shapes[w.ord.shape[n]]?.name ?? ''}` : ORDER_NAME[t]
          g.fillText(`${k + 1}. ${what}`, px + 6, py + 12 * k - 6)
        }
      }
      g.setLineDash([])
    }
  }

  // each formation's status and engagement, under its anchor
  private statuses(g: CanvasRenderingContext2D, v: View, w: World): void {
    const f = w.f
    g.font = '10px ui-monospace, monospace'
    g.textAlign = 'center'
    g.textBaseline = 'top'
    g.fillStyle = INK.label
    for (let i = 0; i < f.alive.length; i++) {
      if (!f.alive[i]) continue
      const what: string[] = [`#${i}`]
      if (STATUS[f.status[i]]) what.push(STATUS[f.status[i]])
      if (f.foe[i]) what.push('in melee')
      else if (f.chPhase[i]) what.push(CHARGE_PHASES[f.chPhase[i]])
      if (sheltering(w, i)) what.push('sheltering')
      if (f.mstate[i] !== MS_STEADY) what.push(MORALE_STATES[f.mstate[i]])
      if (f.blownUntil[i] > w.meta[M_TICK]) what.push('blown')
      const [sx, sy] = toS(v, f.x[i], f.z[i])
      g.fillText(what.join(' · '), sx, sy + 8)
    }
  }
}

// the places of P grouped by `key` (places of one group need not be adjacent), each group handed over with one of
// its places
function groups(P: Placed, key: (p: number) => number, each: (pts: number[], p: number) => void): void {
  const by = new Map<number, number[]>()
  for (let p = 0; p < P.n; p++) {
    const k = key(p)
    const list = by.get(k)
    if (list) list.push(p)
    else by.set(k, [p])
  }
  for (const pts of by.values()) each(pts, pts[0])
}

// the convex hull of the places `pts` (Andrew's monotone chain) as a closed path on the screen
function hullPath(g: CanvasRenderingContext2D, v: View, P: Placed, pts: number[]): void {
  const s = pts.map(p => toS(v, P.x[p], P.z[p])).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: number[][] = []
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: number[][] = []
  for (let k = s.length - 1; k >= 0; k--) {
    const p = s[k]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  const h = lower.slice(0, -1).concat(upper.slice(0, -1))
  g.beginPath()
  if (!h.length) return
  g.moveTo(h[0][0], h[0][1])
  for (let k = 1; k < h.length; k++) g.lineTo(h[k][0], h[k][1])
  g.closePath()
}
