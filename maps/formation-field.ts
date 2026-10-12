// The formation test field as a map definition for the sim data build (tools/build-sim-data.ts): its
// heights and ground come from the prototype that defines them (prototypes/formation-core.js with the
// Napoleonic ruleset), loaded in Node, so the sim and the prototype read the same terrain. Build time
// only: the prototype uses Math.sin and friends, which is fine here because the output is data.
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export interface MapDef {
  name: string
  half: number                                   // the map spans [−half, half] in x and z (metres)
  heightAt(x: number, z: number): number         // metres
  groundAt(x: number, z: number): number         // speed factor 0..1 of the ground for a column (0: impassable)
  slopeFactor(rise: number): number              // speed factor for a slope (rise over run, uphill)
  classes: string[]                              // terrain class names (the ruleset's terrain table keys)
  fine: { cell: number; n: number; classAt(i: number, j: number): number; depthAt(i: number, j: number): number }   // 1 m grid from −half
  cells?: { height: number; cost: number }       // the heightfield's and the cost grid's cells, m; the legacy maps' 1.79 and 7.16 when absent
}

interface FormationCore {
  HALF: number; H(x: number, z: number): number; HN: number; HG: number
  CLASSES: string[]; TERR: Uint8Array; WDEPTH: Float32Array
  groundG(x: number, z: number, kind: string, dx: number, dz: number): number
  RULESET: { slopeK: number }
}

let core: FormationCore | undefined
async function loadCore(): Promise<FormationCore> {
  if (core) return core
  const g = globalThis as unknown as Record<string, unknown>
  g.window = globalThis
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prototypes')
  await import(path.join(dir, 'ruleset-napoleonic.js'))
  await import(path.join(dir, 'formation-core.js'))
  core = g.FC as FormationCore
  return core
}

export async function formationField(): Promise<MapDef> {
  const fc = await loadCore()
  return {
    name: 'formation-field',
    half: fc.HALF,
    heightAt: (x, z) => fc.H(x, z),
    groundAt: (x, z) => fc.groundG(x, z, 'column', 0, 0),   // class × water depth; slope comes from the heightfield
    slopeFactor: rise => Math.min(1, fc.RULESET.slopeK * Math.exp(-3.5 * rise)),
    classes: fc.CLASSES,
    fine: { cell: fc.HG, n: fc.HN, classAt: (i, j) => fc.TERR[j * fc.HN + i], depthAt: (i, j) => fc.WDEPTH[j * fc.HN + i] },
  }
}
