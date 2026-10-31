// The campaign map's ink (docs/plans/active/k2d-ink.md, K2d): the names over the map on a 2D canvas, the prototype's
// (prototypes/campaign-map.html, drawInk): the regions lettered across the land, the towns as dark blocks with their
// names, the rivers' names in italic along their courses; none overlapping (./labels.ts), none drawn where the relief
// hides it from the camera (./camera.ts seenFrom), all clipped to the map's frame. Redrawn when the view changes.
import { seenFrom } from './camera.ts'
import {
  nameSpots,
  Placement,
  regionStyle,
  riverNamed,
  riverNamePlace,
  riverShown,
  townFont,
  townMark,
  townsShown,
  turnedBox,
  type Box,
  type LabelsFile,
} from './labels.ts'
import type { CampaignMapView } from './view.ts'

const INK = '#2b2824'
const TOWN_INK = '#3a3630'
const RIVER_INK = '#24578a'
const REGION_INK = '#4a4238'
const HALO = 'rgba(246, 243, 235, 0.85)'
const SERIF = '"Instrument Serif", Georgia, serif'
// clip space w (the depth along the view, km) below which a point counts as behind the camera: lines are cut there
// before the perspective divide, which would flip them
const W_NEAR = 0.5
// a screen point counts as on the screen this far inside its edges, CSS pixels
const MARGIN = 20
// a town this far off the screen, CSS pixels, may still show its name on it
const OFF = 200

/** A clip-space point: x, y and w. */
type Clip = [number, number, number]

/** What a redraw drew, for the checks: the boxes placed, and each town shown at this zoom, seen or hidden. */
export interface InkDraw {
  // the time each part took, ms: the regions, the towns, the rivers' names
  ms: { regions: number; towns: number; rivers: number }
  // the names' boxes and the towns' marks
  names: Box[]
  marks: Box[]
  towns: { id: string; at: [number, number]; seen: boolean; named: boolean }[]
}

/** The ink over the map: draw() it for the view's camera. */
export class Ink {
  private readonly canvas: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D
  private readonly view: CampaignMapView
  private readonly labels: LabelsFile
  private readonly half: { x: number; z: number }
  private dpr = 1
  // each river's bounding box, metres (x0, z0, x1, z1)
  private readonly bounds: [number, number, number, number][]
  /** The last redraw's boxes and towns. */
  last: InkDraw = { ms: { regions: 0, towns: 0, rivers: 0 }, names: [], marks: [], towns: [] }
  // the screen's size in CSS pixels, read once a redraw (reading it takes the page's layout)
  private size: [number, number] = [1, 1]

  /** `half`: the frame's half size, metres. */
  constructor(canvas: HTMLCanvasElement, view: CampaignMapView, labels: LabelsFile, half: { x: number; z: number }) {
    this.canvas = canvas
    this.g = canvas.getContext('2d')!
    this.view = view
    this.labels = labels
    this.half = half
    this.bounds = labels.rivers.map(r => {
      const xs = r.p.filter((_, i) => i % 2 === 0)
      const zs = r.p.filter((_, i) => i % 2 === 1)
      return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
    })
    this.resize()
  }

