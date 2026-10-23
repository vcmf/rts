// The demo map's armies (docs/plans/active/armies-demo.md): two sides facing each other across the open ground, each
// a few battalions that march up in column, halt, deploy into line and fire by ranks, on a loop. Scripted: the sim
// drives them in a later step (decision 0037: the sim owns the timings, the renderer binds clips to its phases); here
// the script is the stand-in, deterministic (a function of the clock alone). Era content (the battalion's companies,
// files, ranks and spacings) comes from the ruleset the page hands in (decision 0015); the sides' colours are the art
// bible's (docs/art-bible.md §4) and the tools' (tools/army-blocks.mjs). No Babylon: the tests read it in Node.
//
// Frames: a battalion at (x, z) with heading h faces fwd = (sin h, cos h); its own frame has x across (right =
// (cos h, −sin h)) and z ahead, as the figures' instance matrices turn them (src/look/units.ts)

import type { Uniform } from '../../sim/ruleset.ts'
export type { Uniform }   // (the type is the rulesets': src/sim/ruleset.ts)

/** the battalion's shape, from the ruleset's infantry geometry */
export interface Drill { companies: number; files: number; ranks: number; fileSpacing: number; rankSpacing: number }
/** a man's colours by the figure's colour roles (the bake's palette, tools/bake-figure.py: coat, facings, white, dark,
 *  skin, leather, pack, wood, metal) */
export type Palette = Record<string, string>

/** the far palette (docs/plans/active/armies-demo.md): from above, a far figure shows mostly its headgear, pack and
 *  leather, not its coat, and a dark-coated battalion reads as a dark band. Under the 'coat' rule those roles take the
 *  coat at a value step down (the factor), so the battalion reads in its coat's colour from far off; the rest keep
 *  the uniform's. A light coat keeps its own: its details are what separate it from light ground and snow */
