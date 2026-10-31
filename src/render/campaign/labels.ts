// The campaign map's labels (docs/plans/active/k2d-ink.md, K2d): what the ink (./ink.ts) draws and where, the
// prototype's rules (prototypes/campaign-map.html, drawInk) as pure functions: the towns shown at a zoom, their marks
// and names, a placement that never lets two labels overlap, a river name's place on its course, the regions' fade.
// The labels' data is baked with the tiles (tools/campaign-tiles.ts, `labels.json`).

/** The labels' file: places in metres from the frame's centre (x east, z north). */
export interface LabelsFile {
  // size: 4 a capital, 3 a city, 2 a town, 1 a small town or a crossing
  towns: { id: string; name: string; size: number; fort: boolean; x: number; z: number }[]
  // angle: degrees, counter-clockwise from east
  regions: { name: string; angle: number; x: number; z: number }[]
  // the named rivers: rank from Natural Earth (smaller is larger), points [x, z, ...]
  rivers: { name: string; rank: number; p: number[] }[]
}

/** A screen box: x, y of its top left corner, width, height, in CSS pixels. */
export type Box = [x: number, y: number, w: number, h: number]

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Smoothstep from a to b. */
function sstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// the zoom (screen pixels per km) from which a town of each size is shown
const TOWN_SHOW: Record<number, number> = { 4: 0, 3: 0.75, 2: 1.3, 1: 2.2 }

/** The towns shown at a zoom (`ppk` screen pixels a km), the largest first (they take their places first). */
export function townsShown<T extends { size: number }>(towns: T[], ppk: number): T[] {
  return towns.filter(t => ppk >= (TOWN_SHOW[t.size] ?? Infinity)).sort((a, b) => b.size - a.size)
}

/** A town's mark: a square this many CSS pixels a side, larger with the town and a little with the zoom. */
export function townMark(size: number, ppk: number): number {
  return [0, 2.6, 3.4, 4.4, 5.6][size] * clamp(0.85 + ppk * 0.05, 0.85, 1.3)
}

/** A town's name: its font size in CSS pixels, in capitals and spaced for a city and a capital. */
export function townFont(size: number): { px: number; big: boolean; spacingEm: number } {
  const big = size >= 3
  return { px: big ? 15 + size * 1.5 : 13 + size, big, spacingEm: big ? 0.12 : 0.02 }
}

/**
 * The places tried for a town's name, in order (right of the mark, left, above, below): each the text's baseline
 * start and the box it takes, for a mark of `s` px at (sx, sy) and a name `w` px wide in a font of `px`.
 */
export function nameSpots(
  sx: number,
  sy: number,
  s: number,
  w: number,
  px: number,
): { at: [number, number]; box: Box }[] {
  const starts: [number, number][] = [
    [sx + s + 4, sy + px * 0.32],
    [sx - s - 4 - w, sy + px * 0.32],
    [sx - w / 2, sy - s - 5],
    // a pixel clear of the mark: touching it exactly, rounding may count as overlapping
    [sx - w / 2, sy + s + px * 0.8 + 1],
  ]
  return starts.map(([lx, ly]) => ({ at: [lx, ly], box: [lx - 2, ly - px * 0.8, w + 4, px * 1.05] }))
}

/** Whether two boxes overlap. */
export function overlaps(a: Box, b: Box): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]
}

/**
 * The labels placed so far: the towns' marks (placed first, all of them: two towns close together may touch) and the
 * names, each placed only where it overlaps no name and no mark.
 */
export class Placement {
  readonly marks: Box[] = []
  readonly names: Box[] = []

  /** A town's mark, which the names keep clear of. */
  mark(box: Box) {
    this.marks.push(box)
  }

  /** Whether a name may take `box` (it overlaps no name and no mark). */
  free(box: Box): boolean {
    return !this.names.some(b => overlaps(b, box)) && !this.marks.some(b => overlaps(b, box))
  }

  /** Takes the first of `boxes` free for a name, or none: its index (-1 for none). */
  take(boxes: Box[], own: Box | null = null): number {
    // a town's name may touch its own mark
    const k = boxes.findIndex(
      b => !this.names.some(n => overlaps(n, b)) && !this.marks.some(m => m !== own && overlaps(m, b)),
    )
    if (k >= 0) this.names.push(boxes[k])
    return k
  }
}

/** Whether a river of `rank` is drawn at a zoom (the prototype's: rank 4 and larger always, 6 from 0.6 px a km). */
export function riverShown(rank: number, ppk: number): boolean {
  return ppk >= (rank <= 4 ? 0 : rank <= 6 ? 0.6 : 1.4)
}

/** Whether a river of `rank` carries its name at a zoom: the large ones always, the others from 1.5 px a km. */
export function riverNamed(rank: number, ppk: number): boolean {
  return rank <= (ppk > 1.5 ? 8 : 4)
}

/**
 * Where a river's name goes: on the longest of its runs on screen (each a list of screen points), counting only the
 * points inside the screen's `inside` test, if that is longer than `least` px: the point nearest the middle of its
 * visible length (and its run and index there), and the course's angle there (radians, turned to read upright). Null
 * when no run is long enough.
 */
export function riverNamePlace(
  runs: [number, number][][],
  inside: (p: [number, number]) => boolean,
  least = 160,
): { at: [number, number]; angle: number; length: number; run: number; index: number } | null {
  let best: { pts: [number, number][]; length: number; run: number } | null = null
  for (const [run, pts] of runs.entries()) {
    let length = 0
    for (let i = 1; i < pts.length; i++) {
      if (inside(pts[i])) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    }
    if (length > least && length > (best?.length ?? 0)) best = { pts, length, run }
  }
  if (!best) return null
  const on = best.pts.filter(inside)
  const at = on[Math.floor(on.length / 2)]
  const k = best.pts.indexOf(at)
  const a = best.pts[Math.max(0, k - 2)]
  const b = best.pts[Math.min(best.pts.length - 1, k + 2)]
  let angle = Math.atan2(b[1] - a[1], b[0] - a[0])
  if (angle > Math.PI / 2) angle -= Math.PI
  if (angle < -Math.PI / 2) angle += Math.PI
  return { at, angle, length: best.length, run: best.run, index: k }
}

/** The regions' names at a zoom: their opacity (fading out as the camera closes in) and font size in CSS pixels. */
export function regionStyle(ppk: number): { alpha: number; px: number } {
  return { alpha: 0.5 * (1 - sstep(2.2, 4, ppk)), px: clamp(ppk * 22, 13, 46) }
}
