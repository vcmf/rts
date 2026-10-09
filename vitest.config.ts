import { defineConfig } from 'vitest/config'
// the formation scenarios run minutes of simulated time
export default defineConfig({ test: { testTimeout: 120_000 } })
