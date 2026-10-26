// The battle worker's entry (docs/plans/active/battle-threads.md, PR 3): the page starts it with
// `new Worker(new URL('./battle-worker.ts', import.meta.url), { type: 'module' })`; src/app/battle-host.ts does the
// rest.
import { serveBattle, type Port } from './battle-host.ts'

serveBattle(self as unknown as Port)
