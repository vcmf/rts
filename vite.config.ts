import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
// the S1b page: app/index.html; `npm run dev` serves it at /app/. The look page (Track E): app/look.html
// __BUILD__: the commit a page was built from (the look bench records it), "-dirty" with uncommitted changes to
// tracked files or new files in src/, app/, tools/
const build = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() + (execSync('git status --porcelain --untracked-files=no').toString().trim() || execSync('git status --porcelain -- src app tools').toString().trim() ? '-dirty' : '') } catch { return 'unknown' } })()
export default defineConfig({ define: { __BUILD__: JSON.stringify(build) }, build: { outDir: 'dist', rollupOptions: { input: ['app/index.html', 'app/look.html'] } } })
