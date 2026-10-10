// The readability guard (docs/plans/active/l2-detail.md, L2a; the track plan's stage 1): flat blocks in the four army
// coats at battalion size on the ground, and a greyscale check that each separates from the ground under it.
//
//   node tools/guard.mjs <look page URL> [outDir]                  every block must separate
//   node tools/guard.mjs <look page URL> --base <URL> [outDir]     no block that separates on the base may fail
//
// For each season (summer, winter) at the default view: the ground alone, then the ground with the coat blocks. A
// block's pixels are those where it changes the frame (inside its projected box); its luma (Rec. 709, on the 0–1
// values of the frame) is compared with the ground's luma at the same pixels, in the frame without blocks. A block
// separates when they differ by at least SEP.
// The negative, in summer: the same blocks painted by the terrain's own material must not separate (else the check
// cannot tell a block from the ground). Not in winter: there a ground-coloured block still shows by its shadowed
// sides against the snow, which is real separation.
// Also reported, not gated: whether a block is more saturated than the 99th percentile of the ground's saturation.
// Exit 1 on a failure. The page: the look page, built (`npm run build`, `npx vite preview`).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as png from './png.mjs'
import { prepSteps, shoot, viewStep } from './look-page.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1280, H = 720, SEP = 0.10, CHANGED = 10   // a pixel belongs to a block when a channel moves by more than CHANGED/255
const A0 = -Math.PI / 2 - 0.35
const VIEW = [A0, 0.80, 125, [-10, 8, 2]]   // the default view: alpha, beta, radius, target
const SEASONS = [['summer', 0, true], ['winter', 3, false]]   // name, season value, run the negative
const ARMY_HEX = { France: '#2C4FA8', Russia: '#2F6B3C', Austria: '#E9E3D3', Britain: '#B3302A' }   // docs/art-bible.md §4
const COATS = Object.keys(ARMY_HEX)
// cluster centres on the default view (world x, z, yaw), chosen to put the coats on each band of the ground: four
// blocks in a column, 7 m apart
const SPOTS = [
  ['sunlit-slope', -40, 20, 0],
  ['cloud-shadow', 12, -10, 0],
  ['flat', 30, 62, 0],
  ['meadow', -5, 25, 0],
  ['wheat', -45, -17, 0],
  ['open-low', 45, 15, 0],
]
const blocks = (color) => SPOTS.flatMap(([s, x, z, yaw]) => COATS.map((c, i) => ({ name: `${s}.${c}`, x, z: z + (i - 1.5) * 7, yaw, color: color ?? c })))

function render(url, dir) {
  const steps = prepSteps()
  for (const [season, sv, negative] of SEASONS) {
    steps.push(viewStep([season, ...VIEW, sv]), ['shot', `${season}.ground`])
    for (const [tag, color] of [['coats', null], ...(negative ? [['negative', 'ground']] : [])]) {
      const specs = blocks(color).map(b => ({ ...b, color: b.color in ARMY_HEX ? ARMY_HEX[b.color] : b.color }))
      steps.push(['eval', `(async () => { const L = __look.lab; L.clearBlocks(); L.addBlocks(${JSON.stringify(specs)})
        await __proto.scene.whenReadyAsync(true); for (let i = 0; i < 3; i++) __proto.scene.render()
        return "BOXES ${season}.${tag} " + JSON.stringify({ w: __proto.scene.getEngine().getRenderWidth(), h: __proto.scene.getEngine().getRenderHeight(), boxes: L.blockBoxes() }) })()`], ['shot', `${season}.${tag}`])
    }
    steps.push(['eval', '__look.lab.clearBlocks(); "cleared"'])
  }
  const out = shoot(url, dir, steps, W, H), boxes = {}
  for (const line of out.split('\n')) {
    const m = /^EVAL "BOXES (\S+) (.*)"$/.exec(line); if (!m) continue
    boxes[m[1]] = JSON.parse(JSON.parse(`"${m[2]}"`))
  }
  return boxes
}

const luma = (d, k) => (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255
const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 0 ? (mx - mn) / mx : 0 }

// each block's pixels: inside its box, changed by it, and nearer its centre than any other block whose box holds them
function blockPixels(ground, withBlocks, info) {
  const sx = ground.w / info.w, sy = ground.h / info.h, px = new Map(info.boxes.map(b => [b.name, []]))
  for (let y = 0; y < ground.h; y++) for (let x = 0; x < ground.w; x++) {
    const k = (y * ground.w + x) * 4, d = Math.max(Math.abs(ground.data[k] - withBlocks.data[k]), Math.abs(ground.data[k + 1] - withBlocks.data[k + 1]), Math.abs(ground.data[k + 2] - withBlocks.data[k + 2]))
    if (d <= CHANGED) continue
    let best = null, bd = Infinity
    for (const b of info.boxes) {
      if (x < b.x0 * sx || x > b.x1 * sx || y < b.y0 * sy || y > b.y1 * sy) continue
      const e = (x - b.cx * sx) ** 2 + (y - b.cy * sy) ** 2; if (e < bd) { bd = e; best = b.name }
    }
    if (best) px.get(best).push(k)
  }
  return px
}

