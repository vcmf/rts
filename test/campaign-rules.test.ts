// The campaign's models (src/campaign/, the campaign proposal (PR #234)) against the proposal's own numbers and cases:
// march speeds and columns, the exact moment of contact, the courier caught on its road, the help that arrives
// about 9 hours after a morning call, the fastest road, and the timeline's order.
import { describe, it, expect } from 'vitest'
import { answers, type Ally } from '../src/campaign/answers.ts'
import { battleFor, firstContact, zoneFor } from '../src/campaign/contact.ts'
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

  it('finds a pair already within the radius as they part, exactly', () => {
    // just inside the radius at the start, riding away fast
    const away = walk(along(1499.999999, 100000), 0, 5000)
    expect(firstContact(away, standing(0, 0), 1500, 0, 20)).toBe(0)
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

  it('fits a battle’s zone inside its map', () => {
    // the ruleset's 2.5 km on a 6 km map; half the side on a smaller one
    expect(zoneFor(rules, 6000)).toBe(2500)
    expect(zoneFor(rules, 4000)).toBe(2000)
    expect(zoneFor(rules, 2000)).toBe(1000)
  })

  it('joins the battle of a corps already fighting, wherever in the zone it stands', () => {
    // a corps fights at the edge of a 2.5 km zone; a fresh enemy comes within 1.5 km of it, outside the zone
    const battles = [{ x: 0, z: 0, zoneM: 2500 }]
    expect(battleFor(battles, 3900, 0)).toBe(-1)
    expect(battleFor(battles, 3900, 0, [0, -1])).toBe(0)
  })

  it('refuses a contact between two corps each held by a battle of its own', () => {
    const battles = [
      { x: 0, z: 0, zoneM: 2500 },
      { x: 5000, z: 0, zoneM: 2500 },
    ]
    expect(() => battleFor(battles, 2500, 0, [0, 1])).toThrow(RangeError)
    expect(battleFor(battles, 2500, 0, [1, 1])).toBe(1)
    expect(() => battleFor(battles, 2500, 0, [3])).toThrow(RangeError)
  })

  it('joins the nearest battle when zones overlap', () => {
    const battles = [
      { x: 0, z: 0, zoneM: 2500 },
      { x: 4000, z: 0, zoneM: 2500 },
    ]
    expect(battleFor(battles, 2300, 0)).toBe(1)
    expect(battleFor(battles, 2000, 0)).toBe(0)
  })

  it('joins a battle within its zone, starts one beyond', () => {
    const battles = [
      { x: 0, z: 0, zoneM: zoneFor(rules, 6000) },
      { x: 20000, z: 0, zoneM: zoneFor(rules, 3000) },
    ]
    // a contact 2 km from the main fight, within its zone (2.5 km): part of it
    expect(battleFor(battles, 2000, 0)).toBe(0)
    // 2 km from the small battle, whose zone is 1.5 km (a 3 km map): a battle of its own
    expect(battleFor(battles, 22000, 0)).toBe(-1)
    // Wavre, 15 km away: a battle of its own
    expect(battleFor(battles, 0, 15000)).toBe(-1)
  })
})

