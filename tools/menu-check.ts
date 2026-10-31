// The front menu's page check (docs/systems/front-menu.md, "Checks"): runs tools/menu-check.js inside the built page
// through tools/shot.mjs, at a desktop and a phone size, and fails on any failure it reports or any page error.
//   npm run build && npx vite preview        (then, in another shell)
//   node tools/menu-check.ts http://localhost:4173/app/menu.html [outDir]
//   node tools/menu-check.ts <url> --selftest
//     the check passes on the page, and fails, naming the right check, on each sabotage below
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = fs.readFileSync(path.join(ROOT, 'tools', 'menu-check.js'), 'utf8')
/** The sizes it runs at: 1440 × 900 and a phone, 390 × 844. */
const SIZES: [number, number][] = [
  [1440, 900],
  [390, 844],
]

/** A sabotage (evaluated in the page after the roster is copied, before the check) and the failure it must cause. */
export const SABOTAGES: [name: string, js: string, expect: string][] = [
  ['a regiment the page drops', 'MENU.roster.regiments.splice(3, 1)', 'cards:'],
  ['a plate that leaves focus behind', 'document.querySelector("#plate [data-turn=close]").focus = () => {}', 'plate:'],
  ['a muted item made focusable', 'document.querySelector(".menu-item.muted").tabIndex = 0', 'muted:'],
  [
    'a page wider than the window',
    'document.body.append(Object.assign(document.createElement("div"), { style: "width: 3000px; height: 1px" }))',
    'overflow:',
  ],
  [
    'Esc swallowed',
    'document.addEventListener("keydown", e => e.key === "Escape" && e.stopImmediatePropagation(), true)',
    'Esc:',
  ],
]

interface Run {
  failures: string[]
  output: string
  status: number
}

/** The check once at `size`, after `sabotage` (none when null): its failures, shot.mjs's output and exit code. */
export function runCheck(url: string, size: [number, number], sabotage: string | null, outDir: string): Run {
  const steps = [
    ['wait', 1500],
    ['eval', 'if (!window.MENU) throw new Error("the menu did not start (no window.MENU)"); "ready"'],
    ['eval', 'window.__expected = structuredClone(MENU.roster); "copied"'],
    ...(sabotage ? [['eval', `${sabotage}; "sabotaged"`]] : []),
    ['eval', `${CHECK}\nmenuCheck(window.__expected).then(report => ({ menuCheck: report }))`],
    ['shot', `menu-${size[0]}`],
  ]
  const args = ['tools/shot.mjs', url, outDir, String(size[0]), String(size[1]), JSON.stringify(steps)]
  const run = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' })
  const output = `${run.stdout}${run.stderr}`
  const report = reportOf(output)
  return { failures: report ? report.failures : ['no report from the page'], output, status: run.status ?? 1 }
}

/** The check's report in shot.mjs's output (its eval line `EVAL {"menuCheck": …}`), or null when there is none. */
export function reportOf(output: string): { failures: string[]; checked: number } | null {
  const line = output.split('\n').find(l => l.startsWith('EVAL {"menuCheck"'))
  return line ? JSON.parse(line.slice('EVAL '.length)).menuCheck : null
}

function check(url: string, outDir: string): boolean {
  let ok = true
  for (const size of SIZES) {
    const run = runCheck(url, size, null, outDir)
    const passed = run.status === 0 && run.failures.length === 0
    console.log(`${size.join(' × ')}: ${passed ? 'pass' : 'FAIL'}`)
    for (const f of run.failures) console.log(`  ${f}`)
    if (run.status !== 0) console.log(run.output)
    ok &&= passed
  }
  return ok
}

function selftest(url: string, outDir: string): boolean {
  let ok = check(url, outDir)
  for (const [name, js, expect] of SABOTAGES) {
    const run = runCheck(url, SIZES[0], js, outDir)
    const caught = run.failures.some(f => f.startsWith(expect))
    console.log(`sabotage "${name}": ${caught ? 'caught' : 'MISSED'} (${run.failures.length} failures)`)
    if (!caught) console.log(run.failures.join('\n') || run.output)
    ok &&= caught
  }
  return ok
}

function main(): void {
  const args = process.argv.slice(2)
  const [url, outDir = path.join(ROOT, 'scratch', 'menu-check')] = args.filter(a => a !== '--selftest')
  if (!url) {
    console.error('usage: node tools/menu-check.ts <menu page URL> [outDir] [--selftest]')
    process.exit(2)
  }
  const ok = args.includes('--selftest') ? selftest(url, outDir) : check(url, outDir)
  console.log(ok ? 'menu-check: ok' : 'menu-check: FAILED')
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
