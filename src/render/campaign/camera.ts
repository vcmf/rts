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

/**
 * Where a ray from `origin` along `dir` (going down) first meets a surface whose height at (x, z) is `rise(x, z)`,
 * as [x, z], or null when it does not (it does not go down, or it starts under the ground): the ray walked in even
 * steps of at most `stepKm` along it from the height `top` (no ground above it) down to `bottom` (none below it), then
 * the step it crossed the ground in halved `halvings` times. Robust where a fixed point is not: on slopes steeper than
 * the ray, it still finds the first crossing, missing only a ridge thinner than a step.
 */
export function rayGround(
  origin: [number, number, number],
  dir: [number, number, number],
  rise: (x: number, z: number) => number,
  top: number,
  bottom: number,
  stepKm = 0.05,
  halvings = 12,
): [number, number] | null {
  if (dir[1] >= -1e-6) return null
  const at = (t: number): [number, number, number] => [
    origin[0] + dir[0] * t,
    origin[1] + dir[1] * t,
    origin[2] + dir[2] * t,
  ]
  const above = (t: number) => {
    const p = at(t)
    return p[1] > rise(p[0], p[2])
  }
  const t0 = Math.max(0, (top - origin[1]) / dir[1])
  const t1 = (bottom - origin[1]) / dir[1]
  if (!above(t0)) return null
  // the direction's length: the steps measured along the ray
  const length = Math.hypot(dir[0], dir[1], dir[2])
  const steps = Math.min(4000, Math.max(1, Math.ceil(((t1 - t0) * length) / stepKm)))
  let a = t0
  for (let k = 1; k <= steps; k++) {
    const b = t0 + ((t1 - t0) * k) / steps
    if (!above(b)) {
      let lo = a
      let hi = b
      for (let h = 0; h < halvings; h++) {
        const mid = (lo + hi) / 2
        if (above(mid)) lo = mid
        else hi = mid
      }
      const p = at((lo + hi) / 2)
      return [p[0], p[2]]
    }
    a = b
  }
  return null
}

/**
 * Whether a point on the ground (km: x, its height y, z) is seen from `eye`: the segment between them passes over the
 * ground, `rise(x, z)` sampled every `stepKm` along it (at most `most` samples), the last `nearKm` before the point
 * left out (its own ground, and the slope it stands on, are not in its way).
 */
export function seenFrom(
  eye: [number, number, number],
  point: [number, number, number],
  rise: (x: number, z: number) => number,
  stepKm = 0.1,
  nearKm = 0.5,
  most = 2000,
): boolean {
  const d = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]]
  const length = Math.hypot(d[0], d[1], d[2])
  if (length <= nearKm) return true
  const n = Math.min(most, Math.ceil(length / stepKm))
  const last = 1 - nearKm / length
  for (let k = 1; k < n; k++) {
    const t = (k / n) * last
    if (rise(eye[0] + d[0] * t, eye[2] + d[2] * t) > eye[1] + d[1] * t) return false
  }
  return true
}
