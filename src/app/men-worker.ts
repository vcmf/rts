// The men worker's entry (docs/plans/active/battle-threads.md, PR 5); src/app/men-host.ts does the rest.
import { serveMen } from './men-host.ts'
import type { Port } from './host.ts'
import type { ToMen } from './men-host.ts'

serveMen(self as unknown as Port<ToMen>)
