import { execSync } from 'node:child_process'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
// the S1b page: app/index.html; `npm run dev` serves it at /app/. The look page (Track E): app/look.html; the map
// draft (Track M): app/map.html
// __BUILD__: the commit a page was built from (the look bench records it), "-dirty" with uncommitted changes to
// tracked files or new files in src/, app/, tools/
const build = (() => {
  try {
    return (
      execSync('git rev-parse --short HEAD').toString().trim() +
      (execSync('git status --porcelain --untracked-files=no').toString().trim() ||
      execSync('git status --porcelain -- src app tools').toString().trim()
        ? '-dirty'
        : '')
    )
  } catch {
    return 'unknown'
  }
})()
// the map draft page (app/map.html, docs/plans/done/m1-language.md M1b): a saved map file or the kinds catalogue
// is sent to the page as `map-changed` (with the time the server saw it), instead of a full reload
const mapsHot: Plugin = {
  name: 'maps-hot',
  handleHotUpdate({ file, server }) {
    const rel = '/' + path.relative(server.config.root, file).split(path.sep).join('/')
    if (!/^\/maps\/[^/]+\.json$/.test(rel)) return
    server.ws.send({ type: 'custom', event: 'map-changed', data: { file: rel, at: Date.now() } })
    return []
  },
}
export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
  plugins: [mapsHot],
  build: { outDir: 'dist', rollupOptions: { input: ['app/index.html', 'app/look.html', 'app/map.html'] } },
})
