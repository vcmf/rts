// The named windows of the maps the look page draws (docs/plans/active/look-austerlitz-a1.md): a square of a map the
// size of the look world (SPEC: the tile, the far ring, the play area), its centre in the map's metres. The look
// world's origin is the window's centre, with the map's axes. The compiler (tools/build-look-data.ts --window) writes
// each into data/<map>-<window>.lookdata; the page loads one by ?map=<map>&window=<name>.

export interface LookWindow {
  map: string // the map's name: its file is maps/<map>.map.json
  name: string
  x: number // the window's centre in map metres, on even metres (the cover's 2 m cells are then the map's)
  z: number
}

export const WINDOWS: readonly LookWindow[] = [
  // Kobelnitz, its pond and the Goldbach, the pheasantry's orchard south-west (the owner's first, 2026-10-29)
  { map: 'austerlitz', name: 'kobelnitz', x: -450, z: 350 },
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
