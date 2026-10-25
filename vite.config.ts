import { execSync } from 'node:child_process'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { saveMapFile, type SaveRequest } from './tools/map-save.ts'
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
// the map draft page (app/map.html, docs/plans/done/m1-language.md M1b): a saved map file, the kinds catalogue or a
// heightfield beside them is sent to the page as `map-changed` (with the time the server saw it), not a full reload
const mapsHot: Plugin = {
  name: 'maps-hot',
  handleHotUpdate({ file, server }) {
    const rel = '/' + path.relative(server.config.root, file).split(path.sep).join('/')
    if (!/^\/maps\/[^/]+\.(json|rdem)$/.test(rel)) return
    server.ws.send({ type: 'custom', event: 'map-changed', data: { file: rel, at: Date.now() } })
    return []
  },
}
// the map editor's save (docs/plans/active/m7-editor.md, decision 0066): POST /__map/save with the file, the text the
// page read and the new text; 409 with the file's text if it changed on disk since. Dev only: the built page does not
// edit
const mapsSave: Plugin = {
  name: 'maps-save',
  configureServer(server) {
    server.middlewares.use('/__map/save', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk: string) => (body += chunk))
      req.on('end', () => {
        let sent: SaveRequest
        try {
          sent = JSON.parse(body) as SaveRequest
        } catch {
          res.statusCode = 400
          res.end('not JSON')
          return
        }
        const r = saveMapFile(server.config.root, sent)
        res.statusCode = r.ok ? 200 : r.status
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(r))
      })
    })
  },
}
export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
  plugins: [mapsHot, mapsSave],
  build: { outDir: 'dist', rollupOptions: { input: ['app/index.html', 'app/look.html', 'app/map.html'] } },
})
