// The campaign's models (src/campaign/, docs/proposals/campaign.md) against the proposal's own numbers and cases:
// march speeds and columns, the exact moment of contact, the courier caught on its road, the help that arrives
// about 9 hours after a morning call, the fastest road, and the timeline's order.
import { describe, it, expect } from 'vitest'
import { battleFor, firstContact } from '../src/campaign/contact.ts'
import { help, ride } from '../src/campaign/courier.ts'
import { arrival, columnLength, dayMarch, marchSpeed } from '../src/campaign/march.ts'
import { fastestRoute, routePoints, type RoadGraph } from '../src/campaign/roads.ts'
import { Timeline } from '../src/campaign/timeline.ts'
import { positionAt, standing, walk } from '../src/campaign/track.ts'
import { napoleonicCampaign as rules } from '../src/rulesets/napoleonic-campaign.ts'

/** A straight road along x from x0 to x1 metres, at z = 0. */
const along = (x0: number, x1: number) => [
  { x: x0, z: 0 },
  { x: x1, z: 0 },
]

describe('the march', () => {
  it('marches a day of 22.5 km, forced 35 km, a large corps slower', () => {
    expect(dayMarch(rules, 'march', 6) / 1000).toBeCloseTo(22.5, 6)
    expect(dayMarch(rules, 'forced', 6) / 1000).toBeCloseTo(35, 6)
    // nine units: three past the full-speed six, 9 % slower
    expect(marchSpeed(rules, 'march', 9)).toBeCloseTo(marchSpeed(rules, 'march', 6) * 0.91, 9)
    // never slower than the cap
    expect(marchSpeed(rules, 'march', 40)).toBeCloseTo(marchSpeed(rules, 'march', 6) * 0.8, 9)
  })

  it('brings the tail a column’s length after the head', () => {
    const { headMin, tailMin } = arrival(rules, 'march', 6, 9000, 0)
    // 9 km at 3 km/h: 3 hours; a column of 6 units, 12 km: 4 hours more
    expect(headMin).toBeCloseTo(180, 9)
    expect(tailMin - headMin).toBeCloseTo((columnLength(rules, 6) / 3000) * 60, 9)
  })
})

describe('contact', () => {
  it('finds the minute two corps closing on one road come within the radius', () => {
    // 30 km apart, each at 3 km/h toward the other: they close at 6 km/h, from 30 km to 1.5 km in 4.75 hours
    const speed = marchSpeed(rules, 'march', 6)
    const a = walk(along(0, 30000), 0, speed)
    const b = walk(along(30000, 0), 0, speed)
    expect(firstContact(a, b, rules.contactRadiusM, 0, 1440)).toBeCloseTo(285, 9)
  })

  it('finds no contact for corps on parallel roads further apart than the radius', () => {
    const speed = marchSpeed(rules, 'march', 6)
    const a = walk(along(0, 30000), 0, speed)
    const b = walk(
      [
        { x: 30000, z: 2000 },
        { x: 0, z: 2000 },
      ],
      0,
      speed,
    )
    expect(firstContact(a, b, rules.contactRadiusM, 0, 1440)).toBeNull()
  })

  it('finds contact already made at the start', () => {
    expect(firstContact(standing(0, 0), standing(1000, 0), 1500, 60, 120)).toBe(60)
  })

  it('joins a battle within its zone, starts one beyond', () => {
    const battles = [
      { x: 0, z: 0 },
      { x: 20000, z: 0 },
    ]
    // Plancenoit, about 3 km from the main fight: part of it
    expect(battleFor(battles, 3000, 0, rules.battleZoneM)).toBe(0)
    // Wavre, 15 km away: a battle of its own
    expect(battleFor(battles, 0, 15000, rules.battleZoneM)).toBe(-1)
  })
})

