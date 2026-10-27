// A scan to trace from (docs/plans/done/m7-editor.md M7e, decision 0069): where its image lies on the map. The image
// is placed in a frame (a dem source's file, or the map itself) by control points, each a pixel [u, v] (v down) and
// the place [x, z] it shows (m, x east, z north); the map shows it inside each relief.dem piece cut from that file,
// moved as the piece is (its `shift`), so the period map follows the terrain it was cut with. Pure, float64 (the
// page's, not the sim's). Tested in test/map-scan.test.ts.
import type { Catalogue, Feature, MapFile, Pt, Source } from '../../map/schema.ts'
import { inRing } from '../../map/geometry.ts'
import { demPlace, toFile, type DemPlace } from '../../map/dem.ts'
import { resolve } from '../../map/resolve.ts'
import { isDemKind } from '../../map/validate.ts'

/** An affine map of the plane: x = a u + b v + c, z = d u + e v + f. */
export type Affine = [number, number, number, number, number, number]
/** A control point: [u, v] a pixel of the image (v down), [x, z] the place in the frame it shows (m). */
export type ControlPoint = [number, number, number, number]
/**
 * A scan's placement: image to frame and back, and how good it is. Each point's residual is its distance from where
 * the fit puts its pixel; from four points on (a spline, exact at every point) it is where the other points alone
 * would put it, which is the image's own error there. Their root mean square: none under four points.
 */
export interface ScanFit {
  toFrame(u: number, v: number): Pt
  /** The pixel a frame point shows, or null where the fit has no inverse. */
  toImage(x: number, z: number): Pt | null
  how: 'extent' | 'moved' | 'similarity' | 'affine' | 'spline'
  residuals: number[]
  rms: number | null
  /** Why the points could not be used as they are (in a line, two on one pixel or place), or null. */
  problem: string | null
}

/** A point through an affine map. */
export const apply = (t: Affine, u: number, v: number): Pt => [t[0] * u + t[1] * v + t[2], t[3] * u + t[4] * v + t[5]]

/** The inverse of an affine map, or null when it has none (a scale of 0). */
export function invert(t: Affine): Affine | null {
  const [a, b, c, d, e, f] = t
  const det = a * e - b * d
  if (Math.abs(det) < 1e-12) return null
  return [e / det, -b / det, (b * f - c * e) / det, -d / det, a / det, (c * d - a * f) / det]
}

/**
 * Two pairs as a similarity: moved, turned and scaled, the image's v axis (down) turned to z (north) with no mirror.
 * In complex numbers, t = a p + b with p = u - i v and t = x + i z.
 */
function similarity(p: ControlPoint[]): Affine | null {
  const [u1, v1, x1, z1] = p[0]
  const [u2, v2, x2, z2] = p[1]
  const pr = u2 - u1
  const pi = -(v2 - v1)
  const n = pr * pr + pi * pi
  if (n === 0) return null
  const tr = x2 - x1
  const ti = z2 - z1
  // a = (t2 - t1) / (p2 - p1)
  const ar = (tr * pr + ti * pi) / n
  const ai = (ti * pr - tr * pi) / n
  // b = t1 - a p1, p1 = u1 - i v1
  const br = x1 - (ar * u1 + ai * v1)
  const bi = z1 - (ai * u1 - ar * v1)
  return [ar, ai, br, ai, -ar, bi]
}

/**
 * Solves a square linear system in place by Gaussian elimination with partial pivoting, for several right-hand sides
 * (the columns of `b`); null when it is singular (relative to its largest entry).
 */
function solve(a: number[][], b: number[][]): number[][] | null {
  const n = a.length
  const big = Math.max(...a.map(r => Math.max(...r.map(Math.abs))), 1e-300)
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    if (Math.abs(a[p][c]) < 1e-12 * big) return null
    ;[a[c], a[p]] = [a[p], a[c]]
    ;[b[c], b[p]] = [b[p], b[c]]
    for (let r = c + 1; r < n; r++) {
      const k = a[r][c] / a[c][c]
      if (k === 0) continue
      for (let j = c; j < n; j++) a[r][j] -= k * a[c][j]
      for (let j = 0; j < b[r].length; j++) b[r][j] -= k * b[c][j]
    }
  }
  const x = b.map(r => r.map(() => 0))
  for (let r = n - 1; r >= 0; r--) {
    for (let j = 0; j < b[r].length; j++) {
      let s = b[r][j]
      for (let c = r + 1; c < n; c++) s -= a[r][c] * x[c][j]
      x[r][j] = s / a[r][r]
    }
  }
  return x
}