export const FAR_ROLES: Readonly<Record<string, number>> = { dark: 0.78, pack: 0.86, leather: 0.86 }
export function farPalette(p: Palette): Palette {
  const out: Palette = { ...p }, c = p.coat
  if (!c) throw new Error('armies: a uniform without a coat colour has no far palette')
  for (const [r, k] of Object.entries(FAR_ROLES)) {
    const v = [1, 3, 5].map(i => Math.round(parseInt(c.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0'))
    out[r] = `#${v.join('').toUpperCase()}`
  }
  return out
}
/** a colour's relative luminance (Rec. 709 primaries, on linear sRGB: 0 black to 1 white) */
export function luminance(hex: string): number {
  const lin = (i: number) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5)
}
/** the coat's luminance under which a uniform's far figure takes its coat's colour (the 'coat' rule): 0.18, a mid
 *  grey (sRGB about #767676). The French blue is 0.09, the Austrian white 0.76 */
export const FAR_COAT_BELOW = 0.18
export const farRule = (u: Uniform): 'coat' | 'own' => u.far ?? (luminance(u.colours.coat) < FAR_COAT_BELOW ? 'coat' : 'own')

/** the script's phases a battalion goes through, in order, each cycle (the roles its men are given) */
export type Phase = 'column' | 'halt' | 'deploy' | 'fire'
/** reserve: it stands in column of companies, out of the script (layout's reserves) */
export interface Battalion { side: number; uniform: string; x: number; z: number; heading: number; offset: number; reserve?: boolean }

// the script, s: the column's approach (APPROACH m at its march speed), a halt, the companies' deployment at the run,
// a pause in line, then fire by ranks until the cycle ends and it starts again (a jump back: the stand-in's loop)
export const CYCLE = 110, APPROACH = 36, HALT = 4, LINE_PAUSE = 3
const COLUMN_GAP = 1.6   // m between one company's rear rank and the next one's front in column

/** a man's place in the battalion's frame (x across, z ahead), in line and in column of companies */
export function slots(d: Drill): { line: [number, number][]; column: [number, number][]; rank: number[] } {
  const per = d.files * d.ranks, n = d.companies * per, front = d.files * d.fileSpacing
  const line: [number, number][] = [], column: [number, number][] = [], rank: number[] = []
  for (let i = 0; i < n; i++) {
    const c = Math.floor(i / per), f = i % d.files, r = Math.floor((i % per) / d.files)
    // in line: the companies side by side, one file between them (the ruleset's line), the front rank at z 0
    line.push([(c - (d.companies - 1) / 2) * (front + d.fileSpacing) + (f - (d.files - 1) / 2) * d.fileSpacing, -r * d.rankSpacing])
    // in column of companies: one company behind the other, the first at the front
    column.push([(f - (d.files - 1) / 2) * d.fileSpacing, -(c * ((d.ranks - 1) * d.rankSpacing + COLUMN_GAP) + r * d.rankSpacing)])
    rank.push(r)
  }
  return { line, column, rank }
}

/** a battalion's frontage and depth in line, and its column's depth, m */
export function extents(d: Drill): { halfFront: number; lineDepth: number; columnDepth: number; columnHalf: number } {
  const front = d.files * d.fileSpacing
  return {
    halfFront: (d.companies * front + (d.companies - 1) * d.fileSpacing) / 2, lineDepth: (d.ranks - 1) * d.rankSpacing,
    columnDepth: d.companies * ((d.ranks - 1) * d.rankSpacing + COLUMN_GAP) - COLUMN_GAP, columnHalf: front / 2,
  }
}

/** the ground a site must keep clear: water, trees, buildings, the tile's edge (true: blocked) */
export type Blocked = (x: number, z: number) => boolean

/** each side's battalions on the open ground, all of each within the camera's play area (±play m: the player can
 *  reach every one), in two kinds (batch C, docs/plans/active/armies-demo.md):
 *  - the lines: up to LINE_ROWS rows behind the side's front, each battalion running the script (its column's approach,
 *    its deployment, its fire), its whole footprint (the line, the approach behind it, a margin) clear and within
 *    play, its box clear of the others'; candidates on a 5 m grid, the front row and the middle first;
 *  - the reserves, the rest: standing in column of companies at least RESERVE_BACK m behind the front (a column's box
 *    and a margin, clear of the lines' footprints), the nearest the front and the middle first;
 *  - the close reserves, only when the reserves leave a side short (docs/plans/active/armies-32k.md: 40 a side; never
 *    at 20 or fewer on the demo map, whose layout stays as it was): more columns in column of companies, CLOSE m apart
 *    (men to men) on a finer grid, a line's footprint taken as its shape (a T: the line's full width only as deep as
 *    its ranks, its approach only as wide as its column), so they may stand behind a line's flanks, never ahead of a
 *    line they overlap across.
 *  Fails loudly if a side cannot field `perSide` battalions. uniforms: each side's battalions' uniform; centre:
 *  between the two fronts; gap: between them, m (about a volley's range) */
export const LINE_ROWS = 2, RESERVE_BACK = 40
const CLOSE = { grid: 2.5, margin: 2, pad: 2 }   // the close reserves: m (their boxes CLOSE.margin a side and CLOSE.pad apart)
const DEPLOY_SLICES = 4   // the close reserves keep off a deploying line's trapezoid in this many boxes
// the close reserves' candidates on their CLOSE.grid, the nearest the front and the middle first: the same for either
// side, built once a play area
const fineGrids = new Map<number, [number, number][]>()
function fineGrid(play: number): [number, number][] {
  let fine = fineGrids.get(play)
  if (!fine) {
    fine = []; const g = CLOSE.grid
    for (let bi = 0; bi * g <= 2 * play; bi++) for (let ai = -Math.floor(play / g); ai * g <= play; ai++) fine.push([ai * g, bi * g])
    fine.sort((p, q) => 0.5 * Math.abs(p[0]) + p[1] - (0.5 * Math.abs(q[0]) + q[1]) || p[0] - q[0] || p[1] - q[1])
    fineGrids.set(play, fine)
  }
  return fine
}
export function layout(perSide: number, d: Drill, blocked: Blocked, uniforms: readonly string[], centre: readonly [number, number] = [0, 0], gap = 110, play = 235): Battalion[] {
  const e = extents(d), out: Battalion[] = [], step = 2.5, margin = 3, G = 5
  const lineW = 2 * e.halfFront + 2 * margin + 6, lineD = APPROACH + e.columnDepth + 2 * margin + 6
  const resW = 2 * e.columnHalf + 2 * margin + 4, resD = e.columnDepth + 2 * margin + 4
  for (let s = 0; s < 2; s++) {
    // the side faces the other across the centre: side 0 northward (+z), side 1 southward
    const h = s === 0 ? 0 : Math.PI, fs = Math.sin(h), fc = Math.cos(h)
    const fx = centre[0] - fs * gap / 2, fz = centre[1] - fc * gap / 2
    const at = (ac: number, bh: number): [number, number] => [fx + fc * ac - fs * bh, fz - fs * ac - fc * bh]
    // a footprint in the battalion's frame (b across, a ahead: from a0 to a1, half-width wide(a)) clear and in play
    const clear = (x: number, z: number, a0: number, a1: number, wide: (a: number) => number) => {
      for (let a = a0; a <= a1; a += step) {
        const w = wide(a)
        for (let b = -w; b <= w; b += step) {
          const px = x + fc * b + fs * a, pz = z - fs * b + fc * a
          if (Math.abs(px) > play || Math.abs(pz) > play || blocked(px, pz)) return false
        }
      }
      return true
    }
    const boxes: { ac: number; bh: number; w: number; d: number }[] = []   // placed: across, behind (their front), width, depth
    const free = (ac: number, bh: number, w: number, dd: number) => boxes.every(o => Math.abs(o.ac - ac) >= (o.w + w) / 2 || bh + dd <= o.bh || o.bh + o.d <= bh)
    const cands: [number, number][] = []
    for (let bi = 0; bi * G <= 2 * play; bi++) for (let ai = -Math.floor(play / G); ai * G <= play; ai++) cands.push([ai * G, bi * G])
    let lines = 0
    // the lines: within LINE_ROWS footprints' depth (and 15 m) of the front, the front row and the middle first
    cands.sort((p, q) => Math.abs(p[0]) + 3 * p[1] - (Math.abs(q[0]) + 3 * q[1]) || p[0] - q[0] || p[1] - q[1])
    for (const [ac, bh] of cands) {
      if (lines >= perSide) break
      if (bh > (LINE_ROWS - 1) * lineD + 15 || !free(ac, bh, lineW, lineD)) continue
      const [x, z] = at(ac, bh)
      if (!clear(x, z, -(APPROACH + e.columnDepth + margin), margin, a => a > -(e.lineDepth + margin) ? e.halfFront + margin : e.columnHalf + margin)) continue
      boxes.push({ ac, bh, w: lineW, d: lineD }); lines++
      out.push({ side: s, uniform: uniforms[s], x, z, heading: h, offset: ((lines - 1) * 9.7) % CYCLE })
    }
    // the reserves: in column behind the front row (never in it: RESERVE_BACK m back at least), clear of the lines'
    // footprints, the nearest the front and the middle first
    cands.sort((p, q) => 0.5 * Math.abs(p[0]) + p[1] - (0.5 * Math.abs(q[0]) + q[1]) || p[0] - q[0] || p[1] - q[1])
    let placed = lines
    for (const [ac, bh] of cands) {
      if (placed >= perSide) break
      if (bh < RESERVE_BACK || !free(ac, bh, resW, resD)) continue
      const [x, z] = at(ac, bh)
      if (!clear(x, z, -(e.columnDepth + margin), margin, () => e.columnHalf + margin)) continue
      boxes.push({ ac, bh, w: resW, d: resD }); placed++
      out.push({ side: s, uniform: uniforms[s], x, z, heading: h, offset: 0, reserve: true })
    }
    if (placed < perSide) {
      // the close reserves: the lines' boxes as their T (head: the ranks and a margin; stem: the column's approach) and
      // the ground the companies cross as they deploy, from their column to the line (a trapezoid behind the head, as
      // wide as the line at the ranks' depth and as the column at its rear: DEPLOY_SLICES boxes, each as wide as its
      // front)
      const m = CLOSE.margin, w = 2 * e.columnHalf + 2 * m + CLOSE.pad, dd = e.columnDepth + 2 * m + CLOSE.pad
      const headD = e.lineDepth + 2 * margin + 6, stemW = 2 * e.columnHalf + 2 * margin + 6, ls = boxes.slice(0, lines)
      const span = Math.max(0, e.columnDepth - e.lineDepth), half = (dep: number) => e.columnHalf + (e.halfFront - e.columnHalf) * (span > 0 ? (e.columnDepth - dep) / span : 0)
      const deploy = (o: typeof boxes[0]) => Array.from({ length: span > 0 ? DEPLOY_SLICES : 0 }, (_, k) => {
        const d0 = e.lineDepth + span * k / DEPLOY_SLICES
        return { ac: o.ac, bh: o.bh + d0, w: 2 * half(d0) + 2 * margin + 6, d: span / DEPLOY_SLICES + margin }
      })
      const parts = [...ls.flatMap(o => [{ ...o, d: headD }, { ...o, w: stemW }, ...deploy(o)]), ...boxes.slice(lines)]
      for (const [ac, bh] of fineGrid(play)) {
        if (placed >= perSide) break
        if (bh < RESERVE_BACK || ls.some(o => Math.abs(o.ac - ac) < (o.w + w) / 2 && bh < o.bh)) continue   // (never ahead of a line)
        if (!parts.every(o => Math.abs(o.ac - ac) >= (o.w + w) / 2 || bh + dd <= o.bh || o.bh + o.d <= bh)) continue
        const [x, z] = at(ac, bh)
        if (!clear(x, z, -(e.columnDepth + m), m, () => e.columnHalf + m)) continue
        parts.push({ ac, bh, w, d: dd }); placed++
        out.push({ side: s, uniform: uniforms[s], x, z, heading: h, offset: 0, reserve: true })
      }
    }
    if (placed < perSide) throw new Error(`armies: room for only ${placed} of ${perSide} battalions for side ${s} within ±${play} m (${lines} in line; src/look/world/armies.ts, layout)`)
  }
  return out
}

/** the middle of the fight: between the two sides' nearest battalions, the pair nearer the map's middle preferred (the
 *  cameras' focus: the bench's, the review's; the camera's focus stays near the middle, spec.ts play) */
export function facingAt(bs: readonly Battalion[]): [number, number] {
  let best = Infinity, at: [number, number] | null = null
  const lines = bs.some(b => !b.reserve && b.side === 0) && bs.some(b => !b.reserve && b.side === 1) ? bs.filter(b => !b.reserve) : bs   // (the lines: the reserves stand back)
  for (const a of lines) if (a.side === 0) for (const o of lines) if (o.side === 1) {
    const d = Math.hypot(a.x - o.x, a.z - o.z) + 0.5 * Math.hypot(a.x + o.x, a.z + o.z) / 2
    if (d < best) { best = d; at = [(a.x + o.x) / 2, (a.z + o.z) / 2] }
  }
  if (!at) throw new Error('armies: facingAt needs a battalion on each side')
  return at
}

/** a man at a time: where he stands in the battalion's frame (x across, z ahead), the way he faces (rad, 0 the
 *  battalion's front), his role and the time his role's clip started (for its phase), and whether he moves */
export interface ManState { x: number; z: number; face: number; role: 'halt' | 'march' | 'run' | 'fire'; since: number; moving: boolean }

/** the battalion's phase at its local time t (s since its cycle started), and when the phase began */
export function phaseAt(d: Drill, t: number, marchSpeed: number, runSpeed: number): { phase: Phase; start: number; deployEnd: number } {
  const tm = APPROACH / marchSpeed, th = tm + HALT, deploy = deployTime(d, runSpeed), tf = th + deploy + LINE_PAUSE
  if (t < tm) return { phase: 'column', start: 0, deployEnd: th + deploy }
  if (t < th) return { phase: 'halt', start: tm, deployEnd: th + deploy }
  if (t < tf) return { phase: 'deploy', start: th, deployEnd: th + deploy }
  return { phase: 'fire', start: tf, deployEnd: th + deploy }
}
const deployTimes = new Map<string, number>()
function deployTime(d: Drill, runSpeed: number): number {
  const k = `${d.companies},${d.files},${d.ranks},${d.fileSpacing},${d.rankSpacing},${runSpeed}`
  let v = deployTimes.get(k)
  if (v === undefined) { const s = slots(d); v = Math.max(...s.line.map(([x, z], i) => Math.hypot(x - s.column[i][0], z - s.column[i][1]))) / runSpeed; deployTimes.set(k, v) }
  return v
}

/** man i of a battalion at its local time t: in column he marches up (the column's front from APPROACH m back to the
 *  line's front), halted he stands, deploying he runs from his column place to his line place (facing his way) and
 *  stands there, in line the ranks fire by turn (each rank RANK_LAG s after the one in front, a man's own lag ±0.3 s) */
export const RANK_LAG = 1.4
// (written into out: the page calls it for every man once a step, so nothing is allocated; p: phaseAt's at t)
export function manAt(d: Drill, s: ReturnType<typeof slots>, i: number, t: number, p: ReturnType<typeof phaseAt>, runSpeed: number, marchSpeed: number, jitter: number, out: ManState): ManState {
  const cx = s.column[i][0], cz = s.column[i][1], lx = s.line[i][0], lz = s.line[i][1]
  const set = (x: number, z: number, face: number, role: ManState['role'], since: number, moving: boolean) => { out.x = x; out.z = z; out.face = face; out.role = role; out.since = since; out.moving = moving; return out }
  if (p.phase === 'column') return set(cx, cz - APPROACH + t * marchSpeed, 0, 'march', 0, true)
  if (p.phase === 'halt') return set(cx, cz, 0, 'halt', p.start, false)
  if (p.phase === 'deploy') {
    const dx = lx - cx, dz = lz - cz, dist = Math.hypot(dx, dz), run = t - p.start, arrive = dist / runSpeed
    if (dist < 0.05 || run >= arrive) return set(lx, lz, 0, 'halt', p.start + arrive, false)
    const k = run / arrive
    return set(cx + dx * k, cz + dz * k, Math.atan2(dx, dz), 'run', p.start, true)
  }
  return set(lx, lz, 0, 'fire', p.start + s.rank[i] * RANK_LAG + jitter * 0.3, false)
}
