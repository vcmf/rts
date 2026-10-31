// Loading the History roster (data/history/roster.json, bundled by Vite), shared by the front menu and the specimen
// sheet: a page that drew an unsound roster would draw it wrong, so it fails loudly instead.
import ROSTER_URL from '../../data/history/roster.json?url'
import { rosterProblems, type Roster } from './roster.ts'

/** The roster, fetched and checked; throws on a failed fetch or an unsound roster. */
export async function loadRoster(): Promise<Roster> {
  const response = await fetch(ROSTER_URL)
  if (!response.ok) throw new Error(`interface: the roster did not load (${response.status} ${ROSTER_URL})`)
  const roster: Roster = await response.json()
  const problems = rosterProblems(roster)
  if (problems.length) throw new Error(`interface: unsound roster: ${problems.join('; ')}`)
  return roster
}