/** The least-squares affine map of three or more pairs (exact through three), or null when they lie in a line. */
function leastSquares(p: ControlPoint[]): Affine | null {
  // the normal equations of [u v 1] · [a b c] = x (and z), in coordinates centred on the points (better conditioned)
  const cu = p.reduce((s, q) => s + q[0], 0) / p.length
  const cv = p.reduce((s, q) => s + q[1], 0) / p.length
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const r = [
    [0, 0],
    [0, 0],
    [0, 0],
  ]
  for (const [u, v, x, z] of p) {
    const row = [u - cu, v - cv, 1]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i][j] += row[i] * row[j]
      r[i][0] += row[i] * x
      r[i][1] += row[i] * z
    }
  }
  const s = solve(m, r)
  if (!s) return null
  const [a, d] = s[0]
  const [b, e] = s[1]
  const [c0, f0] = s[2]
  return [a, b, c0 - a * cu - b * cv, d, e, f0 - d * cu - e * cv]
}

/** The thin-plate spline's radial term, r² ln r, from the squared distance. */
const radial = (r2: number): number => (r2 === 0 ? 0 : 0.5 * r2 * Math.log(r2))

/**
 * A thin-plate spline through pairs [from, to]: exact at every pair, as smooth as can be between them, affine far from
 * them (a scan's own local distortions, as GIS tools rubber-sheet a hand-drawn survey). Null when the points lie in a
 * line. Coordinates are centred and scaled to about 1 first, for a well-conditioned system.
 */
function spline(from: Pt[], to: Pt[]): ((p: Pt) => Pt) | null {
  const n = from.length
  const cx = from.reduce((s, q) => s + q[0], 0) / n
  const cy = from.reduce((s, q) => s + q[1], 0) / n
  const sc = Math.max(...from.map(q => Math.hypot(q[0] - cx, q[1] - cy)), 1e-9)
  const q = from.map(([x, y]): Pt => [(x - cx) / sc, (y - cy) / sc])
  const m: number[][] = []
  for (let i = 0; i < n + 3; i++) m.push(new Array<number>(n + 3).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      m[i][j] = radial((q[i][0] - q[j][0]) ** 2 + (q[i][1] - q[j][1]) ** 2)
    }
    m[i][n] = m[n][i] = 1
    m[i][n + 1] = m[n + 1][i] = q[i][0]
    m[i][n + 2] = m[n + 2][i] = q[i][1]
  }
  const rhs = [...to.map(t => [t[0], t[1]]), [0, 0], [0, 0], [0, 0]]
  const w = solve(m, rhs)
  if (!w) return null
  return ([x, y]) => {
    const px = (x - cx) / sc
    const py = (y - cy) / sc
    let ox = w[n][0] + w[n + 1][0] * px + w[n + 2][0] * py
    let oz = w[n][1] + w[n + 1][1] * px + w[n + 2][1] * py
    for (let i = 0; i < n; i++) {
      const k = radial((px - q[i][0]) ** 2 + (py - q[i][1]) ** 2)
      ox += w[i][0] * k
      oz += w[i][1] * k
    }
    return [ox, oz]
  }
}

/** A placement from an affine map (none: a placement that cannot be inverted has no way back). */
function affinePlacement(t: Affine): Pick<ScanFit, 'toFrame' | 'toImage'> {
  const back = invert(t)
  return { toFrame: (u, v) => apply(t, u, v), toImage: (x, z) => (back ? apply(back, x, z) : null) }
}

/** The map of pixels to frame points through a set of points: affine through three, a spline through more. */
function through(points: ControlPoint[], back = true): Pick<ScanFit, 'toFrame' | 'toImage'> | null {
  if (points.length === 3) {
    const t = leastSquares(points)
    return t ? affinePlacement(t) : null
  }
  const px = points.map(([u, v]): Pt => [u, v])
  const fr = points.map(([, , x, z]): Pt => [x, z])
  const fwd = spline(px, fr)
  if (!fwd) return null
  if (!back) return { toFrame: (u, v) => fwd([u, v]), toImage: () => null }
  // the way back: the forward spline inverted, from a first guess (a spline the other way, or the affine fit's)
  const guessSpline = spline(fr, px)
  const ls = leastSquares(points)
  const lsBack = ls ? invert(ls) : null
  return {
    toFrame: (u, v) => fwd([u, v]),
    toImage: (x, z) => {
      const g = guessSpline ? guessSpline([x, z]) : lsBack ? apply(lsBack, x, z) : null
      return g ? inverse(fwd, x, z, g) : null
    },
  }
}

