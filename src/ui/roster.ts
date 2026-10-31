// The History roster (data/history/roster.json, written by tools/build-history-data.ts) and the queries the screens
// ask of it. Era-generic (decision 0015): nations, arms and people are data. docs/systems/front-menu.md.

/** An army: `colour` paints its swatches and its frames on hover (the armies own the interface's colour). */
export interface Nation {
  id: string
  name: string
  native: string
  colour: string
}

export interface Commander {
  id: string
  nation: string
  name: string
  role: string
  life: string
  likeness: string
  /** the thumbnail's path under data/history/ */
  image: string
}

export interface Regiment {
  id: string
  nation: string
  /** the card's number in its army's library, "01" … */
  no: string
  name: string
  detail: string
  arm: string
  image: string
}

export interface Roster {
  version: number
  nations: Nation[]
  arms: string[]
  featured: { commanders: string; regiments: string }
  commanders: Commander[]
  regiments: Regiment[]
}

export type Kind = 'commanders' | 'regiments'
export const KINDS: readonly Kind[] = ['commanders', 'regiments']
/** The arm filter that keeps every arm. */
export const ALL_ARMS = 'all'
export const ROSTER_VERSION = 1

/** How the screens name each kind: its title, and the noun its count takes ("75 portraits"). */
export const KIND_WORDS: Record<Kind, { name: string; noun: string }> = {
  commanders: { name: 'Commanders', noun: 'portraits' },
  regiments: { name: 'Regiments', noun: 'uniforms' },
}

export type Entry = Commander | Regiment

/** What a roster screen shows: one kind, one nation, one arm (or ALL_ARMS; commanders have none). */
export interface RosterQuery {
  kind: Kind
  nation: string
  arm: string
}

/** True when `entry` is a regiment (it has an arm). */
export function isRegiment(entry: Entry): entry is Regiment {
  return 'arm' in entry
}

/** The entries of `query`, in library order. */
export function entriesOf(roster: Roster, query: RosterQuery): Entry[] {
  const all: Entry[] = roster[query.kind]
  return all.filter(e => e.nation === query.nation && matchesArm(e, query.arm))
}

function matchesArm(entry: Entry, arm: string): boolean {
  return arm === ALL_ARMS || (isRegiment(entry) && entry.arm === arm)
}

/** How many entries of `kind` each nation has, in the roster's nation order. */
export function countByNation(roster: Roster, kind: Kind): { nation: Nation; count: number }[] {
  return roster.nations.map(nation => ({
    nation,
    count: entriesOf(roster, { kind, nation: nation.id, arm: ALL_ARMS }).length,
  }))
}

/** How many regiments of `nation` each arm has, ALL_ARMS first. */
export function countByArm(roster: Roster, nation: string): { arm: string; count: number }[] {
  return [ALL_ARMS, ...roster.arms].map(arm => ({
    arm,
    count: entriesOf(roster, { kind: 'regiments', nation, arm }).length,
  }))
}

/** The nation with `id`; undefined for an unknown one. */
export function nationOf(roster: Roster, id: string): Nation | undefined {
  return roster.nations.find(n => n.id === id)
}

/** The entry with roster id `id` of `kind`; undefined for an unknown one. */
export function entryById(roster: Roster, kind: Kind, id: string): Entry | undefined {
  const all: Entry[] = roster[kind]
  return all.find(e => e.id === id)
}

/** Problems with a roster (empty when sound): its version, unique ids, known nations and arms, images named. */
export function rosterProblems(roster: Roster): string[] {
  const problems: string[] = []
  if (roster.version !== ROSTER_VERSION) problems.push(`version ${roster.version}, expected ${ROSTER_VERSION}`)
  const nations = new Set(roster.nations.map(n => n.id))
  const arms = new Set(roster.arms)
  for (const kind of KINDS) {
    const seen = new Set<string>()
    const all: Entry[] = roster[kind]
    for (const e of all) {
      if (seen.has(e.id)) problems.push(`${kind}: ${e.id} twice`)
      seen.add(e.id)
      if (!nations.has(e.nation)) problems.push(`${kind}: ${e.id} of unknown nation ${e.nation}`)
      if (isRegiment(e) && !arms.has(e.arm)) problems.push(`${kind}: ${e.id} of unknown arm ${e.arm}`)
      if (!e.image) problems.push(`${kind}: ${e.id} has no image`)
    }
  }
  for (const kind of KINDS) {
    if (!entryById(roster, kind, roster.featured[kind])) {
      problems.push(`featured ${kind} ${roster.featured[kind]} not found`)
    }
  }
  return problems
}
