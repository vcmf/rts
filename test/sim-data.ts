// shared test helpers: the committed sim data and a full recorded run of the S0 scenario
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSimData, type SimData, record } from '../src/sim/index.ts'
import { s0Fight, s0Orders } from '../src/scenarios/s0-fight.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const dataBytes = (): Uint8Array => new Uint8Array(fs.readFileSync(path.join(root, 'data', 'formation-field.simdata')))
// the data version the golden hashes were made with: tests refuse other data
export const GOLDEN_DATA_VERSION = 0xb06639cc
export const simData = (): SimData => loadSimData(dataBytes(), GOLDEN_DATA_VERSION)
export const S0_TICKS = 3600   // 3 minutes
export const recordS0 = (data = simData()) => record(data, s0Fight, 20261009, S0_TICKS, s0Orders)
export const goldenFile = path.join(root, 'test', 'golden', 's0-fight.json')