/**
 * The pixel a map of pixels to frame points takes to (x, z), by Newton's method from a guess: exact to a thousandth
 * of a pixel, so a point clicked on the drawn scan is the pixel drawn there. Null when it does not converge (a fold).
 */
function inverse(f: (p: Pt) => Pt, x: number, z: number, guess: Pt): Pt | null {
  let [u, v] = guess
  const h = 0.5 // px: the step of the differences
  for (let k = 0; k < 40; k++) {
    const [fx, fz] = f([u, v])
    const ex = fx - x
    const ez = fz - z
    // the Jacobian by central differences
    const [ax, az] = f([u + h, v])
    const [bx, bz] = f([u - h, v])
    const [cx, cz] = f([u, v + h])
    const [dx, dz] = f([u, v - h])
    const j11 = (ax - bx) / (2 * h)
    const j21 = (az - bz) / (2 * h)
    const j12 = (cx - dx) / (2 * h)
    const j22 = (cz - dz) / (2 * h)
    const det = j11 * j22 - j12 * j21
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
    const du = (j22 * ex - j12 * ez) / det
    const dv = (j11 * ez - j21 * ex) / det
    u -= du
    v -= dv
    if (Math.hypot(du, dv) < 1e-3) return [u, v]
  }
  return null
}

/** Whether a new control point lands on an existing one: within a pixel of its pixel, or a metre of its place. */
export function nearPoint(points: ControlPoint[], p: ControlPoint): number {
  return points.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1 || Math.hypot(q[2] - p[2], q[3] - p[3]) < 1)
}

/**
 * A scan's placement from its control points: none, the image (w × h pixels) over the map's extent, its aspect kept;
 * one, that moved onto its point; two, a similarity; three, the affine map through them; four or more, a thin-plate
 * spline through them (exact at each; a scan's local distortions bent out), each point's residual where the others
 * alone put it. Points in a line are placed by the first two.
 */
export function fitScan(
  points: ControlPoint[],
  w: number,
  h: number,
  extent: { w: number; h: number; x?: number; z?: number },
): ScanFit {
  const s = Math.min(extent.w / w, extent.h / h)
  // over the extent (in the frame: the map's as its piece reads it), centred on it, north up
  const cx = extent.x ?? 0
  const cz = extent.z ?? 0
  let t: Affine = [s, 0, cx - (w * s) / 2, 0, -s, cz + (h * s) / 2]
  const exact = (how: ScanFit['how'], a: Affine, problem: string | null = null): ScanFit => ({
    ...affinePlacement(a),
    how,
    residuals: points.map(([u, v, x, z]) => {
      const [px, pz] = apply(a, u, v)
      return Math.hypot(px - x, pz - z)
    }),
    rms: null,
    // two points on one place: the image shrunk to a point, which no click lands on
    problem: problem ?? (invert(a) ? null : 'the points put the image on a line or a point: no click lands on it'),
  })
  if (points.length === 0) return exact('extent', t)
  if (points.length === 1) {
    const [u, v, x, z] = points[0]
    const [px, pz] = apply(t, u, v)
    t = [t[0], t[1], t[2] + x - px, t[3], t[4], t[5] + z - pz]
    return exact('moved', t)
  }
  const sim = similarity(points)
  if (points.length === 2) {
    return sim ? exact('similarity', sim) : exact('extent', t, 'the two points are on one pixel: over the map')
  }
  const fit = through(points)
  if (!fit) {
    // two points on one pixel or one place: no spline goes through both; the affine fit of them all still holds
    const ls = leastSquares(points)
    if (ls && points.some((p, k) => nearPoint(points.slice(0, k), p) >= 0)) {
      return exact('affine', ls, 'two points on one pixel or one place: an affine fit of them all; remove one')
    }
    return exact('similarity', sim ?? t, 'the points lie in a line: placed by the first two')
  }
  // a placement with no way back (points on one place: the image folded to a line or a point) takes no clicks
  const mid = fit.toFrame(w / 2, h / 2)
  const folded = !fit.toImage(mid[0], mid[1])
    ? 'the points put the image on a line or a point: no click lands on it'
    : null
  if (points.length === 3) return { ...fit, how: 'affine', residuals: [0, 0, 0], rms: null, problem: folded }
  // the image's own error at each point: where the other points alone put its pixel
  const residuals = points.map(([u, v, x, z], k) => {
    const rest = through(
      points.filter((_, i) => i !== k),
      false,
    )
    if (!rest) return NaN
    const [px, pz] = rest.toFrame(u, v)
    return Math.hypot(px - x, pz - z)
  })
  const known = residuals.filter(Number.isFinite)
  const rms = known.length ? Math.sqrt(known.reduce((a, r) => a + r * r, 0) / known.length) : null
  return { ...fit, how: 'spline', residuals, rms, problem: folded }
}

