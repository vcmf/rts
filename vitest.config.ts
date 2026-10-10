import { defineConfig } from 'vitest/config'
// the formation scenarios run minutes of simulated time
// coverage: `npm run coverage` (CI uploads coverage/lcov.info to Codecov); the sim and its rulesets are what the
// tests are for, the page and the renderer are checked by tools/app-check.mjs instead
export default defineConfig({ test: {
  testTimeout: 120_000,
  coverage: { provider: 'v8', include: ['src/**/*.ts'], reporter: ['text-summary', 'lcov'] },
} })
