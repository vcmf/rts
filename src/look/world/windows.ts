// The named windows of the maps the look page draws (docs/plans/active/look-austerlitz-a1.md): a square of a map the
// size of the look world (SPEC: the tile, the far ring, the play area), its centre in the map's metres. Austerlitz's
// are at 4× since G1 (decision 0089): their far rings pass the 3 km map's edge, as paper. The look
// world's origin is the window's centre, with the map's axes. The compiler (tools/build-look-data.ts --window) writes
// each into data/<map>-<window>.lookdata; the page loads one by ?map=<map>&window=<name>.

export interface LookWindow {
  map: string // the map's name: its file is maps/<map>.map.json
  name: string
  x: number // the window's centre in map metres, on even metres (the cover's 1 m cells and the layers' 2 m line up)
  z: number
}

export const WINDOWS: readonly LookWindow[] = [
  // Kobelnitz, its pond and the Goldbach, the pheasantry's orchard south-west (the owner's first, 2026-10-29)
  { map: 'austerlitz', name: 'kobelnitz', x: -226, z: 176 },
  // the Pratzen plateau's western slope and top, its relief in play (A1b: the camera's focus on the ground)
  { map: 'austerlitz', name: 'pratzen', x: 350, z: 126 },
]

/** The look data file of a window, from the repo's root. */
export const windowFile = (w: LookWindow): string => `data/${w.map}-${w.name}.lookdata`

/** The map file a window is cut from, from the repo's root. */
export const mapFile = (w: LookWindow): string => `maps/${w.map}.map.json`

/**
 * The world a page's query asks for: null for the demo world (no `map`), else its named window. Throws on a window
 * without a map, a map without a window, or a name no window has.
 */
export function windowOf(params: URLSearchParams): LookWindow | null {
  const map = params.get('map')
  const name = params.get('window')
  if (map === null) {
    if (name !== null) throw new Error('?window needs ?map')
    return null
  }
  if (name === null) throw new Error(`?map=${map} needs a ?window (${namesOf(map)})`)
  const w = WINDOWS.find(v => v.map === map && v.name === name)
  if (!w) throw new Error(`?map=${map}&window=${name}: no such window (${namesOf(map) || 'no window of that map'})`)
  return w
}

const namesOf = (map: string): string =>
  WINDOWS.filter(v => v.map === map)
    .map(v => v.name)
    .join(', ')
