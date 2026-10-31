// What grows where by the cover (src/look/nature.ts: the scatter's rule; the meadow map's growth and crops): pure, read
// by the page and by the tile worker for a moved tile's meadow map (G3c, src/look/tile-worker.ts).
import { COVER, coverAt, fieldAt, type CoverGrid } from './cover.ts'

const GRASSY_COVER: readonly number[] = [COVER.meadow, COVER.pasture, COVER.wood]
export const LINE_COVER: readonly number[] = [COVER.road, COVER.track, COVER.village]
export const TRODDEN: readonly number[] = [...LINE_COVER, COVER.bare]
// the models that keep to grass (coverAllows), and so never stand on a field (src/look/nature.ts's hidden rule skips
// them)
export const GRASSY_MODEL = /^(Grass|Flowers|Plant_1|Bush|TreeStump|WoodLog)/
// The point and eight points EDGE m around it must all pass: the shader paints a class edge pushed up to 1.5 m along
// each axis by the grain (coverWarp, src/look/shaders/macro.glsl), and the bake blends it over ±1 m, so an instance
// nearer an edge could stand on another painted class
export const EDGE = 2.5
export const AROUND = [
  [0, 0],
  ...Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]),
]
/** Whether a model may stand at a point by the cover: the point and the eight round it EDGE m out, each a class the
 *  model keeps to (the wheat to the wheat, the grassy models to grass, the rest off the ways and the village) */
export function coverAllows(cover: CoverGrid, model: string, x: number, z: number): boolean {
  const ok = (c: number) =>
    model === 'Wheat'
      ? c === COVER.wheat
      : GRASSY_MODEL.test(model)
        ? GRASSY_COVER.includes(c)
        : !LINE_COVER.includes(c)
  return AROUND.every(([dx, dz]) => ok(coverAt(cover, x + dx * EDGE, z + dz * EDGE)))
}

// the crops' sown classes (ploughed grows nothing)
const SOWN: readonly number[] = [COVER.wheat, COVER.green, COVER.stubble]

/**
 * The meadow's growth and the crops' over a cover (the meadow map's: src/look/meadow.ts): the grass where the old
 * tufts could stand (the cover's grassy classes and their edges; pasture grazed shorter), a crop on a sown class with
 * the same field EDGE round it, so a crop never stands on another painted field, nor runs across two. The rules off
 * the formation zones and the banks are the page's (src/look/nature.ts, growthAllowed)
 */
export function meadowGrowth(cover: CoverGrid): {
  growth: (x: number, z: number) => [number, number]
  crop: (x: number, z: number) => number
} {
  const growth = (x: number, z: number): [number, number] =>
    coverAllows(cover, 'Grass_Short', x, z) ? [1, coverAt(cover, x, z) === COVER.pasture ? 0.65 : 1] : [0, 0]
  const crop = (x: number, z: number) => {
    const c = coverAt(cover, x, z)
    const f = fieldAt(cover, x, z)
    return SOWN.includes(c) &&
      AROUND.every(
        ([dx, dz]) =>
          coverAt(cover, x + dx * EDGE, z + dz * EDGE) === c && fieldAt(cover, x + dx * EDGE, z + dz * EDGE) === f,
      )
      ? 1
      : 0
  }
  return { growth, crop }
}
