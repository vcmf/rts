// ESLint (flat config). TypeScript everywhere; in src/sim/ the determinism rules of decision 0006
// (docs/proposals/sim-design.md §2) and the layer rule of decision 0005, enforced instead of remembered.
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const banned = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'hypot',
  'cbrt',
  'fround',
  'random',
]

// decision 0052: the areas Prettier formats, and the style rules below cover (a folder, or a root file).
// .prettierignore lists the rest; test/format-scope.test.ts checks the two agree.
export const formatted = [
  'src/sim/',
  'src/map/',
  'src/campaign/',
  'src/rulesets/',
  'src/scenarios/',
  'maps/',
  'src/look/',
  'src/render/',
  'src/app/',
  'tools/',
  'test/',
  'eslint.config.js',
  'vite.config.ts',
  'vitest.config.ts',
]

// the code files Prettier formats; test/format-scope.test.ts lists the same extensions
const CODE = '{ts,mts,cts,tsx,js,mjs,cjs,jsx}'

// max-len skips a line that holds a string, and with it a comment at its end: this checks every comment on its own
const commentWidth = {
  meta: { type: 'layout', schema: [] },
  create: context => ({
    Program() {
      for (const c of context.sourceCode.getAllComments()) {
        if (c.loc.end.column > 120) {
          context.report({
            loc: c.loc,
            message: `This comment ends at column ${c.loc.end.column}. Maximum allowed is 120.`,
          })
        }
      }
    },
  }),
}

