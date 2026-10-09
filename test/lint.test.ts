import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('4. lint: the determinism rules hold in src/sim/', () => {
  it('src/sim/ is clean', async () => {
    const res = await new ESLint({ cwd: root }).lintFiles(['src/sim/**/*.ts'])
    expect(res.flatMap(r => r.messages.map(m => `${path.relative(root, r.filePath)}:${m.line} ${m.ruleId} ${m.message}`))).toEqual([])
  })
  it('each banned construct in the fixture is reported, one error per marked line', async () => {
    const text = fs.readFileSync(path.join(root, 'test', 'fixtures', 'banned-in-sim.ts'), 'utf8')
    // linted as if it were a sim file
    const [res] = await new ESLint({ cwd: root }).lintText(text, { filePath: path.join(root, 'src', 'sim', 'fixture-banned.ts') })
    const marked = text.split('\n').map((l, i) => l.includes('// BANNED') ? i + 1 : 0).filter(Boolean)
    const hit = [...new Set(res.messages.filter(m => m.severity === 2 && m.ruleId?.startsWith('no-restricted')).map(m => m.line))]
    expect(hit.sort((a, b) => a - b)).toEqual(marked)
    expect(marked.length).toBeGreaterThanOrEqual(20)
  })
})