describe('couriers and help', () => {
  it('delivers a call 25 km away in about two hours; the help arrives about 9 hours after the call', () => {
    const r = ride(rules, along(0, 25000), 0, [])
    expect(r.delivered).toBe(true)
    // 25 km at 12 km/h: 125 minutes
    expect(r.atMin).toBeCloseTo(125, 9)
    // under way in an hour, then 25 km at a forced 4 km/h: 6 h 15; the head at 9 h 20 after the call
    const { headMin } = help(rules, 6, r.atMin, 25000)
    expect(headMin).toBeCloseTo(560, 9)
    expect(headMin / 60).toBeGreaterThan(9)
    expect(headMin / 60).toBeLessThan(10)
  })

  it('loses a courier whose road crosses an enemy’s zone, where it enters it', () => {
    // an enemy corps standing on the road at 10 km: the courier enters its 1.5 km zone at 8.5 km, at 42.5 minutes
    const r = ride(rules, along(0, 25000), 0, [standing(30000, 5000), standing(10000, 0)])
    expect(r.delivered).toBe(false)
    if (r.delivered) return
    expect(r.by).toBe(1)
    expect(r.atMin).toBeCloseTo(42.5, 9)
    expect(r.x).toBeCloseTo(8500, 6)
  })

  it('is caught by a moving enemy where their tracks meet', () => {
    // an enemy marching across the courier's road, reaching it at 6 km after 60 minutes
    const enemy = walk(
      [
        { x: 6000, z: -3000 },
        { x: 6000, z: 3000 },
      ],
      0,
      100,
    )
    const r = ride(rules, along(0, 25000), 0, [enemy])
    expect(r.delivered).toBe(false)
    if (r.delivered) return
    const courier = positionAt(walk(along(0, 25000), 0, 200), r.atMin)
    const them = positionAt(enemy, r.atMin)
    expect(Math.hypot(courier.x - them.x, courier.z - them.z)).toBeCloseTo(rules.contactRadiusM, 6)
  })
})

describe('the roads', () => {
  // four towns in a square, a long diagonal 0–2 and the two ways round
  const graph: RoadGraph = {
    towns: 4,
    roads: [
      {
        a: 0,
        b: 1,
        lengthM: 10000,
        points: [
          { x: 0, z: 0 },
          { x: 10000, z: 0 },
        ],
      },
      {
        a: 1,
        b: 2,
        lengthM: 10000,
        points: [
          { x: 10000, z: 0 },
          { x: 10000, z: 10000 },
        ],
      },
      {
        a: 0,
        b: 3,
        lengthM: 10000,
        points: [
          { x: 0, z: 0 },
          { x: 0, z: 10000 },
        ],
      },
      {
        a: 3,
        b: 2,
        lengthM: 10000,
        points: [
          { x: 0, z: 10000 },
          { x: 10000, z: 10000 },
        ],
      },
      {
        a: 0,
        b: 2,
        lengthM: 25000,
        points: [
          { x: 0, z: 0 },
          { x: 10000, z: 10000 },
        ],
      },
    ],
  }

  it('takes the shortest way, the lower-numbered one on a tie', () => {
    const route = fastestRoute(graph, 0, 2)
    expect(route).not.toBeNull()
    expect(route!.lengthM).toBe(20000)
    expect(route!.towns).toEqual([0, 1, 2])
    expect(routePoints(graph, route!)).toEqual([
      { x: 0, z: 0 },
      { x: 10000, z: 0 },
      { x: 10000, z: 10000 },
    ])
  })

  it('walks a road backwards when the route takes it from its far end', () => {
    const route = fastestRoute(graph, 2, 0)!
    expect(routePoints(graph, route)[0]).toEqual({ x: 10000, z: 10000 })
  })

  it('finds no route to a town no road reaches', () => {
    expect(fastestRoute({ towns: 2, roads: [] }, 0, 1)).toBeNull()
  })
})

describe('the timeline', () => {
  it('plays events by time, then by id, and the events they queue', () => {
    const t = new Timeline<string>()
    t.push({ t: 60, id: 3, data: 'c' })
    t.push({ t: 30, id: 9, data: 'a' })
    t.push({ t: 60, id: 1, data: 'b' })
    t.push({ t: 900, id: 2, data: 'late' })
    const played: string[] = []
    t.play(600, (e, tl) => {
      played.push(e.data)
      if (e.data === 'a') tl.push({ t: 45, id: 5, data: 'queued' })
    })
    expect(played).toEqual(['a', 'queued', 'b', 'c'])
    expect(t.size).toBe(1)
  })
})
