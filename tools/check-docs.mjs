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

// Which tokens are references:
// - in code (html/js/mjs/py): repo-root paths (docs/, prototypes/, tools/, design/) and any *.md name
// - in docs: the same, plus every backticked file name with a doc or code extension, plus Markdown links
// A token resolves against the file's own folder, then the repo root, with exact letter case (macOS
// file systems ignore case; GitHub and Linux do not). Placeholders (<x>, *, |, NNNN) are skipped.
const ROOT_PATH = /(?<![\w./@-])((?:docs|prototypes|tools|design)\/[\w./-]*[\w/])(?![\w])/g
const MD_NAME = /(?<![\w./-])([\w-]+(?:\/[\w.-]+)*\.md)(?![\w])/g
const TICKED = /`@?([\w./-]+\.(?:md|html|js|mjs|py))`/g
const AT_IMPORT = /^@([\w./-]+)$/gm
const MD_LINK = /\]\(([^)\s#]+)(#[^)\s]*)?(?:\s+"[^"]*")?\)/g

// exact-case existence, segment by segment
function existsExact(p) {
  const parts = path.relative(root, p).split(path.sep)
  if (parts[0] === '..') return fs.existsSync(p)
  let dir = root
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory() || !fs.readdirSync(dir).includes(part)) return false
    dir = path.join(dir, part)
  }
  return true
}
const resolves = (file, token) => existsExact(path.resolve(path.dirname(file), token)) || existsExact(path.join(root, token))
const placeholder = t => /[<*|]|NNNN|YYYY/.test(t)

for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8'), r = rel(file)
  if (r.startsWith('docs/templates/') || r === 'tools/check-docs.mjs') continue
  const isDoc = file.endsWith('.md')
  // research reports quote other projects' files (0 A.D., OpenRA): there only our own docs/ paths are checked
  const research = r.startsWith('docs/research/')
  const tokens = new Set()
  for (const m of text.matchAll(ROOT_PATH)) if (!research || m[1].startsWith('docs/')) tokens.add(m[1])
  if (!research) {
    if (!isDoc) for (const m of text.matchAll(MD_NAME)) tokens.add(m[1])
    else for (const m of text.replace(/```[\s\S]*?```/g, '').matchAll(TICKED)) tokens.add(m[1])
  }
  for (const t of tokens) if (!placeholder(t) && !resolves(file, t)) problems.push(`${r}: missing path ${t}`)
  // @imports (CLAUDE.md bridges) must resolve from their own folder
  if (path.basename(file) === 'CLAUDE.md') for (const m of text.matchAll(AT_IMPORT))
    if (!existsExact(path.resolve(path.dirname(file), m[1]))) problems.push(`${r}: missing import ${m[1]}`)
  if (isDoc) for (const m of text.replace(/```[\s\S]*?```/g, '').matchAll(MD_LINK)) {   // links inside code blocks are code
    const target = m[1]
    if (/^[a-z]+:/i.test(target) || placeholder(target)) continue   // URLs, placeholders
    if (!existsExact(path.resolve(path.dirname(file), target))) problems.push(`${r}: broken link ${target}`)
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
