// shared test helpers: the committed sim data and a full recorded run of the S0 scenario
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSimData, type SimData, record } from '../src/sim/index.ts'
import { s0Fight, s0Orders, S0_FIGHT } from '../src/scenarios/s0-fight.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const dataBytes = (): Uint8Array => new Uint8Array(fs.readFileSync(path.join(root, 'data', 'formation-field.simdata')))
export const simData = (): SimData => loadSimData(dataBytes())
export const S0_TICKS = 3600   // 3 minutes
export const recordS0 = (data = simData()) => record(data, S0_FIGHT, s0Fight, 20261009, S0_TICKS, s0Orders)
export const goldenFile = path.join(root, 'test', 'golden', 's0-fight.json')