  /** The canvas sized to the screen, at the screen's pixel ratio now (2 at most). Cleared: draw again after. */
  resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1)
    this.canvas.width = Math.round(innerWidth * this.dpr)
    this.canvas.height = Math.round(innerHeight * this.dpr)
  }

  /**
   * Whether a box on the map (metres), on the ground or as high as the relief goes (10 km), lies wholly off the
   * screen: its eight corners all past one edge of the view, or all behind the camera.
   */
  private offScreen([x0, z0, x1, z1]: [number, number, number, number]): boolean {
    const m = this.view.transform()
    const corners: Clip[] = []
    for (const x of [x0 / 1000, x1 / 1000]) {
      for (const z of [z0 / 1000, z1 / 1000]) {
        for (const y of [0, 10]) {
          corners.push([
            x * m[0] + y * m[4] + z * m[8] + m[12],
            x * m[1] + y * m[5] + z * m[9] + m[13],
            x * m[3] + y * m[7] + z * m[11] + m[15],
          ])
        }
      }
    }
    return (
      corners.every(c => c[2] < W_NEAR) ||
      corners.every(c => c[0] < -c[2]) ||
      corners.every(c => c[0] > c[2]) ||
      corners.every(c => c[1] < -c[2]) ||
      corners.every(c => c[1] > c[2])
    )
  }

  /** A map point (metres) in clip space, on the raised map. */
  private clip(x: number, z: number): Clip {
    return this.view.clipOf(x / 1000, z / 1000)
  }

  /** A clip-space point in front of the camera to CSS pixels. */
  private toScreen([cx, cy, cw]: Clip): [number, number] {
    const [w, h] = this.size
    return [(cx / cw + 1) * 0.5 * w, (0.5 - (cy / cw) * 0.5) * h]
  }

  /** The clip-space point where the segment a–b crosses w = W_NEAR. */
  private static nearCut(a: Clip, b: Clip): Clip {
    const t = (W_NEAR - a[2]) / (b[2] - a[2])
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, W_NEAR]
  }

  /**
   * A flat [x, z, ...] line in metres projected to the screen: its runs of screen points, cut where it passes behind
   * the camera, each point with the map point it stands for (a cut's, the last one in front).
   */
  private screenLine(p: number[]): { pts: [number, number][]; map: [number, number][] }[] {
    const runs: { pts: [number, number][]; map: [number, number][] }[] = []
    let run: { pts: [number, number][]; map: [number, number][] } = { pts: [], map: [] }
    let prev: Clip | null = null
    let prevMap: [number, number] = [0, 0]
    for (let k = 0; k < p.length; k += 2) {
      const c = this.clip(p[k], p[k + 1])
      const here: [number, number] = [p[k], p[k + 1]]
      const inFront = c[2] >= W_NEAR
      if (prev && inFront !== prev[2] >= W_NEAR) {
        run.pts.push(this.toScreen(Ink.nearCut(prev, c)))
        run.map.push(inFront ? here : prevMap)
        if (!inFront) {
          runs.push(run)
          run = { pts: [], map: [] }
        }
      }
      if (inFront) {
        run.pts.push(this.toScreen(c))
        run.map.push(here)
      }
      prev = c
      prevMap = here
    }
    if (run.pts.length) runs.push(run)
    return runs.filter(r => r.pts.length >= 2)
  }

  /** The frame, cut at the camera's near plane (Sutherland–Hodgman on w = W_NEAR), as screen points. */
  private frameOnScreen(): [number, number][] {
    const { x, z } = this.half
    const corners = [
      [-x, -z],
      [x, -z],
      [x, z],
      [-x, z],
    ].map(([a, b]) => this.clip(a, b))
    const out: [number, number][] = []
    corners.forEach((c, k) => {
      const prev = corners[(k + corners.length - 1) % corners.length]
      const inFront = c[2] >= W_NEAR
      if (inFront !== prev[2] >= W_NEAR) out.push(this.toScreen(Ink.nearCut(prev, c)))
      if (inFront) out.push(this.toScreen(c))
    })
    return out
  }

  /** Whether a map point (metres) is seen from the camera, the relief as drawn between them. */
  private seen(x: number, z: number): boolean {
    const rise = (a: number, b: number) => this.view.heightAt(a, b)
    const eye = this.view.eye()
    const point: [number, number, number] = [x / 1000, rise(x / 1000, z / 1000), z / 1000]
    const length = Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2])
    // at most 96 samples along the ray: every 100 m up close, coarser far out (where ridges are wider on screen)
    return seenFrom(eye, point, rise, Math.max(0.1, length / 96))
  }

  /** Whether a screen point lies on the screen, MARGIN inside its edges. */
  private inside([x, y]: [number, number]): boolean {
    const [w, h] = this.size
    return x > MARGIN && y > MARGIN && x < w - MARGIN && y < h - MARGIN
  }

  /** Text with a soft paper halo, so it reads over the relief and the print. */
  private haloText(text: string, x: number, y: number, colour: string) {
    const g = this.g
    g.lineJoin = 'round'
    g.strokeStyle = HALO
    g.lineWidth = 3
    g.strokeText(text, x, y)
    g.fillStyle = colour
    g.fillText(text, x, y)
  }

  /** Redraws the ink for the view's camera at `ppk` screen pixels a km; returns what it drew. */
  draw(ppk: number): InkDraw {
    const g = this.g
    this.view.refreshTransform()
    this.size = this.view.screenSize()
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    g.clearRect(0, 0, innerWidth, innerHeight)
    const placement = new Placement()
    const draw: InkDraw = {
      ms: { regions: 0, towns: 0, rivers: 0 },
      names: placement.names,
      marks: placement.marks,
      towns: [],
    }
    // the ink stops at the neatline, as the print does
    g.save()
    g.beginPath()
    this.frameOnScreen().forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.clip()
    let t = performance.now()
    const lap = () => {
      const now = performance.now()
      const ms = now - t
      t = now
      return ms
    }
    this.drawRegions(ppk)
    draw.ms.regions = lap()
    this.drawTowns(ppk, placement, draw)
    draw.ms.towns = lap()
    this.drawRiverNames(ppk, placement)
    draw.ms.rivers = lap()
    g.restore()
    this.last = draw
    return draw
  }

  /** The regions' names lettered across the land, anchored to the map, fading as the camera closes in. */
  private drawRegions(ppk: number) {
    const { alpha, px } = regionStyle(ppk)
    if (alpha <= 0.01) return
    const g = this.g
    g.font = `400 ${px}px ${SERIF}`
    g.letterSpacing = `${(px * 0.55).toFixed(1)}px`
    g.globalAlpha = alpha
    g.fillStyle = REGION_INK
    g.textAlign = 'center'
    const [w, h] = this.size
    for (const r of this.labels.regions) {
      const c = this.clip(r.x, r.z)
      if (c[2] < W_NEAR) continue
      const [sx, sy] = this.toScreen(c)
      // off the screen (its letters' reach beyond its edges): neither drawn nor tested
      const reach = px * r.name.length
      if (sx < -reach || sy < -reach || sx > w + reach || sy > h + reach || !this.seen(r.x, r.z)) continue
      g.save()
      g.translate(sx, sy)
      g.rotate((-r.angle * Math.PI) / 180)
      g.fillText(r.name, 0, px * 0.35)
      g.restore()
    }
    g.globalAlpha = 1
    g.letterSpacing = '0px'
    g.textAlign = 'left'
  }

  /** The towns shown at this zoom, the largest first: a dark block (a fortress ringed) and the name where it fits. */
  private drawTowns(ppk: number, placement: Placement, draw: InkDraw) {
    const g = this.g
    // the marks first, all of them, so no name is drawn over a town
    const drawn: {
      t: LabelsFile['towns'][number]
      sx: number
      sy: number
      s: number
      mark: Box
      entry: InkDraw['towns'][number]
    }[] = []
    for (const t of townsShown(this.labels.towns, ppk)) {
      const c = this.clip(t.x, t.z)
      if (c[2] < W_NEAR) continue
      const [sx, sy] = this.toScreen(c)
      // off the screen (a name's width beyond its edges): neither drawn nor tested
      const [w, h] = this.size
      if (sx < -OFF || sy < -OFF || sx > w + OFF || sy > h + OFF) continue
      const seen = this.seen(t.x, t.z)
      const entry = { id: t.id, at: [sx, sy] as [number, number], seen, named: false }
      draw.towns.push(entry)
      if (!seen) continue
      const s = townMark(t.size, ppk)
      const mark: Box = [sx - s, sy - s, 2 * s, 2 * s]
      placement.mark(mark)
      drawn.push({ t, sx, sy, s, mark, entry })
      g.fillStyle = INK
      g.fillRect(sx - s / 2, sy - s / 2, s, s)
      if (t.fort) {
        g.strokeStyle = INK
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(sx, sy - s * 1.15)
        g.lineTo(sx + s * 1.15, sy)
        g.lineTo(sx, sy + s * 1.15)
        g.lineTo(sx - s * 1.15, sy)
        g.closePath()
        g.stroke()
      }
    }
    // then the names, the largest towns first
    for (const { t, sx, sy, s, mark, entry } of drawn) {
      const { px, big, spacingEm } = townFont(t.size)
      g.font = `400 ${px}px ${SERIF}`
      g.letterSpacing = `${spacingEm}em`
      const text = big ? t.name.toUpperCase() : t.name
      const spots = nameSpots(sx, sy, s, g.measureText(text).width, px)
      const k = placement.take(
        spots.map(spot => spot.box),
        mark,
      )
      if (k >= 0) {
        this.haloText(text, spots[k].at[0], spots[k].at[1], big ? INK : TOWN_INK)
        entry.named = true
      }
    }
    g.letterSpacing = '0px'
  }

  /** The rivers' names in italic, once a river, along the middle of its longest run on screen, where seen and free. */
  private drawRiverNames(ppk: number, placement: Placement) {
    const g = this.g
    g.font = `italic 400 16px ${SERIF}`
    g.letterSpacing = '0.08em'
    // a name once, on the longest run of all the river's lines that carry it
    const best = new Map<string, { at: [number, number]; angle: number; length: number; map: [number, number] }>()
    for (const [k, r] of this.labels.rivers.entries()) {
      if (!riverShown(r.rank, ppk) || !riverNamed(r.rank, ppk) || this.offScreen(this.bounds[k])) continue
      const runs = this.screenLine(r.p)
      const place = riverNamePlace(
        runs.map(run => run.pts),
        p => this.inside(p),
      )
      if (!place || place.length <= (best.get(r.name)?.length ?? 0)) continue
      best.set(r.name, { ...place, map: runs[place.run].map[place.index] })
    }
    for (const [name, { at, angle, map }] of best) {
      if (!this.seen(map[0], map[1])) continue
      const w = g.measureText(name).width
      // the text as drawn: its baseline 5 px above the course, the glyphs and halo from 18 px above it to 1 px below
      if (placement.take([turnedBox(at, angle, w + 4, -18, 1)]) < 0) continue
      g.save()
      g.translate(at[0], at[1])
      g.rotate(angle)
      this.haloText(name, -w / 2, -5, RIVER_INK)
      g.restore()
    }
    g.letterSpacing = '0px'
  }
}