// the exact-number rules (decision 0006), shared by every folder whose results must match across JS engines: the
// sim and its rulesets, and the map engine (docs/proposals/map-engine.md §4)
const exactProperties = [
  ...banned.map(property => ({
    object: 'Math',
    property,
    message: 'Not exact across JS engines: use src/sim/num.ts (decision 0006).',
  })),
  { object: 'Date', property: 'now', message: 'No wall-clock time in exact code.' },
  { property: 'setFloat32', message: 'Exact data is float64.' },
  { property: 'getFloat32', message: 'Exact data is float64.' },
]
const exactGlobals = [
  { name: 'Date', message: 'No wall-clock time in exact code.' },
  { name: 'performance', message: 'No wall-clock time in exact code: metering is injected.' },
  { name: 'Float32Array', message: 'Exact data is float64: Float32Array rounds silently on store.' },
  { name: 'Float16Array', message: 'Exact data is float64.' },
  { name: 'globalThis', message: 'Exact code reaches nothing global but its allowed builtins.' },
  { name: 'Reflect', message: 'No indirect access to builtins in exact code.' },
  { name: 'crypto', message: 'Randomness comes from seeded generators (src/sim/rng.ts).' },
  { name: 'WeakRef', message: 'Collection timing is not deterministic.' },
  { name: 'FinalizationRegistry', message: 'Collection timing is not deterministic.' },
]
const exactSyntax = [
  {
    selector: "BinaryExpression[operator='**']",
    message: 'Not exact across JS engines: multiply, or use src/sim/num.ts.',
  },
  {
    selector: "AssignmentExpression[operator='**=']",
    message: 'Not exact across JS engines: multiply, or use src/sim/num.ts.',
  },
  {
    selector: "MemberExpression[object.name='Math'][computed=true]",
    message: 'No computed access to Math in exact code.',
  },
  {
    selector: "VariableDeclarator[init.type='Identifier'][init.name='Math']",
    message: 'No aliasing Math in exact code.',
  },
  {
    selector: "AssignmentExpression[right.type='Identifier'][right.name='Math']",
    message: 'No aliasing Math in exact code.',
  },
  { selector: "CallExpression > Identifier.arguments[name='Math']", message: 'No passing Math around in exact code.' },
  { selector: 'ImportExpression', message: 'No dynamic imports in exact code.' },
]

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'scratch/', 'data/', 'prototypes/'] },
  ...tseslint.configs.recommended,
  // the tools: ES modules run by Node, where no-undef catches a mistyped name in untyped JavaScript (Node's builtins
  // only: require, module and __dirname do not exist in a module); and the checks evaluated inside a page
  // (tools/render-check.js, …), which read the page's own globals: scripts, without no-undef
  {
    files: ['tools/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.nodeBuiltin },
    rules: { 'no-undef': 'error' },
  },
  { files: ['tools/**/*.js'], languageOptions: { sourceType: 'script' } },
  // a type-only import written `import { type X }` still loads its module and can create an import cycle
  // (it once left formation.ts reading TRAIL before world.ts had set it): type-only imports are `import type`
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
    },
  },
  {
    files: ['src/sim/**/*.ts', 'src/rulesets/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', ...exactProperties],
      'no-restricted-globals': [
        'error',
        ...exactGlobals,
        { name: 'process', message: 'The sim runs without Node.' },
        { name: 'Map', message: 'Use index-ordered typed arrays in the sim.' },
        { name: 'Set', message: 'Use index-ordered typed arrays in the sim.' },
        { name: 'window', message: 'The sim runs without a browser.' },
        { name: 'document', message: 'The sim runs without a browser.' },
      ],
      'no-restricted-syntax': ['error', ...exactSyntax],
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^(?!\\./)', message: 'src/sim/ imports only from src/sim/ (decision 0005).' }] },
      ],
    },
  },
  // the map engine (docs/proposals/map-engine.md §4): its compilers run in Node and in browsers and must give the
  // same bytes, so the exact-number rules apply (Map and Set are allowed: their order is insertion order); it
  // imports only itself (no path that climbs out) and the sim's exact maths
  {
    files: ['src/map/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', ...exactProperties],
      'no-restricted-globals': [
        'error',
        ...exactGlobals,
        { name: 'process', message: 'The map engine runs without Node: the CLI passes it what it needs.' },
        { name: 'window', message: 'The map engine runs without a browser.' },
        { name: 'document', message: 'The map engine runs without a browser.' },
      ],
      'no-restricted-syntax': ['error', ...exactSyntax],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\./(?!.*\\.\\.)|\\.\\./sim/num\\.ts$)',
              message: 'src/map/ imports only from src/map/ and src/sim/num.ts.',
            },
          ],
        },
      ],
    },
  },
  // the campaign (docs/proposals/campaign.md): its turns play the same on every machine, so the exact-number rules
  // apply as in the map engine (Map and Set allowed: insertion order); it imports only itself and the sim's exact
  // maths, never the renderer (decision 0005)
  {
    files: ['src/campaign/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', ...exactProperties],
      'no-restricted-globals': [
        'error',
        ...exactGlobals,
        { name: 'process', message: 'The campaign runs without Node.' },
        { name: 'window', message: 'The campaign runs without a browser.' },
        { name: 'document', message: 'The campaign runs without a browser.' },
      ],
      'no-restricted-syntax': ['error', ...exactSyntax],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\./(?!.*\\.\\.)|\\.\\./sim/num\\.ts$)',
              message: 'src/campaign/ imports only from src/campaign/ and src/sim/num.ts.',
            },
          ],
        },
      ],
    },
  },
  // a ruleset is data for the sim and the campaign: the same rules, and it may import their types and maths
  {
    files: ['src/rulesets/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.\\./(sim|campaign)/[\\w-]+\\.ts$|\\./)',
              message: 'A ruleset imports only from src/sim/, src/campaign/ and src/rulesets/.',
            },
          ],
        },
      ],
    },
  },
  // decision 0052: lines within 120 columns (Prettier lays out the code, not the comments); one statement per line,
  // one name per declaration, braces on a body that does not fit on the line
  {
    files: formatted.map(f => (f.endsWith('/') ? `${f}**/*.${CODE}` : f)),
    ignores: ['test/fixtures/**'],
    plugins: { '@stylistic': stylistic, local: { rules: { 'comment-width': commentWidth } } },
    rules: {
      '@stylistic/max-len': [
        'error',
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      'local/comment-width': 'error',
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
      'one-var': ['error', 'never'],
      curly: ['error', 'multi-line'],
    },
  },
)