describe('couriers and help', () => {
  it('delivers a call 25 km away in about two hours', () => {
    // 25 km at 12 km/h: 125 minutes
    expect(ride(rules, along(0, 25000), 0, [])).toEqual({ delivered: true, atMin: 125 })
  })

  it('brings the help about 9 hours after the call', () => {
    // heard at 125 minutes, under way in an hour, then 25 km at a forced 4 km/h: 6 h 15; the head at 9 h 20
    const { headMin } = help(rules, 6, 125, 25000)
    expect(headMin).toBeCloseTo(560, 9)
  })

  it('leaves stragglers in proportion to the forced march made, a full day’s at most', () => {
    // 25 km of the forced march's 35 a day: 25/35 of its 15 % left behind
    expect(help(rules, 6, 0, 25000).strength).toBeCloseTo(1 - 0.15 * (25 / 35), 9)
    expect(help(rules, 6, 0, 40000).strength).toBeCloseTo(0.85, 9)
  })

  it('reaches allies within the help radius by road', () => {
    expect(inHelpRadius(rules, 25000)).toBe(true)
    expect(inHelpRadius(rules, 25001)).toBe(false)
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

  it('gets out of the battle it is sent from: the enemy its corps fights never catches it', () => {
    // the engaged corps at 0, the enemy it fights 1 km east (enemy 0, engaged); the call goes either way
    expect(ride(rules, along(0, -25000), 0, [standing(1000, 0)], [0])).toEqual({ delivered: true, atMin: 125 })
    expect(ride(rules, along(0, 25000), 0, [standing(1000, 0)], [0])).toEqual({ delivered: true, atMin: 125 })
  })

  it('is caught by another enemy whose zone it rides into, the engaged one at its side', () => {
    const r = ride(rules, along(0, 25000), 0, [standing(1000, 0), standing(10000, 0)], [0])
    expect(r.delivered).toBe(false)
    if (r.delivered) return
    expect(r.by).toBe(1)
    expect(r.atMin).toBeCloseTo(42.5, 9)
  })

  it('is caught at once by an enemy not engaged with its corps if it starts in its zone', () => {
    const r = ride(rules, along(0, -25000), 0, [standing(1000, 0)])
    expect(r).toEqual({ delivered: false, atMin: 0, by: 0, x: 0, z: 0 })
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

describe('who answers a call', () => {
  const free: Ally = { engaged: false, committed: false, onCall: { kind: 'always' } }

  it('answers if free, in reach and allowed by its standing orders', () => {
    expect(answers(rules, free, 20000)).toBe(true)
    expect(answers(rules, free, 30000)).toBe(false)
    expect(answers(rules, { ...free, engaged: true }, 5000)).toBe(false)
    expect(answers(rules, { ...free, committed: true }, 5000)).toBe(false)
    expect(answers(rules, { ...free, onCall: { kind: 'never' } }, 5000)).toBe(false)
    expect(answers(rules, { ...free, onCall: { kind: 'near', nearM: 10000 } }, 12000)).toBe(false)
    expect(answers(rules, { ...free, onCall: { kind: 'near', nearM: 10000 } }, 8000)).toBe(true)
  })

  it('ends a chain of calls in a day, however unlucky every helper is', () => {
    // the worst case: every corps within reach of every other, and each helper meets a new enemy on its way, fights
    // and calls for help in turn; every answer commits a corps, so the calls run out
    const n = 8
    const allies: Ally[] = Array.from({ length: n }, () => ({ ...free }))
    const day = new Timeline<{ caller: number }>()
    allies[0].engaged = true
    day.push({ t: 0, id: 0, data: { caller: 0 } })
    let battles = 1
    let nextId = 1
    day.play(1440, (call, tl) => {
      for (let k = 0; k < n; k++) {
        if (k === call.data.caller || !answers(rules, allies[k], 20000)) continue
        allies[k].committed = true
        // on its way it meets another enemy: a new battle, and a new call
        battles++
        tl.push({ t: call.t + 60, id: nextId++, data: { caller: k } })
      }
    })
    expect(day.size).toBe(0)
    expect(battles).toBeLessThanOrEqual(n)
  })
})

describe('the roads', () => {
  // four towns in a square, the two ways round of 20 km each, and a long detour 0–2
  const graph: RoadGraph = {
    towns: [
      { x: 0, z: 0 },
      { x: 10000, z: 0 },
      { x: 10000, z: 10000 },
      { x: 0, z: 10000 },
    ],
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

  it('routes a town to itself as its point; a courier there arrives at once, unless an enemy holds the town', () => {
    const route = fastestRoute(net, 1, 1)!
    expect(route).toEqual({ towns: [1], roads: [], lengthM: 0 })
    const here = routePoints(net, route)
    expect(here).toEqual([{ x: 10000, z: 0 }])
    expect(ride(rules, here, 30, [])).toEqual({ delivered: true, atMin: 30 })
    // an enemy 500 m off: caught there, unless it is the one the sender's corps is fighting
    expect(ride(rules, here, 30, [standing(10500, 0)]).delivered).toBe(false)
    expect(ride(rules, here, 30, [standing(10500, 0)], [0])).toEqual({ delivered: true, atMin: 30 })
  })

  it('sets a road’s ends on its towns, so routes join exactly', () => {
    const towns = [
      { x: 0, z: 0 },
      { x: 10000, z: 0 },
    ]
    const n = network({
      towns,
      roads: [
        {
          a: 0,
          b: 1,
          points: [
            { x: 0.6, z: 0 },
            { x: 10000, z: 0.8 },
          ],
        },
      ],
    })
    expect(n.roads[0].points).toEqual(towns)
    expect(n.lengths[0]).toBe(10000)
  })

  it('refuses a track whose times do not rise, and a walk at no speed', () => {
    const halted = [
      { t: 0, x: 0, z: 0 },
      { t: 10, x: 100, z: 0 },
      { t: 10, x: 200, z: 0 },
      { t: 20, x: 300, z: 0 },
    ]
    expect(() => positionAt(halted, 15)).toThrow(RangeError)
    expect(() => walk(along(0, 1000), 0, 0)).toThrow(RangeError)
  })

  it('refuses roads that do not meet at their towns', () => {
    const towns = [
      { x: 0, z: 0 },
      { x: 10000, z: 0 },
      { x: 20000, z: 3000 },
    ]
    const gap = {
      towns,
      roads: [
        { a: 0, b: 1, points: [towns[0], towns[1]] },
        // 3 km off town 1 at its start: a gap a route would bridge across country
        { a: 1, b: 2, points: [{ x: 10000, z: 3000 }, towns[2]] },
      ],
    }
    expect(() => network(gap)).toThrow(/does not run from town 1/)
  })

  it('finds no route to a town no road reaches', () => {
    expect(fastestRoute(network({ towns: [graph.towns[0], graph.towns[1]], roads: [] }), 0, 1)).toBeNull()
  })

  it('refuses a road to a town that does not exist, a road with no line, and a route from no town', () => {
    const towns = [graph.towns[0], graph.towns[1]]
    expect(() => network({ towns, roads: [{ a: 0, b: 5, points: [towns[0], towns[1]] }] })).toThrow(RangeError)
    expect(() => network({ towns, roads: [{ a: 0, b: 1, points: [] }] })).toThrow(RangeError)
    expect(() => fastestRoute(net, 9, 0)).toThrow(RangeError)
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
