import { defineConfig } from 'vitest/config'
// the formation scenarios run minutes of simulated time
// coverage: `npm run coverage` (CI uploads coverage/lcov.info to Codecov); the sim and its rulesets are what the
// tests are for, the page and the renderer are checked by tools/app-check.mjs instead
export default defineConfig({ test: {
  // under coverage (`npm run coverage` sets COVERAGE) V8's block counters make the sim's hot loops about six times
  // slower (test/fx.ts): on CI's runner several tests ran at 100–196 s there against the 120 s budget, so it is
  // three times as long; `npm test` and CI's check job keep 120 s
  testTimeout: process.env.COVERAGE ? 360_000 : 120_000,
  coverage: { provider: 'v8', include: ['src/**/*.ts'], reporter: ['text-summary', 'lcov'] },
} })
