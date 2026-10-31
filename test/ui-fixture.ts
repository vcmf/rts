// A small roster for the front menu's tests: two armies, three commanders, five regiments, made-up names (the
// interface code is era-generic, decision 0015, so its tests need no real ones).
import { ROSTER_VERSION, type Commander, type Regiment, type Roster } from '../src/ui/roster.ts'

const commander = (nation: string, id: string, life = 'a life', likeness = 'a source'): Commander => ({
  id: `${nation}/${id}`,
  nation,
  name: `Commander ${id}`,
  role: 'General',
  life,
  likeness,
  image: `${nation}/${id}.jpg`,
})

const regiment = (nation: string, no: string, arm: string): Regiment => ({
  id: `${nation}/${no}-${arm}`,
  nation,
  no,
  name: `Regiment ${no}`,
  detail: `${arm} of ${nation}`,
  arm,
  image: `${nation}/${no}-${arm}.jpg`,
})

/** A fresh roster each call, so a test may break it. */
export function fixtureRoster(): Roster {
  return {
    version: ROSTER_VERSION,
    nations: [
      { id: 'north', name: 'North', native: 'Nord', colour: '#112233' },
      { id: 'south', name: 'South', native: 'Süd', colour: '#445566' },
    ],
    arms: ['foot', 'horse', 'guns'],
    featured: { commanders: 'north/a', regiments: 'north/01-foot' },
    commanders: [commander('north', 'a'), commander('north', 'b', '', ''), commander('south', 'c')],
    regiments: [
      regiment('north', '01', 'foot'),
      regiment('north', '02', 'foot'),
      regiment('north', '03', 'horse'),
      regiment('south', '01', 'foot'),
      regiment('south', '02', 'guns'),
    ],
  }
}
