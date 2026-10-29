// The battle's workers in Node worker threads (test/battle-thread.test.ts): worker_threads' port as the browser
// worker's `self`; `workerData` says which ('sim' or 'men').
import { parentPort, workerData } from 'node:worker_threads'
import { serveSim } from '../src/app/sim-host.ts'
import { serveMen } from '../src/app/men-host.ts'
import type { Port } from '../src/app/host.ts'

const port = parentPort!
/** The port as a host's `Port` for messages of type `In`. */
function self<In>(): Port<In> {
  return {
    postMessage: (m: unknown) => port.postMessage(m),
    set onmessage(fn: ((e: { data: In }) => void) | null) {
      port.on('message', data => fn?.({ data: data as In }))
    },
    get onmessage() {
      return null
    },
  }
}
if (workerData === 'sim') serveSim(self())
else serveMen(self())
