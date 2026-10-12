// The readability guard (docs/plans/active/l2-detail.md, L2a; the track plan's stage 1): flat blocks in the four army
// coats at battalion size on the ground, and a greyscale check that each separates from the ground under it.
//
//   node tools/guard.mjs <look page URL> [outDir]                  every block must separate
//   node tools/guard.mjs <look page URL> --base <URL> [outDir]     no block that separates on the base may fail
//   node tools/guard.mjs <look page URL> --view cover ...           the cover's view (L5): blocks on each class
//
// For each season (summer, winter) at the default view: the ground alone, then the ground with the coat blocks. A
// block's pixels come from two mask renders (the blocks flat white, then flat black: all of the block that shows,
// nothing hidden behind a tree); its luma (Rec. 709, on the 0–1 values of the frame) is compared with the ground's
// luma at the same pixels, in the frame without blocks. A block separates when they differ by at least SEP.
// The negative, in summer: the same blocks painted grey, each at the grey that matches the ground's value under it
// (interpolated from two greys), must not separate: else the check cannot tell a block that does not read from one
// that does. It takes a second page load. What it proves is limited: the grey is fitted on the same pixels it is
// then measured on, so it checks the masks, the renders and the measure end to end, not a different comparison.
// Also reported, not gated: whether a block is more saturated than the 99th percentile of the ground's saturation.
// Exit 1 on a failure. The page: the look page, built (`npm run build`, `npx vite preview`).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as png from './png.mjs'
import { CAMS } from './golden.mjs'
import { prepSteps, shoot, viewStep } from './look-page.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1280, H = 720, SEP = 0.10, MASKED = 96   // a block's pixel: its white and black mask renders differ by more than MASKED/255
const START = CAMS.find(c => c[0] === 'start').slice(1, 5)   // the default view (the goldens' start): alpha, beta, radius, target
const GREYS = [0.3, 0.7]   // the negative's two greys, from which each block's matched grey is interpolated
const SEASONS = [['summer', 0, true], ['winter', 3, false]]   // name, season value, run the negative
const ARMY_HEX = { France: '#2C4FA8', Russia: '#2F6B3C', Austria: '#E9E3D3', Britain: '#B3302A' }   // docs/art-bible.md §4
const COATS = Object.keys(ARMY_HEX)
// cluster centres on the default view (world x, z, yaw), chosen to put the coats on each band of the ground: four
// blocks in a column, 7 m apart
const START_SPOTS = [
  ['sunlit-slope', -40, 20, 0],
  ['cloud-shadow', 12, -10, 0],
  ['flat', 30, 62, 0],
  ['meadow', -5, 25, 0],
  ['wheat', -45, -17, 0],
  ['open-low', 45, 15, 0],
]
// --view cover (docs/plans/active/l5-macro.md): east of the hill, the coats on each class of the ground's cover (the
// ploughed field, the track, the road, the village ground)
const COVER = [START[0], 0.8, 150, [150, 8, -25]]
const COVER_SPOTS = [['ploughed', 75, -38, 0], ['track', 150, -61, 0], ['road', 185, -10, 0], ['village', 228, -2, 0]]
let VIEW = START, SPOTS = START_SPOTS
const blocks = (color = null) => SPOTS.flatMap(([s, x, z, yaw]) => COATS.map((c, i) => ({ name: `${s}.${c}`, x, z: z + (i - 1.5) * 7, yaw, color: color ?? c })))

const hex = g => '#' + Math.round(Math.min(1, Math.max(0, g)) * 255).toString(16).padStart(2, '0').repeat(3)

