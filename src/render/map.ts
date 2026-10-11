// The staff map (docs/plans/done/s1b-sim-page.md), drawn only from the sim's build-time data and the
// ruleset, in the style of the formation prototype: class fills from a smoothed class image, edges and
// contours by marching squares, spot heights at the summits, cosmetic symbols (scene.ts), every soldier a
// small outlined circle. Two layers: the map (redrawn when the view changes) and the units (every frame).
import type { World } from '../sim/index.ts'
import { cellK, O_MOVE, M_TICK, MS_STEADY, MORALE_STATES, fleeing, DT, formationSlot, layoutOf, typeOf, placeWorld } from '../sim/index.ts'
import type { Scene } from './scene.ts'
import type { SoldierLayer } from './soldiers.ts'
import { CLASS_STYLE, INK, SIDE_INK, FIRE_INK, MORALE_INK } from './style.ts'

export interface View { cx: number; cz: number; k: number; W: number; H: number }   // k: pixels per metre; north up
export const toS = (v: View, x: number, z: number): [number, number] => [v.W / 2 + (x - v.cx) * v.k, v.H / 2 - (z - v.cz) * v.k]
export const toW = (v: View, sx: number, sy: number): [number, number] => [v.cx + (sx - v.W / 2) / v.k, v.cz - (sy - v.H / 2) / v.k]

// marching squares over a scalar grid: segments where it crosses `level`, in world coordinates
function march(get: (i: number, j: number) => number, nx: number, nz: number, cell: number, x0: number, z0: number, level: number, out: number[]): void {
  const pairs: Record<number, number[][]> = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[3, 0], [1, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = get(i, j), b = get(i + 1, j), c = get(i + 1, j + 1), d = get(i, j + 1)
    const code = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0)
    if (code === 0 || code === 15) continue
    const x = x0 + i * cell, z = z0 + j * cell, t = (p: number, q: number) => (level - p) / (q - p)
    const e = [[x + cell * t(a, b), z], [x + cell, z + cell * t(b, c)], [x + cell * t(d, c), z + cell], [x, z + cell * t(a, d)]]
    for (const [p, q] of pairs[code]) out.push(e[p][0], e[p][1], e[q][0], e[q][1])
  }
}

