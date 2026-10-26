// Geographic helpers for the tools that place real data on a map (docs/plans/done/m7-editor.md M7e): the transverse
// Mercator the relief importer asks its service for (tools/dem-import.ts: centred on the crop, scale 1, true metres,
// north up), so a scan georeferenced in WGS 84 lands in the same frame as the heights. Tested in
// test/map-scan.test.ts against Snyder's worked example.

/** An ellipsoid: its semi-major axis (m) and its first eccentricity squared. */
export interface Ellipsoid {
  a: number
  e2: number
}
export const WGS84: Ellipsoid = { a: 6378137, e2: 0.00669437999014 }

const RAD = Math.PI / 180

/** The distance along the meridian from the equator to latitude phi (rad), m (Snyder 3-21). */
function meridian(phi: number, { a, e2 }: Ellipsoid): number {
  const e4 = e2 * e2
  const e6 = e4 * e2
  return (
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  )
}

/**
 * A transverse Mercator centred on (lat0, lon0), degrees, at scale k0 (1: true metres along the central meridian):
 * a point's [x east, z north] in metres from the centre (Snyder, Map Projections: A Working Manual, 8-9 to 8-11).
 * Good to millimetres within a few tens of kilometres of the centre.
 */
export function transverseMercator(
  lat0: number,
  lon0: number,
  k0 = 1,
  ell: Ellipsoid = WGS84,
): (lat: number, lon: number) => [number, number] {
  const ep2 = ell.e2 / (1 - ell.e2)
  const m0 = meridian(lat0 * RAD, ell)
  return (lat, lon) => {
    const phi = lat * RAD
    const sin = Math.sin(phi)
    const cos = Math.cos(phi)
    const tan = Math.tan(phi)
    const n = ell.a / Math.sqrt(1 - ell.e2 * sin * sin)
    const t = tan * tan
    const c = ep2 * cos * cos
    const A = (lon - lon0) * RAD * cos
    const x = k0 * n * (A + ((1 - t + c) * A ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * A ** 5) / 120)
    const z =
      k0 *
      (meridian(phi, ell) -
        m0 +
        n *
          tan *
          ((A * A) / 2 +
            ((5 - t + 9 * c + 4 * c * c) * A ** 4) / 24 +
            ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * A ** 6) / 720))
    return [x, z]
  }
}

/**
 * A box of latitude and longitude, degrees, that holds a w × h m box centred on (lat, lon) in its transverse Mercator,
 * with a margin (a share of each side) so its corners stay inside: [south, west, north, east].
 */
export function geoBox(
  lat: number,
  lon: number,
  w: number,
  h: number,
  margin = 0.05,
): [number, number, number, number] {
  const ell = WGS84
  const phi = lat * RAD
  const s = Math.sin(phi)
  // the radii of curvature along the meridian and across it
  const m = (ell.a * (1 - ell.e2)) / (1 - ell.e2 * s * s) ** 1.5
  const n = ell.a / Math.sqrt(1 - ell.e2 * s * s)
  const dLat = ((h / 2) * (1 + margin)) / m / RAD
  // the box's far edge is farther from the equator, where a degree of longitude is shorter
  const far = Math.cos((Math.abs(lat) + dLat) * RAD) / Math.cos(phi)
  const dLon = ((w / 2) * (1 + margin)) / (n * Math.cos(phi) * far) / RAD
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon]
}

/**
 * Control points for an image of a geographic box (an equirectangular WMS image, w × h pixels, north up): a grid of
 * k × k pixel corners, each with its place in the transverse Mercator centred on (lat0, lon0). [u, v, x, z], to cm.
 */
export function geoPoints(
  box: [number, number, number, number],
  w: number,
  h: number,
  lat0: number,
  lon0: number,
  k = 3,
): [number, number, number, number][] {
  const [south, west, north, east] = box
  const tm = transverseMercator(lat0, lon0)
  const out: [number, number, number, number][] = []
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < k; i++) {
      // pixels a tenth in from the edges, spread evenly
      const u = Math.round(w * (0.1 + (0.8 * i) / (k - 1)))
      const v = Math.round(h * (0.1 + (0.8 * j) / (k - 1)))
      // a pixel's coordinate as the page draws it: pixel k spans [k, k + 1], so u is the west edge of pixel u
      const lon = west + (u / w) * (east - west)
      const lat = north - (v / h) * (north - south)
      const [x, z] = tm(lat, lon)
      out.push([u, v, Math.round(x * 100) / 100, Math.round(z * 100) / 100])
    }
  }
  return out
}
