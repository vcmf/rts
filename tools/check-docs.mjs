// Docs check (docs/conventions.md): every doc and file reference in docs and code points to a file git
// tracks, every relative Markdown link resolves, every doc under docs/ has valid front matter and is
// listed in an index, decision numbers are unique and their statuses match the decisions table.
// Run after `git add` (untracked files count as missing: they would be broken on GitHub):
//   node tools/check-docs.mjs   (exit 1 on any problem; prints every problem)
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const problems = []

// what git tracks (index, so staged files count), with every parent folder; exact letter case
const tracked = new Set(execSync('git ls-files -z', { cwd: root }).toString().split('\0').filter(Boolean))
for (const f of [...tracked]) for (let d = path.posix.dirname(f); d !== '.'; d = path.posix.dirname(d)) tracked.add(d)
const known = p => {
  // p: absolute path
  const r = path.relative(root, p).split(path.sep).join('/').replace(/\/$/, '')
  return r === '' || (!r.startsWith('..') && tracked.has(r))
}
const files = [...tracked].filter(
  f => /\.(md|html|js|mjs|py)$/.test(f) && !f.endsWith('.data.js') && fs.existsSync(path.join(root, f)),
)

// Which tokens are references:
// - everywhere: repo-root paths (docs/, prototypes/, tools/, design/) and ../-relative file paths
// - in docs: every *.md name, every backticked file name and old top-level folder name, Markdown
//   links (inline, <angle>, reference definitions); ~~struck-through~~ text marks old names on purpose
// - in code: every *.md and *.html name, and hyphenated *.js/*.mjs/*.py names (river-check.js), so
//   prose like "Babylon.js" is not mistaken for a file
// A token resolves against the file's own folder, then the repo root. Placeholders are skipped.
const ROOT_PATH = /(?<![\w./@-])((?:docs|prototypes|tools|design)\/[\w./-]*[\w/])(?![\w])/g
const REL_PATH = /(?<![\w./-])((?:\.\.\/)+[\w./-]*\.(?:md|html|js|mjs|py))(?![\w])/g
const MD_NAME = /(?<![\w./-])([\w-]+(?:\/[\w.-]+)*\.md)(?![\w])/g
const CODE_NAME = /(?<![\w./<-])([\w]+(?:-[\w]+)+(?:\/[\w.-]+)*\.(?:js|mjs|py)|[\w-]+(?:\/[\w.-]+)*\.html)(?![\w])/g
// folders: only the old top-level ones
const TICKED = /`@?([\w./-]+\.(?:md|html|js|mjs|py)|(?:staff-map|plans|research)\/)`/g
const MD_LINK = /\]\(<?([^)\s#>]+)>?(#[^)\s]*)?(?:\s+"[^"]*")?\)/g
const REF_DEF = /^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm
const AT_IMPORT = /^@([\w./-]+)$/gm
const placeholder = t => /[<*|]|NNNN|YYYY/.test(t)
const resolves = (file, t) => known(path.resolve(path.dirname(file), t)) || known(path.join(root, t))

for (const r of files) {
  const file = path.join(root, r)
  const isDoc = r.endsWith('.md')
  if (r.startsWith('docs/templates/') || r === 'tools/check-docs.mjs') continue
  let text = fs.readFileSync(file, 'utf8')
  if (isDoc) text = text.replace(/~~[^~\n]*~~/g, '') // only in Markdown: in JS, ~~ is integer truncation
  // research reports quote other projects' files (0 A.D., OpenRA): there only our own docs/ paths are checked
  const research = r.startsWith('docs/research/')
  const tokens = new Set()
  for (const m of text.matchAll(ROOT_PATH)) if (!research || m[1].startsWith('docs/')) tokens.add(m[1])
  if (!research) {
    for (const m of text.matchAll(REL_PATH)) tokens.add(m[1])
    for (const m of text.matchAll(MD_NAME)) tokens.add(m[1])
    if (!isDoc) for (const m of text.matchAll(CODE_NAME)) tokens.add(m[1])
    if (isDoc) for (const m of text.replace(/```[\s\S]*?```/g, '').matchAll(TICKED)) tokens.add(m[1])
  }
  for (const t of tokens) if (!placeholder(t) && !resolves(file, t)) problems.push(`${r}: missing path ${t}`)
  if (path.basename(r) === 'CLAUDE.md') {
    for (const m of text.matchAll(AT_IMPORT)) {
      if (!known(path.resolve(path.dirname(file), m[1]))) problems.push(`${r}: missing import ${m[1]}`)
    }
  }
  if (isDoc) {
    const prose = text.replace(/```[\s\S]*?```/g, '') // links inside code blocks are code
    for (const m of [...prose.matchAll(MD_LINK), ...prose.matchAll(REF_DEF)]) {
      const target = m[1]
      if (/^[a-z]+:/i.test(target) || placeholder(target)) continue // URLs, placeholders
      if (!known(path.resolve(path.dirname(file), target))) problems.push(`${r}: broken link ${target}`)
    }
  }
}

// docs/: front matter, real dates, decision slugs, and every doc listed in an index
const INDEXES = ['docs/INDEX.md', 'docs/systems/README.md', 'docs/decisions/README.md']
const decDir = path.join(root, 'docs/decisions')
const decs = files.filter(f => /^docs\/decisions\/\d{4}-.+\.md$/.test(f)).map(f => path.basename(f))
const realDate = s => {
  const d = new Date(s + 'T00:00:00Z')
  return !isNaN(d) && d.toISOString().slice(0, 10) === s
}
const FM = /^---\n([\s\S]*?)\n---\n/
for (const r of files.filter(f => f.startsWith('docs/') && f.endsWith('.md') && !f.startsWith('docs/templates/'))) {
  const m = fs.readFileSync(path.join(root, r), 'utf8').match(FM)
  const isDecision = /^docs\/decisions\/\d{4}-/.test(r)
  const key = isDecision ? 'date' : 'last_reviewed'
  if (!m) {
    problems.push(`${r}: no front matter`)
    continue
  }
  if (!/^status: \S/m.test(m[1])) problems.push(`${r}: front matter without status`)
  const dm = m[1].match(new RegExp(`^${key}: (\\d{4}-\\d{2}-\\d{2})$`, 'm'))
  if (!dm) problems.push(`${r}: front matter without ${key} (YYYY-MM-DD)`)
  else if (!realDate(dm[1])) problems.push(`${r}: impossible date ${dm[1]}`)
  const ds = m[1].match(/^decisions: \[(.*)\]$/m)
  if (ds) {
    for (const slug of ds[1]
      .split(',')
      .map(x => x.trim())
      .filter(Boolean)) {
      if (!decs.includes(`${slug}.md`)) problems.push(`${r}: unknown decision ${slug}`)
    }
  }
  if (INDEXES.includes(r)) continue
  // listed = an index links its exact path (relative to that index) or names its repo path
  const listed = INDEXES.some(ix => {
    const t = fs.readFileSync(path.join(root, ix), 'utf8')
    const relTo = path.posix.relative(path.posix.dirname(ix), r)
    return t.includes(`(${relTo})`) || t.includes(`\`${r}\``)
  })
  if (!listed) problems.push(`${r}: not listed in any index`)
}

// decisions: unique numbers; each listed in the table with the same status as its file
const seen = new Map()
for (const f of decs) {
  const n = f.slice(0, 4)
  if (seen.has(n)) problems.push(`decision number ${n} used twice: ${seen.get(n)}, ${f}`)
  seen.set(n, f)
}
const table = fs.readFileSync(path.join(decDir, 'README.md'), 'utf8').split('\n')
for (const f of decs) {
  const row = table.find(l => l.includes(`(${f})`))
  if (!row) {
    problems.push(`docs/decisions/README.md: ${f} not listed`)
    continue
  }
  const st = (fs.readFileSync(path.join(decDir, f), 'utf8').match(/^status: (.+)$/m) || [])[1]?.trim()
  if (st && !row.trim().endsWith(`| ${st} |`)) {
    problems.push(`docs/decisions/README.md: ${f} is "${st}" in its file but not in the table`)
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`check-docs: ${problems.length} problem(s)`)
  process.exit(1)
}
console.log(`check-docs: ok (${files.length} files, ${decs.length} decisions)`)