export class StaffMap {
  w: World; scene: Scene
  contours = new Map<number, Float64Array>()   // level → segments
  edges: { style: string; width: number; seg: Float64Array }[] = []
  peaks: [number, number, number][] = []        // x, z, height
  stipple: [number, number][] = []; furrows: number[] = []; beads: [number, number][] = []
  base: HTMLCanvasElement | OffscreenCanvas | null = null
  names: string[]
  constructor(w: World, scene: Scene) {
    this.w = w; this.scene = scene; this.names = Object.keys(w.cr.rs.terrain)
    const t = w.terrain, d = w.data, h = d.height
    // contours every 2 m on the heightfield
    let lo = Infinity, hi = -Infinity; for (const v of h.h) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
    for (let L = Math.ceil(lo / 2) * 2; L <= hi; L += 2) { const seg: number[] = []; march((i, j) => h.h[j * h.nx + i], h.nx, h.nz, h.cell, h.x0, h.z0, L, seg); this.contours.set(L, new Float64Array(seg)) }
    // class edges, from each styled class's mask on the 1 m grid
    const cls = (i: number, j: number) => t.cls[j * t.n + i]
    this.names.forEach((name, c) => { const st = CLASS_STYLE[name]; if (!st?.edge) return
      const seg: number[] = []; march((i, j) => (cls(i, j) === c ? 1 : 0), t.n, t.n, t.cell, t.x0, t.z0, 0.5, seg)
      this.edges.push({ style: st.edge, width: st.edgeWidth ?? 0.8, seg: new Float64Array(seg) }) })
    // spot heights: summits higher than everything within 30 m and at least 4 m above its rim
    const R = Math.round(30 / h.cell)
    for (let j = R; j < h.nz - R; j += 2) for (let i = R; i < h.nx - R; i += 2) {
      const v = h.h[j * h.nx + i]; let top = true, rim = Infinity
      for (let b = -R; b <= R && top; b++) for (let a = -R; a <= R; a++) { const u = h.h[(j + b) * h.nx + i + a]; if (u > v) { top = false; break } if (Math.abs(a) === R || Math.abs(b) === R) rim = Math.min(rim, u) }
      if (top && v - rim >= 4 && !this.peaks.some(p => Math.hypot(p[0] - (h.x0 + i * h.cell), p[1] - (h.z0 + j * h.cell)) < 40)) this.peaks.push([h.x0 + i * h.cell, h.z0 + j * h.cell, v])
    }
    // symbols
    const span = (t.n - 1) * t.cell
    for (let z = t.z0 + 1.5; z < t.z0 + span; z += 3) for (let x = t.x0 + 1.5; x < t.x0 + span; x += 3) {
      const st = CLASS_STYLE[this.names[t.cls[cellK(t, x, z)]]]
      if (st?.symbol === 'stipple') this.stipple.push([x, z]); if (st?.symbol === 'beads') this.beads.push([x, z])
    }
    for (let z = t.z0 + 1; z < t.z0 + span; z += 2.5) {   // furrows: runs of ploughed cells along x
      let start = NaN
      for (let x = t.x0; x <= t.x0 + span; x += 1) { const on = CLASS_STYLE[this.names[t.cls[cellK(t, x, z)]]]?.symbol === 'furrows'
        if (on && start !== start) start = x; if (!on && start === start) { this.furrows.push(start, z, x - 1, z); start = NaN } }
    }
  }
  // the class image: 4 px per metre, each pixel the class with the most bilinear weight, so edges are smooth
  buildBase(make: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas): void {
    const t = this.w.terrain, P = 4, n = (t.n - 1) * P, cv = make(n, n), g = cv.getContext('2d') as CanvasRenderingContext2D, im = g.createImageData(n, n)
    const rgb = this.names.map(name => hex(CLASS_STYLE[name]?.fill ?? INK.paper)), shallow = hex(INK.shallow), wid = this.names.indexOf('water')
    const wsum = new Float64Array(this.names.length)
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      const u = px / P, v = (n - 1 - py) / P, i = Math.min(t.n - 2, Math.floor(u)), j = Math.min(t.n - 2, Math.floor(v)), fu = u - i, fv = v - j
      wsum.fill(0)
      const add = (a: number, b: number, wgt: number) => { wsum[t.cls[b * t.n + a]] += wgt }
      add(i, j, (1 - fu) * (1 - fv)); add(i + 1, j, fu * (1 - fv)); add(i, j + 1, (1 - fu) * fv); add(i + 1, j + 1, fu * fv)
      let best = 0; for (let c = 1; c < wsum.length; c++) if (wsum[c] > wsum[best]) best = c
      let col = rgb[best]
      if (best === wid && t.depth[j * t.n + i] <= this.w.cr.rs.water.limit) col = shallow   // a ford: wadeable water, lighter
      const o = (py * n + px) * 4; im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = 255
    }
    g.putImageData(im, 0, 0); this.base = cv
  }

  drawMap(g: CanvasRenderingContext2D, v: View): void {
    const t = this.w.terrain, k = v.k, span = (t.n - 1) * t.cell
    const [ax, ay] = toS(v, t.x0, t.z0 + span), [bx, by] = toS(v, t.x0 + span, t.z0)
    // beyond the surveyed ground: a darker margin with the map's edge ruled, so the field's limit reads
    g.fillStyle = INK.offMap; g.fillRect(0, 0, v.W, v.H); g.fillStyle = INK.paper; g.fillRect(ax, ay, bx - ax, by - ay)
    if (this.base) { g.imageSmoothingEnabled = true; g.drawImage(this.base as CanvasImageSource, ax, ay, bx - ax, by - ay) }
    g.strokeStyle = INK.ink2; g.lineWidth = 1; g.strokeRect(ax - 0.5, ay - 0.5, bx - ax + 1, by - ay + 1)
    const [wx0, wz1] = toW(v, 0, 0), [wx1, wz0] = toW(v, v.W, v.H), inView = (x: number, z: number, m = 5) => x > wx0 - m && x < wx1 + m && z > wz0 - m && z < wz1 + m
    // 100 m grid, labelled at the edges
    g.strokeStyle = INK.grid; g.lineWidth = 1; g.font = '400 9px ui-monospace, Menlo, monospace'; g.fillStyle = INK.ink3
    for (let x = Math.ceil(wx0 / 100) * 100; x <= wx1; x += 100) { const [sx] = toS(v, x, 0); g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, v.H); g.stroke(); g.fillText(String(x), sx + 3, v.H - 6) }
    for (let z = Math.ceil(wz0 / 100) * 100; z <= wz1; z += 100) { const [, sy] = toS(v, 0, z); g.beginPath(); g.moveTo(0, sy); g.lineTo(v.W, sy); g.stroke(); g.fillText(String(z), 4, sy - 3) }
    // symbols
    if (k > 1.5) { g.fillStyle = 'rgba(138,106,70,.45)'; for (const [x, z] of this.stipple) if (inView(x, z)) { const [sx, sy] = toS(v, x, z); g.fillRect(sx, sy, 1, 1) } }
    g.strokeStyle = 'rgba(138,106,70,.35)'; g.lineWidth = 0.6; g.beginPath()
    for (let q = 0; q < this.furrows.length; q += 4) { const [a, b] = toS(v, this.furrows[q], this.furrows[q + 1]), [c] = toS(v, this.furrows[q + 2], this.furrows[q + 3]); g.moveTo(a, b); g.lineTo(c, b) }
    g.stroke()
    g.strokeStyle = '#4f7a86'; g.lineWidth = 0.8; g.beginPath()
    for (const [x, z] of this.scene.reeds) if (inView(x, z)) { const [a, b] = toS(v, x, z), s = Math.max(2.5, 0.9 * k); g.moveTo(a - s, b); g.lineTo(a + s, b); g.moveTo(a, b); g.lineTo(a, b - s); g.moveTo(a - s * 0.6, b); g.lineTo(a - s, b - s * 0.8); g.moveTo(a + s * 0.6, b); g.lineTo(a + s, b - s * 0.8) }
    g.stroke()
    // class edges
    for (const e of this.edges) { g.strokeStyle = e.style; g.lineWidth = e.width; g.beginPath(); seg(g, v, e.seg); g.stroke() }
    g.fillStyle = INK.woodInk; for (const [x, z] of this.beads) if (inView(x, z)) { const [sx, sy] = toS(v, x, z); g.beginPath(); g.arc(sx, sy, Math.max(1.2, 0.7 * k), 0, 7); g.fill() }
    // contours: index every 10 m, thicker, labelled
    for (const [L, s] of this.contours) { const ix = L % 10 === 0; if (!ix && k < 1.2) continue
      g.strokeStyle = ix ? INK.contourIx : INK.contour; g.lineWidth = ix ? 1.15 : 0.55; g.globalAlpha = ix ? 0.95 : 0.75; g.beginPath(); seg(g, v, s); g.stroke(); g.globalAlpha = 1 }
    g.font = '400 9px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'
    const placed: [number, number][] = []
    for (const [L, s] of this.contours) { if (L % 10) continue
      const mine: [number, number][] = []
      for (let q = 0; q < s.length; q += 28) { const [sx, sy] = toS(v, (s[q] + s[q + 2]) / 2, (s[q + 1] + s[q + 3]) / 2)
        if (sx < 20 || sy < 20 || sx > v.W - 20 || sy > v.H - 20) continue
        if (mine.some(([a, b]) => Math.hypot(a - sx, b - sy) < 260) || placed.some(([a, b]) => Math.hypot(a - sx, b - sy) < 40)) continue
        mine.push([sx, sy]); placed.push([sx, sy])
        let ang = Math.atan2(-(s[q + 3] - s[q + 1]), s[q + 2] - s[q]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI
        g.save(); g.translate(sx, sy); g.rotate(ang); g.fillStyle = INK.paper; g.fillRect(-9, -5, 18, 10); g.fillStyle = INK.contourIx; g.fillText(String(L), 0, 0); g.restore() } }
    // trees: open crowns with a trunk dot
    g.strokeStyle = INK.woodInk; g.lineWidth = 0.9
    for (const o of this.scene.trees) if (inView(o.x, o.z)) { const [sx, sy] = toS(v, o.x, o.z), R = Math.max(1.6, 1.7 * k)
      g.fillStyle = 'rgba(243,239,230,.85)'; g.beginPath(); g.arc(sx, sy, R, 0, 7); g.fill(); g.stroke(); g.fillStyle = INK.woodInk; g.beginPath(); g.arc(sx, sy, Math.max(0.6, o.r * k * 0.8), 0, 7); g.fill() }
    // spot heights
    g.textAlign = 'left'; g.font = '500 10px ui-monospace, Menlo, monospace'
    for (const [x, z, hh] of this.peaks) { const [sx, sy] = toS(v, x, z); g.fillStyle = INK.ink; g.beginPath(); g.moveTo(sx, sy - 4); g.lineTo(sx + 4, sy + 3); g.lineTo(sx - 4, sy + 3); g.closePath(); g.fill(); g.fillText(hh.toFixed(0), sx + 7, sy + 1) }
  }

  drawUnits(g: CanvasRenderingContext2D, v: View, layer: SoldierLayer, selected: Set<number>, showSlots: boolean): void {
    const w = this.w, f = w.f, k = v.k, R = Math.max(1.3, 0.28 * k)
    g.clearRect(0, 0, v.W, v.H)
    const vis = (sx: number, sy: number) => sx > -R - 1 && sy > -R - 1 && sx < v.W + R + 1 && sy < v.H + R + 1
    // the fallen: small crosses
    g.strokeStyle = 'rgba(95,90,82,.55)'; g.lineWidth = 1; g.beginPath()
    const cross = (x: number, z: number) => { const [sx, sy] = toS(v, x, z); if (!vis(sx, sy)) return; const d = R * 0.8; g.moveTo(sx - d, sy - d); g.lineTo(sx + d, sy + d); g.moveTo(sx + d, sy - d); g.lineTo(sx - d, sy + d) }
    for (const m of layer.fallen) cross(m.x, m.z)
    for (const u of layer.units.values()) for (const m of u.men) if (!m.alive) cross(m.x, m.z)
    g.stroke()
    const p = [0, 0, 0]
    for (const u of layer.units.values()) {
      const sel = selected.has(u.i), ink = SIDE_INK[u.side] ?? INK.ink
      // the living: open circles, one path per formation; a trooper also a stroke the length of his horse, along
      // the way he rides (or his formation faces, at rest); selected formations drawn bolder
      g.strokeStyle = ink; g.lineWidth = sel ? 1.8 : k > 4 ? 1.1 : 0.9; g.beginPath()
      const horse = typeOf(w, u.i).shapes.some(L => w.cr.kinds[L.kind] === 'horse'), uh = layer.anchor(u.i, layer.alphaNow, 0)[2]
      for (const m of u.men) if (m.alive) { const [sx, sy] = toS(v, m.x, m.z); if (!vis(sx, sy)) continue; g.moveTo(sx + R, sy); g.arc(sx, sy, R, 0, Math.PI * 2)
        if (horse) { const sp = Math.hypot(m.vx, m.vz), dx = sp > 0.3 ? m.vx / sp : Math.sin(uh), dz = sp > 0.3 ? m.vz / sp : Math.cos(uh), [bx, by] = toS(v, m.x - dx * 2.4, m.z - dz * 2.4); g.moveTo(sx, sy); g.lineTo(bx, by) } }
      g.stroke()
      if (typeOf(w, u.i).shapes.some(L => w.cr.kinds[L.kind] === 'guns')) this.drawPieces(g, v, layer, u.i, u.men, R, ink)
      // the colours: a small flag at the anchor, pointing the way the battalion faces
      const [fx, fz, fh] = layer.anchor(u.i, layer.alphaNow, 0)   // interpolated, as the men are
      const [ax, ay] = toS(v, fx, fz); g.save(); g.translate(ax, ay); g.rotate(fh); g.fillStyle = ink
      g.beginPath(); g.moveTo(0, -R * 4.2); g.lineTo(R * 2.4, -R * 3.4); g.lineTo(0, -R * 2.6); g.closePath(); g.fill(); g.lineWidth = 1; g.strokeStyle = ink; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -R * 4.2); g.stroke(); g.restore()
      if (sel) {   // the order: a dashed line through the waypoints
        g.setLineDash([4, 4]); g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.moveTo(ax, ay)
        for (let n = f.ordHead[u.i]; n >= 0; n = w.ord.next[n]) if (w.ord.type[n] === O_MOVE && w.ord.resolved[n]) { const [tx, ty] = toS(v, w.ord.x[n], w.ord.z[n]); g.lineTo(tx, ty) }
        g.stroke(); g.setLineDash([])
      }
      // morale: a bar behind the battalion, past its rear rank (its shape's depth, or the routers' spread),
      // its length the morale, its colour the state; the state named under it unless steady
      const st = f.mstate[u.i], bw = Math.max(14, R * 7), mc = MORALE_INK[st] ?? INK.ink2
      const g0 = typeOf(w, u.i).geo, back = layoutOf(w, u.i).depth + g0.ranks * g0.rankSpacing + (fleeing(st) ? 6 : 0) + 14 / k
      const [bx, by] = toS(v, fx - Math.sin(fh) * back, fz - Math.cos(fh) * back)
      g.fillStyle = 'rgba(243,239,230,.85)'; g.fillRect(bx - bw / 2 - 1, by - 3, bw + 2, 5)
      g.fillStyle = mc; g.fillRect(bx - bw / 2, by - 2, bw * Math.max(0, Math.min(1, f.morale[u.i])), 3)
      if (st !== MS_STEADY) { g.font = '9px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(MORALE_STATES[st], bx, by + 4) }
      this.drawVolleys(g, v, layer, u.i, u.men, R)
      if (showSlots) { layer.frame(u.i, layer.alphaNow); g.fillStyle = '#c0392b'; for (const m of u.men) if (m.alive) { layer.place(u.i, m.s, false, p); const [qx, qy] = toS(v, p[0], p[1]); g.fillRect(qx - 1, qy - 1, 2, 2) } }
    }
  }
  // a battery's pieces: for each detachment with men, a barrel ahead of its front rank along its facing and the
  // axle across it
  private drawPieces(g: CanvasRenderingContext2D, v: View, layer: SoldierLayer, i: number, men: { s: number; x: number; z: number; alive: boolean }[], R: number, ink: string): void {
    const w = this.w, U = typeOf(w, i), g0 = U.geo, RF = g0.ranks * g0.files, [ax, az, ah] = layer.anchor(i, layer.alphaNow, 0), t = (w.meta[M_TICK] - 1 + layer.alphaNow) * DT
    const pose = { x: 0, z: 0, a: 0, face: 0, kx: 1, kz: 1 }
    g.strokeStyle = ink; g.lineWidth = Math.max(1.5, R * 0.9); g.beginPath()
    for (let c = 0; c < U.C; c++) {
      let x = 0, z = 0, n = 0
      for (const m of men) if (m.alive && Math.floor(m.s / RF) === c && Math.floor((m.s % RF) / g0.files) === 0) { x += m.x; z += m.z; n++ }   // the front rank
      if (!n) continue
      const p = placeWorld(w, i, c, ax, az, ah, t, 0, pose), fx = Math.sin(p.face), fz = Math.cos(p.face), cx = x / n + fx * 1.5, cz = z / n + fz * 1.5
      const [a0, a1] = toS(v, cx, cz), [b0, b1] = toS(v, cx + fx * 2.5, cz + fz * 2.5), [l0, l1] = toS(v, cx - fz * 0.9, cz + fx * 0.9), [r0, r1] = toS(v, cx + fz * 0.9, cz - fx * 0.9)
      g.moveTo(a0, a1); g.lineTo(b0, b1); g.moveTo(l0, l1); g.lineTo(r0, r1)
    }
    g.stroke()
  }
  // each company that fired in the last 0.6 s: a flash at its front and a fading line toward its target
  private drawVolleys(g: CanvasRenderingContext2D, v: View, layer: SoldierLayer, i: number, men: { s: number; x: number; z: number; alive: boolean }[], R: number): void {
    const w = this.w, f = w.f, U = typeOf(w, i), g0 = U.geo, C = U.C, RF = g0.ranks * g0.files, now = w.meta[M_TICK] + layer.alphaNow
    for (let c = 0; c < C; c++) {
      const k = i * w.cr.maxC + c, age = (now - f.volleyTick[k]) * DT; if (!f.volleyTick[k] || age > 0.6 || age < 0) continue
      let x = 0, z = 0, n = 0
      for (const m of men) if (m.alive && Math.floor(m.s / RF) === c && Math.floor((m.s % RF) / g0.files) === 0) { x += m.x; z += m.z; n++ }   // the front rank
      if (!n) continue
      const [sx, sy] = toS(v, x / n, z / n), a = 1 - age / 0.6, h = f.target[k]
      g.globalAlpha = a; g.fillStyle = FIRE_INK; g.beginPath(); g.arc(sx, sy, R * 1.8, 0, Math.PI * 2); g.fill()
      const j = formationSlot(w, h)
      if (j >= 0) {
        const [tx, tz] = layer.anchor(j, layer.alphaNow, 0), [ex, ey] = toS(v, tx, tz)
        g.strokeStyle = FIRE_INK; g.lineWidth = 1; g.globalAlpha = a * 0.5; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke(); g.setLineDash([])
      }
      g.globalAlpha = 1
    }
  }
}

function seg(g: CanvasRenderingContext2D, v: View, s: Float64Array): void {
  for (let q = 0; q < s.length; q += 4) { const [a, b] = toS(v, s[q], s[q + 1]), [c, d] = toS(v, s[q + 2], s[q + 3]); g.moveTo(a, b); g.lineTo(c, d) }
}
function hex(c: string): [number, number, number] {
  const m = c.match(/^#([0-9a-f]{6})$/i); if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255] }
  const r = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return r ? [+r[1], +r[2], +r[3]] : [243, 239, 230]
}
