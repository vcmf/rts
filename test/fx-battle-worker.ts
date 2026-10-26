// The battle host in a Node worker thread (test/battle-thread.test.ts): worker_threads' port as the browser
// worker's `self`.
import { parentPort } from 'node:worker_threads'
import { serveBattle, type Port } from '../src/app/battle-host.ts'

const port = parentPort!
serveBattle({
  postMessage: (m: unknown) => port.postMessage(m),
  set onmessage(fn: Port['onmessage']) {
    port.on('message', data => fn?.({ data }))
  },
  get onmessage() {
    return null
  },
} as Port)
