import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import prettier from 'prettier'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// decision 0052 formats the code area by area: the files Prettier formats (.prettierignore) and the files the
// style rules cover (eslint.config.js's `formatted`) must be the same set
describe('code style: one scope for the formatter and the style rules', () => {
  it('every code file is either formatted and style-checked, or neither', async () => {
    const files = execFileSync('git', ['ls-files', '*.ts', '*.mjs', '*.js'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    const eslint = new ESLint({ cwd: root })
    const ignorePath = path.join(root, '.prettierignore')
    const odd: string[] = []
    for (const f of files) {
      const abs = path.join(root, f)
      const formats = !(await prettier.getFileInfo(abs, { ignorePath })).ignored
      const config = (await eslint.isPathIgnored(abs)) ? undefined : await eslint.calculateConfigForFile(abs)
      const styled = config?.rules?.['@stylistic/max-len'] !== undefined
      if (formats !== styled) {
        odd.push(`${f}: ${formats ? 'formatted, not style-checked' : 'style-checked, not formatted'}`)
      }
    }
    expect(odd).toEqual([])
    expect(files.length).toBeGreaterThan(100)
  })
})
