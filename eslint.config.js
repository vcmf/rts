// ESLint (flat config). TypeScript everywhere; in src/sim/ the determinism rules of decision 0006
// (docs/proposals/sim-design.md §2) and the layer rule of decision 0005, enforced instead of remembered.
import tseslint from 'typescript-eslint'

const banned = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'hypot', 'cbrt', 'fround', 'random']

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'scratch/', 'data/', 'prototypes/', 'tools/*.js', 'tools/*.mjs', 'tools/*.py', 'eslint.config.js'] },
  ...tseslint.configs.recommended,
  // a type-only import written `import { type X }` still loads its module and can create an import cycle
  // (it once left formation.ts reading TRAIL before world.ts had set it): type-only imports are `import type`
  { files: ['**/*.ts'], rules: { '@typescript-eslint/no-import-type-side-effects': 'error', '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }] } },
  {
    files: ['src/sim/**/*.ts', 'src/rulesets/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error',
        ...banned.map(property => ({ object: 'Math', property, message: 'Not exact across JS engines: use src/sim/num.ts (decision 0006).' })),
        { object: 'Date', property: 'now', message: 'The sim clock is the tick.' },
        { property: 'setFloat32', message: 'State is float64.' }, { property: 'getFloat32', message: 'State is float64.' }],
      'no-restricted-globals': ['error',
        { name: 'Date', message: 'No wall-clock time in the sim.' },
        { name: 'performance', message: 'No wall-clock time in the sim: metering is injected.' },
        { name: 'Float32Array', message: 'State is float64: Float32Array rounds silently on store.' },
        { name: 'Float16Array', message: 'State is float64.' },
        { name: 'globalThis', message: 'The sim reaches nothing global but its allowed builtins.' },
        { name: 'Reflect', message: 'No indirect access to builtins in the sim.' },
        { name: 'crypto', message: 'Randomness comes from src/sim/rng.ts.' },
        { name: 'process', message: 'The sim runs without Node.' },
        { name: 'WeakRef', message: 'Collection timing is not deterministic.' },
        { name: 'FinalizationRegistry', message: 'Collection timing is not deterministic.' },
        { name: 'Map', message: 'Use index-ordered typed arrays in the sim.' },
        { name: 'Set', message: 'Use index-ordered typed arrays in the sim.' },
        { name: 'window', message: 'The sim runs without a browser.' },
        { name: 'document', message: 'The sim runs without a browser.' }],
      'no-restricted-syntax': ['error',
        { selector: "BinaryExpression[operator='**']", message: 'Not exact across JS engines: multiply, or use src/sim/num.ts.' },
        { selector: "AssignmentExpression[operator='**=']", message: 'Not exact across JS engines: multiply, or use src/sim/num.ts.' },
        { selector: "MemberExpression[object.name='Math'][computed=true]", message: 'No computed access to Math in the sim.' },
        { selector: "VariableDeclarator[init.type='Identifier'][init.name='Math']", message: 'No aliasing Math in the sim.' },
        { selector: "AssignmentExpression[right.type='Identifier'][right.name='Math']", message: 'No aliasing Math in the sim.' },
        { selector: "CallExpression > Identifier.arguments[name='Math']", message: 'No passing Math around in the sim.' },
        { selector: 'ImportExpression', message: 'No dynamic imports in the sim.' }],
      'no-restricted-imports': ['error', { patterns: [
        { regex: '^(?!\\./)', message: 'src/sim/ imports only from src/sim/ (decision 0005).' }] }],
    },
  },
  // a ruleset is data for the sim: the same rules, and it may import the sim's types and maths
  { files: ['src/rulesets/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: [
    { regex: '^(?!\\.\\./sim/[\\w-]+\\.ts$|\\./)', message: 'A ruleset imports only from src/sim/ and src/rulesets/.' }] }] } },
)
