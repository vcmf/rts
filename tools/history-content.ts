// The Napoleonic content of the History screens (decision 0015: the interface code in src/ui/ never names a nation,
// unit or person; it reads them from data/history/roster.json, which tools/build-history-data.ts writes from this
// file and the design libraries). docs/systems/front-menu.md.
import type { Nation } from '../src/ui/roster.ts'

/** The armies in the order the screens list them. Colours: docs/art-bible.md §4 (France, Russia, Britain), the staff
 *  map's Austrian edge (docs/proposals/staff-map/design.md §6); Prussia and Poland provisional (the plan's open
 *  questions, docs/plans/active/front-menu.md). `id` is the design libraries' folder name. */
export const NATIONS: Nation[] = [
  { id: 'french', name: 'France', native: 'Empire français', colour: '#2c4fa8' },
  { id: 'british', name: 'Britain', native: 'United Kingdom', colour: '#b3302a' },
  { id: 'austrian', name: 'Austria', native: 'Kaisertum Österreich', colour: '#4f6279' },
  { id: 'prussian', name: 'Prussia', native: 'Königreich Preußen', colour: '#23324a' },
  { id: 'russian', name: 'Russia', native: 'Rossiyskaya Imperiya', colour: '#2f6b3c' },
  { id: 'polish', name: 'Poland', native: 'Księstwo Warszawskie', colour: '#9c2440' },
]

/** A regiment's arm from its card's slug: the first rule whose pattern matches; infantry when none does. Order
 *  matters: a horse gunner is artillery before he is mounted, a bare horse is a mount before it is cavalry. */
export const ARM_RULES: [arm: string, pattern: RegExp][] = [
  ['artillery', /gunner|pounder|howitzer|unicorn|congreve|artillery/],
  ['mounts', /(light|heavy)-horse$|pony$/],
  ['command', /officer|general|marshal|drummer|bugler|cornet|colour-bearer|eagle-bearer|staff/],
  [
    'cavalry',
    /dragoon|hussar|cuirassier|lancer|uhlan|chevauleger|cheval|mounted|garde-du-corps|life-guards|horse-guards|scots-greys|cossack|chevalier|krakus|cavalry/,
  ],
]
export const DEFAULT_ARM = 'infantry'

/** The arms in the order the filters show them. */
export const ARMS = ['infantry', 'cavalry', 'artillery', 'command', 'mounts']

/** The entries the History plates show: a commander's and a regiment's roster id. */
export const FEATURED = { commanders: 'french/napoleon', regiments: 'french/07-old-guard-grenadier' }
