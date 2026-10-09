// ESLint (flat config). TypeScript everywhere; in src/sim/ the determinism rules of decision 0006
// (docs/proposals/sim-design.md §2) and the layer rule of decision 0005, enforced instead of remembered.
import tseslint from 'typescript-eslint'

const banned = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'hypot', 'cbrt', 'fround', 'random']

export default tseslint.config(
  { ignores: ['node_modules/', 'data/', 'prototypes/', 'tools/*.js', 'tools/*.mjs', 'tools/*.py', 'eslint.config.js'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error',
        ...banned.map(property => ({ object: 'Math', property, message: 'Not exact across JS engines: use src/sim/num.ts (decision 0006).' })),
        { object: 'Date', property: 'now', message: 'The sim clock is the tick.' }],
      'no-restricted-globals': ['error',
        { name: 'Date', message: 'No wall-clock time in the sim.' },
        { name: 'performance', message: 'No wall-clock time in the sim: metering is injected.' },
        { name: 'Float32Array', message: 'State is float64: Float32Array rounds silently on store.' },
        { name: 'Map', message: 'Use index-ordered typed arrays in the sim.' },
        { name: 'Set', message: 'Use index-ordered typed arrays in the sim.' },
        { name: 'window', message: 'The sim runs without a browser.' },
        { name: 'document', message: 'The sim runs without a browser.' }],
      'no-restricted-syntax': ['error',
        { selector: "BinaryExpression[operator='**']", message: 'Not exact across JS engines: multiply, or use src/sim/num.ts.' },
        { selector: "AssignmentExpression[operator='**=']", message: 'Not exact across JS engines: multiply, or use src/sim/num.ts.' }],
      'no-restricted-imports': ['error', { patterns: [
        { group: ['../*', '@babylonjs/*', 'node:*'], message: 'src/sim/ imports only from src/sim/ (decision 0005).' }] }],
    },
  },
)