// run 1 (matched null): per season the ground, the coat blocks and their masks, and in summer the blocks at the two
// greys. Run 2: summer only, each block at its matched grey (name → colour)
function render(url, dir, matched = null) {
  const steps = prepSteps()
  for (const [season, sv, negative] of SEASONS) {
    if (matched && !negative) continue
    steps.push(viewStep([season, ...VIEW, sv]))
    const add = (tag, specs) => ['eval', `(async () => { const L = __look.lab; L.clearBlocks(); L.addBlocks(${JSON.stringify(specs)})
        await __proto.scene.whenReadyAsync(true); for (let i = 0; i < 3; i++) __proto.scene.render()
        return "BOXES ${season}.${tag} " + JSON.stringify({ w: __proto.scene.getEngine().getRenderWidth(), h: __proto.scene.getEngine().getRenderHeight(), boxes: L.blockBoxes() }) })()`]
    if (matched) { steps.push(add('matched', blocks().map(b => ({ ...b, color: matched[b.name] }))), ['shot', `${season}.matched`]); continue }
    steps.push(['shot', `${season}.ground`], add('coats', blocks().map(b => ({ ...b, color: ARMY_HEX[b.color] }))), ['shot', `${season}.coats`])
    // a block's own pixels: drawn flat white, then flat black; the ground and whatever hides a block are the same in both
    for (const v of [1, 0]) steps.push(['eval', `__look.lab.setMask(${v}); for (let i = 0; i < 3; i++) __proto.scene.render(); "mask ${v}"`], ['shot', `${season}.mask${v}`])
    steps.push(['eval', '__look.lab.setMask(-1); "painted"'])
    if (negative) for (const [i, g] of GREYS.entries()) steps.push(add(`grey${i}`, blocks(hex(g))), ['shot', `${season}.grey${i}`])
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
// each block's pixels: where its white and black mask renders differ, inside its box, and nearer its centre than any
// other block whose box holds them. All of the block, not just the part that differs from the ground (which would
// leave out exactly the pixels that make a block hard to read)
function blockPixels(white, black, info) {
  const sx = white.w / info.w, sy = white.h / info.h, px = new Map(info.boxes.map(b => [b.name, []]))
  for (let y = 0; y < white.h; y++) for (let x = 0; x < white.w; x++) {
    const k = (y * white.w + x) * 4
    if (Math.max(white.data[k] - black.data[k], white.data[k + 1] - black.data[k + 1], white.data[k + 2] - black.data[k + 2]) <= MASKED) continue
    let best = null, bd = Infinity
    for (const b of info.boxes) {
      if (x < b.x0 * sx - 1 || x > b.x1 * sx + 1 || y < b.y0 * sy - 1 || y > b.y1 * sy + 1) continue
      const e = (x - b.cx * sx) ** 2 + (y - b.cy * sy) ** 2; if (e < bd) { bd = e; best = b.name }
    }
    if (best) px.get(best).push(k)
  }
  return px
}
const meanLuma = (im, ks) => ks.reduce((a, k) => a + luma(im.data, k), 0) / ks.length

// per block: { season, name, n, yb, yg, sep, pass, sat, satP99, negSep } (negSep: summer only)
export function measure(url, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  const boxes = render(url, outDir), img = n => png.read(fs.readFileSync(path.join(outDir, `${n}.png`))), res = new Map(), px = {}
  for (const [season, , negative] of SEASONS) {
    const ground = img(`${season}.ground`), coats = img(`${season}.coats`)
    const info = boxes[`${season}.coats`]; if (!info) throw new Error(`no block boxes for ${season}`)
    const gs = []; for (let k = 0; k < ground.data.length; k += 16) gs.push(sat(ground.data[k], ground.data[k + 1], ground.data[k + 2]))
    gs.sort((a, b) => a - b); const satP99 = gs[Math.floor(0.99 * gs.length)]
    px[season] = blockPixels(img(`${season}.mask1`), img(`${season}.mask0`), info)
    const greys = negative ? GREYS.map((_, i) => img(`${season}.grey${i}`)) : null
    for (const [name, ks] of px[season]) {
      const n = ks.length, key = `${name}.${season}`
      if (n < 50) { res.set(key, { season, name, n, hidden: true }); continue }
      let r = 0, g = 0, b = 0
      for (const k of ks) { r += coats.data[k]; g += coats.data[k + 1]; b += coats.data[k + 2] }
      const yb = meanLuma(coats, ks), yg = meanLuma(ground, ks), sep = Math.abs(yb - yg)
      // the grey whose block would have the ground's value here (the block's luma is close to linear in its grey)
      let match = null
      // (null where no grey in 0–1 can match: that block's negative is not measured, and is reported)
      if (greys) { const [l0, l1] = greys.map(im => meanLuma(im, ks)), m = GREYS[0] + (yg - l0) / (l1 - l0) * (GREYS[1] - GREYS[0]); match = Number.isFinite(m) && m >= 0 && m <= 1 ? m : null }
      res.set(key, { season, name, n, yb, yg, sep, pass: sep >= SEP, sat: sat(r / n, g / n, b / n), satP99, match, negSep: null })
    }
  }
  // run 2: the value-matched blocks, on the same pixels (same blocks, same view)
  const matched = {}
  for (const c of res.values()) if (c.match != null) matched[c.name] = hex(c.match)
  if (Object.keys(matched).length) {
    render(url, outDir, Object.fromEntries(blocks().map(b => [b.name, matched[b.name] ?? hex(0.5)])))
    for (const [season, , negative] of SEASONS) {
      if (!negative) continue
      const m = img(`${season}.matched`), ground = img(`${season}.ground`)
      for (const [name, ks] of px[season]) { const c = res.get(`${name}.${season}`); if (c && !c.hidden) c.negSep = Math.abs(meanLuma(m, ks) - meanLuma(ground, ks)) }
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
    if (c.hidden) { ok = false; console.log(`${head}  HIDDEN: fewer than 50 pixels (a spot to move)`); continue }
    // hidden on the base: nothing to regress from, so it is judged on its own
    const fails = base && !b.hidden ? b.pass && !c.pass : !c.pass, negBad = c.negSep != null && c.negSep >= SEP
    if (fails || negBad) ok = false
    const verdict = c.pass ? 'ok    ' : fails ? 'FAILS ' : 'fails*'
    console.log(`${head}  ${c.yb.toFixed(3)}  ${c.yg.toFixed(3)}   ${c.sep.toFixed(3)}  ${verdict}${base ? `  ${b.hidden ? 'hidden' : b.sep.toFixed(3)}  ` : ''}  ${c.sat.toFixed(2)} / ${c.satP99.toFixed(2)}${c.sat > c.satP99 ? '' : ' (not the most saturated)'}${c.negSep != null ? `  neg ${c.negSep.toFixed(3)}` : ''}${negBad ? `  NEGATIVE SEPARATES (${c.negSep.toFixed(3)}): the check cannot tell ground from a block` : ''}`)
  }
  const negs = [...cand.values()].filter(c => c.negSep != null), unmatched = [...cand.values()].filter(c => c.season === 'summer' && !c.hidden && c.negSep == null)
  if (unmatched.length) console.log(`negative: no grey matches the ground at ${unmatched.map(c => c.name).join(', ')} (not measured there)`)
  if (negs.length < 12) { ok = false; console.log(`negative: only ${negs.length} blocks measured (at least 12)`) }
  if (!negs.length) { ok = false; console.log('negative: NONE measured') }
  else console.log(`negative (summer, blocks at the grey that matches the ground's value): ${negs.filter(c => c.negSep >= SEP).length} of ${negs.length} separate (must be 0); largest ${Math.max(...negs.map(c => c.negSep)).toFixed(3)}`)
  if (base) console.log('fails*: does not separate here, nor on the base (a palette question for the owner, not a regression)')
  return ok
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), bi = args.indexOf('--base'), baseUrl = bi >= 0 ? args.splice(bi, 2)[1] : null
  const vi = args.indexOf('--view'), view = vi >= 0 ? args.splice(vi, 2)[1] : 'start'
  if (view === 'cover') { VIEW = COVER; SPOTS = COVER_SPOTS } else if (view !== 'start') { console.error('--view must be start or cover'); process.exit(2) }
  const [url, out = path.join(ROOT, 'scratch/guard')] = args
  if (!url || (bi >= 0 && !baseUrl)) { console.error('usage: node tools/guard.mjs <look page URL> [--base <URL>] [--view start|cover] [outDir]'); process.exit(2) }
  try { const ok = guard(url, out, baseUrl); console.log(ok ? 'guard: ok' : 'guard: FAILED'); process.exit(ok ? 0 : 1) } catch (e) { console.error('guard.mjs:', e.message); process.exit(1) }
}
