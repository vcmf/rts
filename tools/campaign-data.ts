// The 1805 theatre's hand-written data (prototypes/campaign-1805.data.js; docs/plans/done/k1-theatre-look.md): its
// frame, its towns (names, sizes, fortresses), its roads and its regions' names, read by tools/campaign-theatre.ts
// (which places and routes them) and tools/campaign-tiles.ts (which writes the labels the page draws). The theatre as
// data (Track K, K3) replaces it.
import fs from 'node:fs'
import vm from 'node:vm'
import type { Frame } from './campaign-theatre-lib.ts'

export const DATA_FILE = 'prototypes/campaign-1805.data.js'

/** The hand-written theatre. */
export interface Data {
  frame: Frame
  // size: 4 a capital, 3 a city, 2 a town, 1 a small town or a crossing; fort: a fortress
  towns: { id: string; name: string; lat: number; lon: number; size: number; fort?: boolean }[]
  roads: [string, string, string][]
  // angle: degrees, counter-clockwise from east
  regions: { name: string; lat: number; lon: number; angle: number }[]
}

/** The hand-written theatre: the data file run with a stand-in `window`. */
export function loadData(file = DATA_FILE): Data {
  const context: { window: { CAMPAIGN_1805?: Data } } = { window: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file })
  const data = context.window.CAMPAIGN_1805
  if (!data?.frame || !Array.isArray(data.towns) || !Array.isArray(data.roads) || !Array.isArray(data.regions)) {
    throw new Error(`${file} does not set window.CAMPAIGN_1805 with a frame, towns, roads and regions`)
  }
  return data
}
