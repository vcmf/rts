// The coat check (docs/plans/active/lc1b-coats.md, Track E LC1): the army coats keep their colour under the light.
// Blocks in the four coats (docs/art-bible.md §4) at the two spots of docs/research/colour-and-light-review.md, at
// the default view, summer, with the gameplay depth of field off (its band blurs the ground into the blocks): the
// middle of the frame (outside the valley mist) and the valley floor (inside it). A block's pixels come from two mask
// renders (flat white, flat black), as the readability guard's; its lit top face is the 40 % of them after the
// brightest 10 % (the rim along its edges). That
// face's mean colour must keep the coat's hue within HUE degrees and HLS saturation at SAT of the painted one or
// more; a near-white coat (painted lightness over 0.8) must not gain saturation (it would turn cream).
//
//   node tools/coat-check.mjs <look page URL> [outDir]
//
// Prints a table; exit 1 when a coat fails. The page: the look page (npm run dev, or built and previewed).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as png from './png.mjs'
import { CAMS } from './golden.mjs'
import { blockPixels } from './guard.mjs'
import { prepSteps, shoot, viewStep } from './look-page.mjs'
import { ARMY_HEX } from './army-blocks.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1280, H = 720, HUE = 10, SAT = 0.7, RIM = 0.1, TOP = 0.4
const START = CAMS.find(c => c[0] === 'start').slice(1, 5)
// the two spots: [name, x, z] of the column's middle; the four coats 7 m apart along z
const SPOTS = [['middle', -10, 2], ['valley', 30, 62]]
const blocks = ([s, x, z]) => Object.entries(ARMY_HEX).map(([coat, hex], i) => ({ name: `${s}.${coat}`, x, z: z + (i - 1.5) * 7, yaw: 0, color: hex }))

const hls = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

export function coatCheck(url, out) {
  const u = new URL(url); u.searchParams.set('dof', '0')
  const steps = [...prepSteps(), viewStep(['coats', ...START, 0])]
  for (const spot of SPOTS) {
    steps.push(['eval', `(async () => { const L = __look.lab; L.clearBlocks(); L.addBlocks(${JSON.stringify(blocks(spot))})
      await __proto.scene.whenReadyAsync(true); for (let i = 0; i < 3; i++) __proto.scene.render()
      return "BOXES ${spot[0]} " + JSON.stringify({ w: __proto.scene.getEngine().getRenderWidth(), h: __proto.scene.getEngine().getRenderHeight(), boxes: L.blockBoxes() }) })()`], ['shot', `${spot[0]}.coats`])
    for (const v of [1, 0]) steps.push(['eval', `__look.lab.setMask(${v}); for (let i = 0; i < 3; i++) __proto.scene.render(); "mask ${v}"`], ['shot', `${spot[0]}.mask${v}`])
    steps.push(['eval', '__look.lab.setMask(-1); __look.lab.clearBlocks(); "cleared"'])
  }
  const log = shoot(u.href, out, steps, W, H), boxes = {}
  for (const line of log.split('\n')) { const m = /^EVAL "BOXES (\S+) (.*)"$/.exec(line); if (m) boxes[m[1]] = JSON.parse(JSON.parse(`"${m[2]}"`)) }
  const rows = []
  for (const [s] of SPOTS) {
    if (!boxes[s]) throw new Error(`no block boxes for ${s}`)
    const im = name => png.read(fs.readFileSync(path.join(out, `${s}.${name}.png`)))
    const coats = im('coats'), px = blockPixels(im('mask1'), im('mask0'), boxes[s])
    for (const [name, ks] of px) {
      if (ks.length < 200) { rows.push({ name, fail: `only ${ks.length} pixels` }); continue }
      const d = coats.data, lum = k => 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]
      const top = [...ks].sort((a, b) => lum(b) - lum(a)).slice(Math.round(ks.length * RIM), Math.round(ks.length * (RIM + TOP)))
      const mean = [0, 1, 2].map(i => top.reduce((a, k) => a + d[k + i], 0) / top.length)
      const painted = hls(hex2rgb(ARMY_HEX[name.split('.')[1]])), seen = hls(mean)
      const white = painted[2] > 0.8, dh = hueDiff(seen[0], painted[0])
      const ok = white ? seen[1] <= painted[1] : dh <= HUE && seen[1] >= SAT * painted[1]
      rows.push({ name, n: top.length, rgb: mean.map(Math.round), hue: [Math.round(painted[0]), Math.round(seen[0])], sat: [+painted[1].toFixed(2), +seen[1].toFixed(2)], fail: ok ? null : white ? 'a white turned saturated' : dh > HUE ? `hue off by ${Math.round(dh)}°` : `saturation under ${SAT} of the painted` })
    }
  }
  return rows
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [url, out = path.join(ROOT, 'scratch/coat-check')] = process.argv.slice(2)
  if (!url) { console.error('usage: node tools/coat-check.mjs <look page URL> [outDir]'); process.exit(2) }
  try {
    const rows = coatCheck(url, out)
    console.log('block              px    rgb (lit top)      hue painted→seen  sat painted→seen')
    for (const r of rows) console.log(r.rgb ? `${r.name.padEnd(17)} ${String(r.n).padStart(5)}  ${JSON.stringify(r.rgb).padEnd(17)}  ${String(r.hue[0]).padStart(3)} → ${String(r.hue[1]).padStart(3)}        ${r.sat[0].toFixed(2)} → ${r.sat[1].toFixed(2)}  ${r.fail ?? 'ok'}` : `${r.name.padEnd(17)} ${r.fail}`)
    const bad = rows.filter(r => r.fail).length
    console.log(bad ? `coat-check: ${bad} FAILED` : 'coat-check: ok'); process.exit(bad ? 1 : 0)
  } catch (e) { console.error('coat-check.mjs:', e.message); process.exit(1) }
}
