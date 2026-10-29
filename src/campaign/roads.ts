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

/** What a search needs of a graph, built once per graph: the roads touching each town, and each road's length. */
const prepared = new WeakMap<RoadGraph, { touching: number[][]; lengths: Float64Array }>()

function prepare(graph: RoadGraph) {
  let p = prepared.get(graph)
  if (!p) {
    const touching: number[][] = Array.from({ length: graph.towns }, () => [])
    graph.roads.forEach((r, k) => {
      touching[r.a].push(k)
      touching[r.b].push(k)
    })
    p = { touching, lengths: Float64Array.from(graph.roads, roadLength) }
    prepared.set(graph, p)
  }
  return p
}

/**
 * The shortest route by road from town `from` to town `to` (Dijkstra, a heap ordered by distance, then town index),
 * or null when no road leads there. Among routes of equal length, the one the search reaches first: the same for a
 * given graph on every machine (the graph is prepared once, then reused).
 */
export function fastestRoute(graph: RoadGraph, from: number, to: number): Route | null {
  const { touching, lengths } = prepare(graph)
  const dist = new Float64Array(graph.towns).fill(Infinity)
  const viaRoad = new Int32Array(graph.towns).fill(-1)
  const done = new Uint8Array(graph.towns)
  const queue = new Timeline<null>()
  dist[from] = 0
  queue.push({ t: 0, id: from, data: null })
  while (queue.size) {
    const town = queue.pop()!.id
    if (done[town]) continue
    done[town] = 1
    if (town === to) break
    for (const k of touching[town]) {
      const r = graph.roads[k]
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
    t = graph.roads[k].a === t ? graph.roads[k].b : graph.roads[k].a
    towns.push(t)
  }
  return { towns: towns.reverse(), roads: roads.reverse(), lengthM: dist[to] }
}
/** A route's line, from its first town to its last, each road's points in the direction travelled. */
export function routePoints(graph: RoadGraph, route: Route): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  route.roads.forEach((k, step) => {
    const r = graph.roads[k]
    const forward = r.a === route.towns[step]
    const pts = forward ? r.points : [...r.points].reverse()
    out.push(...(out.length ? pts.slice(1) : pts))
  })
  return out
}
