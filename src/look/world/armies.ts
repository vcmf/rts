// The demo map's armies (docs/plans/active/armies-demo.md): two sides facing each other across the open ground, each
// a few battalions that march up in column, halt, deploy into line and fire by ranks, on a loop. Scripted: the sim
// drives them in a later step (decision 0037: the sim owns the timings, the renderer binds clips to its phases); here
// the script is the stand-in, deterministic (a function of the clock alone). Era content (the battalion's companies,
// files, ranks and spacings) comes from the ruleset the page hands in (decision 0015); the sides' colours are the art
// bible's (docs/art-bible.md §4) and the tools' (tools/army-blocks.mjs). No Babylon: the tests read it in Node.
//
// Frames: a battalion at (x, z) with heading h faces fwd = (sin h, cos h); its own frame has x across (right =
// (cos h, −sin h)) and z ahead, as the figures' instance matrices turn them (src/look/units.ts)

/** the battalion's shape, from the ruleset's infantry geometry */
export interface Drill { companies: number; files: number; ranks: number; fileSpacing: number; rankSpacing: number }
/** a man's colour roles (the bake's palette, tools/bake-figure.py) painted by a side's colours */
export type Palette = Record<string, string>
export interface Side { name: string; palette: Palette }

// the sides: France, and Austria's white as the other (the French figure recoloured: a stand-in until its own
// figures exist). The roles the art bible gives no colour for keep the French figure's neutral stand-ins
const NEUTRAL = { dark: '#2A2B31', skin: '#C89474', leather: '#7A5C3E', pack: '#8C7152', wood: '#5E3F26', metal: '#A3A6AB' }
export const SIDES: readonly Side[] = [
  { name: 'france', palette: { coat: '#2C4FA8', facings: '#B8322A', white: '#EDE6D6', ...NEUTRAL } },
  { name: 'austria', palette: { coat: '#E9E3D3', facings: '#8E2F3A', white: '#DCD6C8', ...NEUTRAL, dark: '#26272B' } },
]

/** the script's phases a battalion goes through, in order, each cycle (the roles its men are given) */
export type Phase = 'column' | 'halt' | 'deploy' | 'fire'
export interface Battalion { side: number; x: number; z: number; heading: number; offset: number }

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

/** each side's battalions on the open ground: candidate places on a 5 m grid behind each side's front line, nearest
 *  its middle first; a place is taken if its whole line, its column's approach and a margin round them are clear and
 *  its box keeps clear of the battalions already placed. Fails loudly if a side cannot field `perSide` battalions.
 *  centre: between the two fronts; gap: between them, m (about a volley's range) */
export function layout(perSide: number, d: Drill, blocked: Blocked, centre: readonly [number, number] = [0, 0], gap = 110): Battalion[] {
  const e = extents(d), out: Battalion[] = [], step = 2.5, margin = 3, G = 5
  const width = 2 * e.halfFront + 2 * margin + 6, depth = APPROACH + e.columnDepth + 2 * margin + 6
  for (let s = 0; s < 2; s++) {
    // the side faces the other across the centre: side 0 northward (+z), side 1 southward
    const h = s === 0 ? 0 : Math.PI, fs = Math.sin(h), fc = Math.cos(h)
    const fx = centre[0] - fs * gap / 2, fz = centre[1] - fc * gap / 2
    const cands: [number, number, number, number][] = []   // across, behind, score
    for (let bi = 0; bi <= 108; bi++) for (let ai = -108; ai <= 108; ai++) cands.push([ai * G, bi * G, Math.abs(ai * G) + 3 * bi * G, 0])   // (the front row filled first)
    cands.sort((p, q) => p[2] - q[2] || p[0] - q[0] || p[1] - q[1])
    const mine: [number, number][] = []   // the placed battalions' across and behind
    for (const [ac, bh] of cands) {
      if (mine.length >= perSide) break
      if (mine.some(([a2, b2]) => Math.abs(a2 - ac) < width && Math.abs(b2 - bh) < depth)) continue
      const x = fx + fc * ac - fs * bh, z = fz - fs * ac - fc * bh
      // the line, the column's approach behind it, and a margin, sampled every `step` m in the battalion's frame
      let ok = true
      for (let a = -(APPROACH + e.columnDepth + margin); ok && a <= margin; a += step) {
        const wide = a > -(e.lineDepth + margin) ? e.halfFront + margin : e.columnHalf + margin
        for (let b = -wide; b <= wide; b += step) if (blocked(x + fc * b + fs * a, z - fs * b + fc * a)) { ok = false; break }
      }
      if (!ok) continue
      mine.push([ac, bh]); out.push({ side: s, x, z, heading: h, offset: ((mine.length - 1) * 9.7) % CYCLE })
    }
    if (mine.length < perSide) throw new Error(`armies: room for only ${mine.length} of ${perSide} battalions for ${SIDES[s].name} (src/look/world/armies.ts, layout)`)
  }
  return out
}

/** the middle of the fight: between the two sides' nearest battalions, the pair nearer the map's middle preferred (the
 *  cameras' focus: the bench's, the review's; the camera's focus stays near the middle, spec.ts play) */
export function facingAt(bs: readonly Battalion[]): [number, number] {
  let best = Infinity, at: [number, number] | null = null
  for (const a of bs) if (a.side === 0) for (const o of bs) if (o.side === 1) {
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
