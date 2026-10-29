// The sim worker's entry (docs/plans/done/battle-threads.md, PR 5); src/app/sim-host.ts does the rest.
import { serveSim } from './sim-host.ts'
import type { Port } from './host.ts'
import type { ToSim } from './sim-host.ts'

serveSim(self as unknown as Port<ToSim>)
