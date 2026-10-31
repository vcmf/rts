// The look page's battle switches (docs/plans/active/division-armies.md): which battle ?battle (or the old ?armies)
// asks for, and the panel's Battle select (its choices, the address it reloads). No imports: the page reads it at load,
// the battle itself (src/look/world/battle.ts) only with the armies.
import { bit } from '../switch.ts'

/** The battle the page asks for (src/look/main.ts): ?battle=<name> (bare: the default), or the old ?armies=<n>
 *  (n battalions a side of `legacy` figures) as the battle whose budget is nearest its figures; null: no armies. A
 *  name not among `names`, a count not 1 to 40, or both switches: a clear error */
export function battleChoice(
  q: URLSearchParams,
  budgets: Readonly<Record<string, number>>,
  def: string,
  legacy: number,
): string | null {
  const battle = q.get('battle')
  const armies = q.get('armies')
  const names = Object.keys(budgets)
  if (battle !== null && armies !== null) throw new Error('?battle and ?armies both given: ?battle alone (or ?armies)')
  if (battle !== null) {
    const name = battle === '' ? def : battle
    if (!Object.hasOwn(budgets, name)) throw new Error(`?battle must be one of ${names.join(', ')}, not ${battle}`)
    return name
  }
  if (armies === null) return null
  if (!(/^\d+$/.test(armies) && +armies >= 1 && +armies <= 40)) {
    throw new Error(`?armies must be 1 to 40 (old battalions a side, mapped onto ?battle), not ${armies}`)
  }
  const figures = +armies * legacy * 2
  return names.reduce((a, n) => (Math.abs(budgets[n] - figures) < Math.abs(budgets[a] - figures) ? n : a))
}

/** the switches that need armies on the page (src/look/main.ts: an error without them) */
const NEEDS_ARMIES = ['sim', 'lookat']

/** The page's address with the battle chosen in its panel: ?battle=<name>, or no armies (null: the switches that need
 *  them dropped too, ?sim and ?lookat); ?lookat dropped with any change (the arm it names may not be in the new
 *  battle); the old ?armies dropped; every other switch kept */
export function battleHref(href: string, name: string | null): string {
  const u = new URL(href)
  u.searchParams.delete('armies')
  u.searchParams.delete('lookat')
  if (name === null) for (const k of ['battle', ...NEEDS_ARMIES]) u.searchParams.delete(k)
  else u.searchParams.set('battle', name)
  return u.href
}

/** The panel's Battle choices, each its name and label by the figures it fields (none first), or null where the page
 *  has no armies to offer (a map window: ?battle is the demo world's) */
export function battleOptions(
  onMap: boolean,
  figures: Readonly<Record<string, number>>,
): { value: string; label: string }[] | null {
  if (onMap) return null
  return [
    { value: '', label: 'None' },
    ...Object.entries(figures).map(([name, n]) => ({ value: name, label: `${name} (${n.toLocaleString('en')})` })),
  ]
}

/** Whether an arm is on the page by its switch (?<name>=0|1, or its group's, ?<group>=0|1, when its own is absent;
 *  another value: an error): by default on, but under ?sim (the sim drives the line infantry alone; another arm asked
 *  for there, an error: its script is a stand-in the sim neither drives nor places against its armies). The first arm
 *  (always) is on the page whatever, ?<name>=0 an error (it owns the figures' shadow map) */
export function armOn(q: URLSearchParams, name: string, sim: boolean, always = false, group?: string): boolean {
  const own = bit(q, name)
  const of = group === undefined ? null : bit(q, group)
  if (always) {
    if (own === false) {
      throw new Error(`?${name}=0: the ${name} is always on the page (it owns the figures' shadow map)`)
    }
    return true
  }
  const on = own ?? of
  if (on && sim) {
    const k = own === null ? group : name
    throw new Error(`?${k}=1 with ?sim: the sim drives the line infantry alone; the ${name} is scripted`)
  }
  return on ?? !sim
}
