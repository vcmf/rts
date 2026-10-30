import { defineConfig } from 'vitest/config'
// the formation scenarios run minutes of simulated time
// coverage: `npm run coverage` (CI uploads coverage/lcov.info to Codecov); the sim and its rulesets are what the
// tests are for, the page and the renderer are checked by tools/app-check.mjs instead
export default defineConfig({
  test: {
    // the budget per test; under coverage (`npm run coverage`, or --coverage) the sim runs slower (why and how much:
    // test/fx.ts), and on CI's runner several tests took 100–196 s there (docs/plans/done/coverage-timeout.md):
    // about three times the slowest. `npm test` and CI's test job keep 120 s
    testTimeout: process.env.COVERAGE || process.argv.includes('--coverage') ? 600_000 : 120_000,
    // the map windows' look data, built when missing (it is not committed: test/look-data-setup.ts)
    globalSetup: ['test/look-data-setup.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], reporter: ['text-summary', 'lcov'] },
  },
})
