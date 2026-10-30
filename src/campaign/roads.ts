// The campaign map's roads (docs/proposals/campaign.md, The road network): towns and crossroads are nodes, roads
// are edges with a line (their length is the line's). Armies and couriers move only along them; the fastest route
// between two towns is found here, the same on every machine.

import { Timeline } from './timeline.ts'

/** A road between towns a and b (indices), its line from a to b in metres; its length is its line's. */
export interface Road {
  a: number
  b: number
  points: { x: number; z: number }[]
}

/** The road network: `towns` nodes, the roads between them. */
export interface RoadGraph {
  towns: number
  roads: Road[]
}

/** A route: the towns it passes, in order, the roads it takes and its length. */
export interface Route {
  towns: number[]
  roads: number[]
  lengthM: number
}

/** A road's length in metres: its line's, so the route chosen and the time taken to walk it agree. */
export function roadLength(road: Road): number {
  let length = 0
  for (let k = 1; k < road.points.length; k++) {
    const dx = road.points[k].x - road.points[k - 1].x
    const dz = road.points[k].z - road.points[k - 1].z
    length += Math.sqrt(dx * dx + dz * dz)
  }
  return length
}

/**
 * A road network ready to search: the graph's roads copied (a later change to the graph does not reach it: build a
 * new network, so a replay that builds it fresh routes as the live turn did), the roads touching each town, and
 * each road's length.
 */
export interface Network {
  towns: number
  roads: Road[]
  touching: number[][]
  lengths: Float64Array
}

/** A network from a road graph. */
export function network(graph: RoadGraph): Network {
  graph.roads.forEach((r, k) => {
    const ok = (t: number) => Number.isInteger(t) && t >= 0 && t < graph.towns
    if (!ok(r.a) || !ok(r.b)) throw new RangeError(`road ${k}: towns ${r.a}–${r.b} not in 0..${graph.towns - 1}`)
  })
  const roads = graph.roads.map(r => ({ a: r.a, b: r.b, points: r.points.map(p => ({ x: p.x, z: p.z })) }))
  const touching: number[][] = Array.from({ length: graph.towns }, () => [])
  roads.forEach((r, k) => {
    touching[r.a].push(k)
    touching[r.b].push(k)
  })
  return { towns: graph.towns, roads, touching, lengths: Float64Array.from(roads, roadLength) }
}

/**
 * The shortest route by road from town `from` to town `to` (Dijkstra, a heap ordered by distance, then town index),
 * or null when no road leads there. Among routes of equal length, the one the search reaches first: the same for a
 * given network on every machine. Every road is taken at one speed: road kinds (high road, country road) come with
 * the theatre's data and the march (K3, K4).
 */
export function fastestRoute(net: Network, from: number, to: number): Route | null {
  const { touching, lengths } = net
  for (const t of [from, to]) {
    if (!Number.isInteger(t) || t < 0 || t >= net.towns) throw new RangeError(`fastestRoute: no town ${t}`)
  }
  const dist = new Float64Array(net.towns).fill(Infinity)
  const viaRoad = new Int32Array(net.towns).fill(-1)
  const done = new Uint8Array(net.towns)
  const queue = new Timeline<null>()
  dist[from] = 0
  queue.push({ t: 0, id: from, data: null })
  while (queue.size) {
    const town = queue.pop()!.id
    if (done[town]) continue
    done[town] = 1
    if (town === to) break
    for (const k of touching[town]) {
      const r = net.roads[k]
      const next = r.a === town ? r.b : r.a
      const d = dist[town] + lengths[k]
      if (d < dist[next]) {
        dist[next] = d
        viaRoad[next] = k
        queue.push({ t: d, id: next, data: null })
      }
    }
  }
  if (dist[to] === Infinity) return null
  const towns = [to]
  const roads: number[] = []
  for (let t = to; t !== from;) {
    const k = viaRoad[t]
    roads.push(k)
    t = net.roads[k].a === t ? net.roads[k].b : net.roads[k].a
    towns.push(t)
  }
  return { towns: towns.reverse(), roads: roads.reverse(), lengthM: dist[to] }
}

/** A route's line, from its first town to its last, each road's points in the direction travelled. */
export function routePoints(net: Network, route: Route): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  route.roads.forEach((k, step) => {
    const r = net.roads[k]
    const forward = r.a === route.towns[step]
    const n = r.points.length
    // a loop, not push(...points): a long traced road would pass the engine's limit on arguments
    for (let i = out.length ? 1 : 0; i < n; i++) out.push(r.points[forward ? i : n - 1 - i])
  })
  return out
}