/** Where a scan shows on the map: an area (none: the whole extent), and how a map point reads its frame. */
export interface Piece {
  id: string | null // the relief.dem feature, or none for a scan in the map's own frame
  area: Pt[][] | null
  /** How a map point reads its file: shifted, and scaled (decision 0070); none, the map point is the frame point. */
  place: DemPlace
  /** Cut from the scan's frame's file (it shows the scan); another file's piece hides what lies under it. */
  own: boolean
}

/**
 * The relief pieces a scan lies under, in painting order (priority, then id, as apply paints them: the last on top):
 * each relief.dem piece, those of its frame's dem source showing it, the others hiding it where they lie on top; for
 * a scan in the map's own frame, the whole map unmoved. A piece that cannot be read (an unknown preset) is left out.
 */
export function scanPieces(map: MapFile, cat: Catalogue, scan: Source): Piece[] {
  if (scan.frame === undefined) return [{ id: null, area: null, place: { x: 0, z: 0, k: 1 }, own: true }]
  const out: { p: Piece; priority: number }[] = []
  for (const f of map.features) {
    let r: ReturnType<typeof resolve>
    try {
      r = resolve(f as Feature, map, cat)
    } catch {
      continue
    }
    if (!isDemKind(r.kind)) continue
    const own = f.source === scan.frame
    out.push({ p: { id: f.id, area: f.area ?? null, place: demPlace(r.attrs), own }, priority: r.priority })
  }
  out.sort((a, b) => a.priority - b.priority || (a.p.id! < b.p.id! ? -1 : a.p.id! > b.p.id! ? 1 : 0))
  return out.map(o => o.p)
}

/** Whether a map point lies in a piece: inside its outer ring and none of its holes (no area: everywhere). */
export function inPiece(piece: Piece, x: number, z: number): boolean {
  if (!piece.area) return true
  return inRing(piece.area[0], [x, z]) && !piece.area.slice(1).some(h => inRing(h, [x, z]))
}

/** The frame point a map point shows: through the piece on top there, or null where none of the scan's is on top. */
export function frameAt(pieces: Piece[], x: number, z: number): Pt | null {
  const p = topAt(pieces, x, z)
  return p?.own ? toFile(p.place, x, z) : null
}
/** The piece on top at a map point (the last in painting order that holds it), or null. */
export function topAt(pieces: Piece[], x: number, z: number): Piece | null {
  for (let k = pieces.length - 1; k >= 0; k--) if (inPiece(pieces[k], x, z)) return pieces[k]
  return null
}

const MESH = 64 // the mesh's cells along each side of the image: its spline bends no more within one

/** A scan as a mesh for the GPU: each node's place in the frame (x, z), its texture coordinate (u / w, v / h). */
export interface ScanMesh {
  pos: Float32Array
  uv: Float32Array
  index: Uint32Array
}
/**
 * The mesh a scan (w × h px) is drawn with: an n × n grid over the image, each node at its place in the frame. The
 * view's perspective is the GPU's (exact, and the near limit clipped there); the grid follows the placement's bending,
 * which is smooth over a cell.
 */
export function scanMesh(toFrame: (u: number, v: number) => Pt, w: number, h: number, n = MESH): ScanMesh {
  const pos = new Float32Array((n + 1) * (n + 1) * 2)
  const uv = new Float32Array((n + 1) * (n + 1) * 2)
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = (j * (n + 1) + i) * 2
      const [x, z] = toFrame((w * i) / n, (h * j) / n)
      pos[k] = x
      pos[k + 1] = z
      uv[k] = i / n
      uv[k + 1] = j / n
    }
  }
  const index = new Uint32Array(n * n * 6)
  let t = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i
      const b = a + 1
      const c = a + n + 1
      const d = c + 1
      index.set([a, b, c, b, d, c], t)
      t += 6
    }
  }
  return { pos, uv, index }
}
