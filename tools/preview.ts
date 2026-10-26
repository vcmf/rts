// The built pages served by `vite preview` for the headless checks and benches (tools/app-check.mjs,
// tools/bench-sim.ts): started on a port, ready once it answers, stopped by the returned function.
import { spawn } from 'node:child_process'

/** Starts `vite preview` on `port` and waits (up to `waitS` seconds) until /app/ answers; returns the stop. */
export async function startPreview(port: number, waitS = 30): Promise<() => void> {
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
  const stop = () => {
    preview.kill()
  }
  for (let i = 0; i < waitS * 4; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/app/`)).ok) return stop
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 250))
  }
  stop()
  throw new Error(`vite preview did not answer on port ${port} in ${waitS} s`)
}
