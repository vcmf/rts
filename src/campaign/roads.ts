// The campaign map's roads (docs/proposals/campaign.md, The road network): towns and crossroads are nodes, roads
// are edges with a length and a line. Armies and couriers move only along them; the fastest route between two
// towns is found here, its ties broken by index so it is the same on every machine.

/** A road between towns a and b (indices), its length in metres and its line (from a to b, in metres). */
export interface Road {
  a: number
  b: number
  lengthM: number
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

/**
 * The shortest route by road from town `from` to town `to` (Dijkstra), or null when no road leads there. Among
 * equally long routes, the one through the lower-numbered towns and roads, for every machine plays the same turn.
 */
export function fastestRoute(graph: RoadGraph, from: number, to: number): Route | null {
  const dist = new Float64Array(graph.towns).fill(Infinity)
  const viaRoad = new Int32Array(graph.towns).fill(-1)
  const done = new Uint8Array(graph.towns)
  const touching: number[][] = Array.from({ length: graph.towns }, () => [])
  graph.roads.forEach((r, k) => {
    touching[r.a].push(k)
    touching[r.b].push(k)
  })
  dist[from] = 0
  for (;;) {
    // the nearest town not done, the lowest index on a tie (the network is small: a scan is enough)
    let town = -1
    for (let k = 0; k < graph.towns; k++) {
      if (!done[k] && dist[k] < Infinity && (town < 0 || dist[k] < dist[town])) town = k
    }
    if (town < 0 || town === to) break
    done[town] = 1
    for (const k of touching[town]) {
      const r = graph.roads[k]
      const next = r.a === town ? r.b : r.a
      const d = dist[town] + r.lengthM
      if (d < dist[next]) {
        dist[next] = d
        viaRoad[next] = k
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
