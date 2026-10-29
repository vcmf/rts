// The campaign's models (src/campaign/, docs/proposals/campaign.md) against the proposal's own numbers and cases:
// march speeds and columns, the exact moment of contact, the courier caught on its road, the help that arrives
// about 9 hours after a morning call, the fastest road, and the timeline's order.
import { describe, it, expect } from 'vitest'
import { battleFor, firstClosing, firstContact } from '../src/campaign/contact.ts'
import { help, inHelpRadius, ride } from '../src/campaign/courier.ts'
import { arrival, columnLength, dayMarch, marchSpeed } from '../src/campaign/march.ts'
import { fastestRoute, network, roadLength, routePoints, type RoadGraph } from '../src/campaign/roads.ts'
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

  it('finds contact already made at the start, even in a window of no length', () => {
    expect(firstContact(standing(0, 0), standing(1000, 0), 1500, 60, 120)).toBe(60)
    expect(firstContact(standing(0, 0), standing(10, 0), 1500, 5, 5)).toBe(5)
    expect(() => firstContact(standing(0, 0), standing(10, 0), 1500, 5, 4)).toThrow(RangeError)
  })

  it('finds contact for a pair just on the radius at a breakpoint', () => {
    // a corner of the route exactly 1.5 km from a standing enemy
    const courier = walk(
      [
        { x: 0, z: 1500 },
        { x: -3000, z: 1500 },
      ],
      10,
      200,
    )
    expect(firstContact(courier, standing(0, 0), 1500, 10, 100)).toBe(10)
  })

  it('tells closing from parting inside a zone', () => {
    const away = walk(along(0, -25000), 0, 200)
    const toward = walk(along(0, 25000), 0, 200)
    // the enemy 1 km east: riding west it parts from it, riding east it closes on it at once
    expect(firstClosing(away, standing(1000, 0), 1500, 0, 125)).toBeNull()
    expect(firstClosing(toward, standing(1000, 0), 1500, 0, 125)).toBe(0)
  })

  it('fits a battle zone in the largest battle map (6 km a side)', () => {
    expect(rules.battleZoneM).toBeLessThanOrEqual(3000)
  })

  it('joins the nearest battle when zones overlap', () => {
    const battles = [
      { x: 0, z: 0 },
      { x: 4000, z: 0 },
    ]
    expect(battleFor(battles, 2300, 0, rules.battleZoneM)).toBe(1)
    expect(battleFor(battles, 2000, 0, rules.battleZoneM)).toBe(0)
  })

  it('joins a battle within its zone, starts one beyond', () => {
    const battles = [
      { x: 0, z: 0 },
      { x: 20000, z: 0 },
    ]
    // a contact 2 km from the main fight, within its zone (2.5 km): part of it
    expect(battleFor(battles, 2000, 0, rules.battleZoneM)).toBe(0)
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
    const { headMin, strength } = help(rules, 6, r.atMin, 25000)
    expect(headMin).toBeCloseTo(560, 9)
    // 25 km of the forced march's 35 a day: 25/35 of its 15 % left behind
    expect(strength).toBeCloseTo(1 - 0.15 * (25 / 35), 9)
    // a full day's forced march or more: the whole 15 %
    expect(help(rules, 6, 0, 40000).strength).toBeCloseTo(0.85, 9)
    expect(inHelpRadius(rules, 25000)).toBe(true)
    expect(inHelpRadius(rules, 25001)).toBe(false)
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

  it('rides out of the battle it is sent from: the enemy there does not catch it as it leaves', () => {
    // the engaged corps at 0, the enemy it fights 1 km east; the call goes 25 km west
    const r = ride(rules, along(0, -25000), 0, [standing(1000, 0)])
    expect(r).toEqual({ delivered: true, atMin: 125 })
  })

  it('is caught at once if its road leads through the enemy its corps fights', () => {
    const r = ride(rules, along(0, 25000), 0, [standing(1000, 0)])
    expect(r).toEqual({ delivered: false, atMin: 0, by: 0, x: 0, z: 0 })
  })

  it('is caught by the enemy it rode away from if its road comes back into that enemy’s zone', () => {
    // west 5 km, then back east past the enemy at 1 km: out at 2.5 km from it (minute 7.5 on), back in at 2.5 km
    const route = [
      { x: 0, z: 0 },
      { x: -5000, z: 0 },
      { x: 25000, z: 0 },
    ]
    const r = ride(rules, route, 0, [standing(1000, 0)])
    expect(r.delivered).toBe(false)
    if (r.delivered) return
    // back in at x = -500 on the way east: 5 km west plus 4.5 km back, at 200 m a minute
    expect(r.atMin).toBeCloseTo(47.5, 6)
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
  // four towns in a square, the two ways round of 20 km each, and a long detour 0–2
  const graph: RoadGraph = {
    towns: 4,
    roads: [
      {
        a: 0,
        b: 1,
        points: [
          { x: 0, z: 0 },
          { x: 10000, z: 0 },
        ],
      },
      {
        a: 1,
        b: 2,
        points: [
          { x: 10000, z: 0 },
          { x: 10000, z: 10000 },
        ],
      },
      {
        a: 0,
        b: 3,
        points: [
          { x: 0, z: 0 },
          { x: 0, z: 10000 },
        ],
      },
      {
        a: 3,
        b: 2,
        points: [
          { x: 0, z: 10000 },
          { x: 10000, z: 10000 },
        ],
      },
      {
        a: 0,
        b: 2,
        // a detour by the south-east: about 31.6 km
        points: [
          { x: 0, z: 0 },
          { x: 15000, z: -5000 },
          { x: 10000, z: 10000 },
        ],
      },
    ],
  }

  const net = network(graph)

  it('measures a road by its line', () => {
    expect(roadLength(graph.roads[4])).toBeCloseTo(2 * Math.sqrt(15000 * 15000 + 5000 * 5000), 6)
  })

  it('takes the shortest way, the same one every time on a tie', () => {
    const route = fastestRoute(net, 0, 2)
    expect(route).not.toBeNull()
    expect(route!.lengthM).toBe(20000)
    expect(route!.towns).toEqual([0, 1, 2])
    expect(routePoints(net, route!)).toEqual([
      { x: 0, z: 0 },
      { x: 10000, z: 0 },
      { x: 10000, z: 10000 },
    ])
  })

  it('walks a road backwards when the route takes it from its far end', () => {
    const route = fastestRoute(net, 2, 0)!
    expect(routePoints(net, route)[0]).toEqual({ x: 10000, z: 10000 })
  })

  it('routes a town to itself with no road, and a courier there arrives at once', () => {
    const route = fastestRoute(net, 1, 1)!
    expect(route).toEqual({ towns: [1], roads: [], lengthM: 0 })
    expect(ride(rules, routePoints(net, route), 30, [standing(500, 0)])).toEqual({ delivered: true, atMin: 30 })
  })

  it('finds no route to a town no road reaches', () => {
    expect(fastestRoute(network({ towns: 2, roads: [] }), 0, 1)).toBeNull()
  })

  it('does not see later changes to the graph it was built from', () => {
    const g: RoadGraph = { towns: graph.towns, roads: [...graph.roads] }
    const n = network(g)
    g.roads.splice(0, 1)
    expect(fastestRoute(n, 0, 2)!.towns).toEqual([0, 1, 2])
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
