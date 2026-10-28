// The visual bench's field (docs/plans/active/c0-bench.md) as a map definition for the sim data build
// (tools/build-sim-data.ts): a flat, open 600 m square, so that ground plays no part in what the bench's cases
// show. x is east, z north.
import type { MapDef } from './formation-field.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'

const HALF = 300
const CELL = 2
const N = Math.round((2 * HALF) / CELL) + 1
const CLASSES = Object.keys(napoleonic.terrain)
const OPEN = CLASSES.indexOf('open')

export function bench(): MapDef {
  if (OPEN < 0) throw new Error('bench: no terrain class open')
  return {
    name: 'bench',
    half: HALF,
    heightAt: () => 0,
    groundAt: () => napoleonic.terrain.open.g.column,
    slopeFactor: () => 1,
    classes: CLASSES,
    fine: { cell: CELL, n: N, classAt: () => OPEN, depthAt: () => 0 },
  }
}
