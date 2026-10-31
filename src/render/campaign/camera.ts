// The campaign map's camera (docs/systems/campaign-map.md; decision 0093), the prototype's: north up, tilted 30° off
// straight down far out and 45° at the closest zoom, never inside a mountain. Pure: the view places its Babylon camera
// from it (src/render/campaign/view.ts).

/** Where the camera looks: its target on the map (km, x east, z north) and its distance from it (km). */
export interface CampaignView {
  x: number
  z: number
  dist: number
}

// the camera's distance, km, closest and farthest; its tilt off straight down, degrees, far and close
export const DIST_MIN = 30
export const DIST_MAX = 1300
export const TILT_FAR = 30
export const TILT_NEAR = 45
// the distance from which the tilt starts to rise toward TILT_NEAR, km
const TILT_FROM = 600
// how far above the raised ground under its target the camera stays at least, km
const CLEARANCE = 15

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Smoothstep from a to b. */
export function sstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** The camera's tilt off straight down for a distance (km), in radians: TILT_FAR far out, TILT_NEAR at the closest. */
export function tiltFor(dist: number): number {
  const t = sstep(Math.log(TILT_FROM), Math.log(DIST_MIN), Math.log(dist))
  return ((TILT_FAR + (TILT_NEAR - TILT_FAR) * t) * Math.PI) / 180
}

/**
 * The view kept on the map: its distance within DIST_MIN..DIST_MAX, its target within the map (`halfW`, `halfH` km
 * either side of the centre), and the camera at least CLEARANCE km above `rise` (the raised ground under the target,
 * km).
 */
export function clampView(view: CampaignView, halfW: number, halfH: number, rise: number): CampaignView {
  const x = clamp(view.x, -halfW, halfW)
  const z = clamp(view.z, -halfH, halfH)
  let dist = clamp(view.dist, DIST_MIN, DIST_MAX)
  dist = Math.max(dist, (rise + CLEARANCE) / Math.cos(tiltFor(dist)))
  return { x, z, dist }
}

/** The camera's position (km) for a view: south of its target by the tilt, north up. */
export function cameraPosition(view: CampaignView): [number, number, number] {
  const tilt = tiltFor(view.dist)
  return [view.x, view.dist * Math.cos(tilt), view.z - view.dist * Math.sin(tilt)]
}

/** Where a ray from `origin` along `dir` meets the plane y = 0, as [x, z], or null when it does not go down. */
export function groundHit(origin: [number, number, number], dir: [number, number, number]): [number, number] | null {
  if (dir[1] >= -1e-6) return null
  const t = -origin[1] / dir[1]
  return [origin[0] + dir[0] * t, origin[2] + dir[2] * t]
}