// per block: { season, n, yb, yg, sep, pass, sat, satP99, negSep } (negSep: summer only)
export function measure(url, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  const boxes = render(url, outDir), img = n => png.read(fs.readFileSync(path.join(outDir, `${n}.png`))), res = new Map()
  for (const [season, , negative] of SEASONS) {
    const ground = img(`${season}.ground`), coats = img(`${season}.coats`), neg = negative ? img(`${season}.negative`) : null
    const info = boxes[`${season}.coats`]; if (!info) throw new Error(`no block boxes for ${season}`)
    const gs = []; for (let k = 0; k < ground.data.length; k += 16) gs.push(sat(ground.data[k], ground.data[k + 1], ground.data[k + 2]))
    gs.sort((a, b) => a - b); const satP99 = gs[Math.floor(0.99 * gs.length)]
    for (const [name, ks] of blockPixels(ground, coats, info)) {
      const n = ks.length, key = `${name}.${season}`
      if (n < 50) { res.set(key, { season, name, n, hidden: true }); continue }
      let yb = 0, yg = 0, yn = 0, r = 0, g = 0, b = 0
      for (const k of ks) { yb += luma(coats.data, k); yg += luma(ground.data, k); if (neg) yn += luma(neg.data, k); r += coats.data[k]; g += coats.data[k + 1]; b += coats.data[k + 2] }
      yb /= n; yg /= n; yn /= n
      const sep = Math.abs(yb - yg)
      res.set(key, { season, name, n, yb, yg, sep, pass: sep >= SEP, sat: sat(r / n, g / n, b / n), satP99, negSep: neg ? Math.abs(yn - yg) : null })
    }
  }
  return res
}

// the table, and the verdict: with a base, a block fails only if it separates there and not here
export function guard(url, outDir, baseUrl = null) {
  const cand = measure(url, path.join(outDir, 'cand')), base = baseUrl ? measure(baseUrl, path.join(outDir, 'base')) : null
  let ok = true
  console.log(`block                 season    px  block  ground  sep    (≥${SEP})${base ? '  base sep' : ''}  sat block / ground p99`)
  for (const [key, c] of cand) {
    const b = base?.get(key), head = `${c.name.padEnd(22)}${c.season.padEnd(8)}${String(c.n).padStart(5)}`
    if (c.hidden || b?.hidden) { ok = false; console.log(`${head}  HIDDEN: fewer than 50 pixels${b?.hidden ? ' on the base' : ''} (a spot to move)`); continue }
    const fails = base ? b.pass && !c.pass : !c.pass, negBad = c.negSep != null && c.negSep >= SEP
    if (fails || negBad) ok = false
    const verdict = c.pass ? 'ok    ' : fails ? 'FAILS ' : 'fails*'
    console.log(`${head}  ${c.yb.toFixed(3)}  ${c.yg.toFixed(3)}   ${c.sep.toFixed(3)}  ${verdict}${base ? `  ${b.sep.toFixed(3)}  ` : ''}  ${c.sat.toFixed(2)} / ${c.satP99.toFixed(2)}${c.sat > c.satP99 ? '' : ' (not the most saturated)'}${negBad ? `  NEGATIVE SEPARATES (${c.negSep.toFixed(3)}): the check cannot tell ground from a block` : ''}`)
  }
  const negs = [...cand.values()].filter(c => c.negSep != null)
  if (!negs.length) { ok = false; console.log('negative: NONE measured') }
  else console.log(`negative (summer, terrain-painted blocks): ${negs.filter(c => c.negSep >= SEP).length} of ${negs.length} separate (must be 0); largest ${Math.max(...negs.map(c => c.negSep)).toFixed(3)}`)
  if (base) console.log('fails*: does not separate here, nor on the base (a palette question for the owner, not a regression)')
  return ok
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), bi = args.indexOf('--base'), baseUrl = bi >= 0 ? args.splice(bi, 2)[1] : null
  const [url, out = path.join(ROOT, 'scratch/guard')] = args
  if (!url || (bi >= 0 && !baseUrl)) { console.error('usage: node tools/guard.mjs <look page URL> [--base <URL>] [outDir]'); process.exit(2) }
  try { const ok = guard(url, out, baseUrl); console.log(ok ? 'guard: ok' : 'guard: FAILED'); process.exit(ok ? 0 : 1) } catch (e) { console.error('guard.mjs:', e.message); process.exit(1) }
}
