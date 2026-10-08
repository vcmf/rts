// Docs check (docs/conventions.md): every repo path mentioned in docs and code exists, every relative
// Markdown link resolves, every doc under docs/ has front matter, decision numbers are unique and indexed.
// Run: node tools/check-docs.mjs   (exit 1 on any problem; prints every problem)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['.git', 'node_modules', 'assets', 'renders'])
const problems = []
const rel = p => path.relative(root, p)

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(md|html|js|mjs|py)$/.test(e.name) && !e.name.endsWith('.data.js')) out.push(p)
  }
  return out
}

// a repo path is anything starting with a top-level folder or a root doc; placeholders and globs are skipped
const ROOT_PATH = /(?<![\w./-])((?:docs|prototypes|tools|design)\/[\w./-]*[\w/]|(?:AGENTS|CLAUDE|README)\.md)(?![\w])/g
const MD_LINK = /\]\(([^)\s#]+)(#[^)]*)?\)/g
const exists = p => fs.existsSync(p)

for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8'), r = rel(file)
  // research reports quote other projects' paths (0 A.D., OpenRA): only their Markdown links are checked
  const checkRootPaths = !r.startsWith('docs/research/') && !r.startsWith('docs/templates/') && r !== 'tools/check-docs.mjs'
  if (checkRootPaths) for (const m of text.matchAll(ROOT_PATH)) {
    const p = m[1]
    if (/[<*|]|NNNN/.test(p)) continue
    if (!exists(path.join(root, p))) problems.push(`${r}: missing path ${p}`)
  }
  if (file.endsWith('.md')) for (const m of text.replace(/```[\s\S]*?```/g, '').matchAll(MD_LINK)) {   // links inside code blocks are code
    const target = m[1]
    if (/^[a-z]+:/i.test(target) || /[<*|]/.test(target)) continue   // URLs, placeholders
    if (!exists(path.resolve(path.dirname(file), target))) problems.push(`${r}: broken link ${target}`)
  }
}

// front matter on every doc under docs/ (templates hold placeholders)
const FM = /^---\n([\s\S]*?)\n---\n/
for (const file of walk(path.join(root, 'docs')).filter(f => f.endsWith('.md'))) {
  const r = rel(file)
  if (r.startsWith('docs/templates/')) continue
  const m = fs.readFileSync(file, 'utf8').match(FM)
  if (!m) { problems.push(`${r}: no front matter`); continue }
  if (!/^status: \S/m.test(m[1])) problems.push(`${r}: front matter without status`)
  const date = r.startsWith('docs/decisions/0') ? /^date: \d{4}-\d{2}-\d{2}$/m : /^last_reviewed: \d{4}-\d{2}-\d{2}$/m
  if (!date.test(m[1])) problems.push(`${r}: front matter without ${r.startsWith('docs/decisions/0') ? 'date' : 'last_reviewed'} (YYYY-MM-DD)`)
}

// decisions: unique numbers, all listed in the decisions README
const decDir = path.join(root, 'docs/decisions')
const decs = fs.readdirSync(decDir).filter(f => /^\d{4}-.+\.md$/.test(f))
const seen = new Map()
for (const f of decs) { const n = f.slice(0, 4); if (seen.has(n)) problems.push(`decision number ${n} used twice: ${seen.get(n)}, ${f}`); seen.set(n, f) }
const index = fs.readFileSync(path.join(decDir, 'README.md'), 'utf8')
for (const f of decs) if (!index.includes(`(${f})`)) problems.push(`docs/decisions/README.md: ${f} not listed`)

if (problems.length) { console.error(problems.join('\n')); console.error(`check-docs: ${problems.length} problem(s)`); process.exit(1) }
console.log(`check-docs: ok (${decs.length} decisions)`)
