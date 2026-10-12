// L5b's judging kit (docs/plans/active/l5-macro.md, The judging kit): the look page's five macro arms shot at the
// judging framing, for the blind judging page. Each arm: a still per season, zoom and yaw, and a slow pan per season
// and zoom (H.264), with the readability guard's army-colour blocks on the ground and one tree type (?trees=one).
//
//   node tools/ablation-kit.mjs <look page URL> <outDir> [--seed <text>] [--arms <a,b>]
//     --seed   names the files and draws the screens' sides (default: the date): a new seed, new names
//     --arms   shoot only these arms (the rest of the kit is still written from what <outDir>/shots holds)
//
// Writes, under <outDir>:
//   media/<id>.jpg, media/<id>.mp4   the stills and pans, under opaque ids (nothing in a name tells an arm)
//   screens.json                     what the judging page shows: per screen, side x and side y's ids (no arm names)
//   key.json                         which arm each screen's x and y is, and each id: KEEP IT FROM THE JUDGES
//   <outDir>/judge.html              the judging page (tools/ablation-judge.html): publish it with screens.json and
//                                    media/ as a private artifact, its answers in its db (answers/<judge's id>)
// The page then shuffles the screens and swaps the sides per judge. Needs ffmpeg, and the machine's GPU
// (SHOT_ANGLE, default metal): SwiftShader is too slow for the pans.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARMY_HEX, COVER_SPOTS, blocksAt } from './army-blocks.mjs'
import { prepSteps, shoot, viewStep } from './look-page.mjs'

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null }
const seed = opt('--seed') ?? new Date().toISOString().slice(0, 10), only = opt('--arms')?.split(',')
const [url, outDir] = args
if (!url || !outDir) { console.error('usage: node tools/ablation-kit.mjs <look page URL> <outDir> [--seed <text>] [--arms <a,b>]'); process.exit(2) }

// the arms in the ablation's order (1 to 5), and the pairs judged: each arm against the one before it; arm 5 against
// arm 3, as arm 4 is (the plan: both abstract the same bake)
const ARMS = ['flat', 'shader', 'bake', 'strokes', 'kuwahara']
const PAIRS = [['flat', 'shader'], ['shader', 'bake'], ['bake', 'strokes'], ['bake', 'kuwahara']]
for (const a of only ?? []) if (!ARMS.includes(a)) { console.error(`--arms: unknown arm ${a}`); process.exit(2) }
// the framing (the Pratzen framing's stand-in): east of the hill, the ploughed field, the track, the road and the
// village in frame. The bench's zooms (src/look/bench.ts: closest, default, widest at the steepest pitch) and yaws
// (the default and the limits, decision 0010: SPEC.camera)
const TARGET = [95, 8, -40], YAW0 = -Math.PI / 2 - 0.35, YAW_RANGE = Math.PI / 4
const ZOOMS = { close: [0.80, 45], default: [0.80, 125], wide: [0.98, 260] }
const YAWS = { 'yaw-45': -YAW_RANGE, yaw0: 0, 'yaw+45': YAW_RANGE }
const SEASONS = { summer: 0, winter: 3 }
// the pans: FRAMES at 24 fps, the target moving along the screen's right by PAN of the zoom's distance (at the default
// zoom about 1.7 px a frame)
const FRAMES = 72, PAN = 0.1, W = 1280, H = 720

const shots = path.join(outDir, 'shots'), media = path.join(outDir, 'media')
fs.mkdirSync(shots, { recursive: true }); fs.mkdirSync(media, { recursive: true })
const run = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')} failed (exit ${r.status}):\n${r.stderr}`) }

// one page load an arm: the blocks, then every still, then the pans' frames (each pan encoded, its frames removed)
for (const arm of only ?? ARMS) {
  const u = new URL(url); u.searchParams.set('macro', arm); u.searchParams.set('trees', 'one')
  const blocks = blocksAt(COVER_SPOTS).map(b => ({ ...b, color: ARMY_HEX[b.color] }))
  const steps = [...prepSteps(), ['eval', `__look.lab.clearBlocks(); __look.lab.addBlocks(${JSON.stringify(blocks)}) + " blocks"`]]
  for (const [season, sv] of Object.entries(SEASONS)) for (const [zoom, [beta, r]] of Object.entries(ZOOMS)) {
    for (const [yaw, dy] of Object.entries(YAWS)) steps.push(viewStep([`${season}.${zoom}.${yaw}`, YAW0 + dy, beta, r, TARGET, sv]), ['shot', `${arm}.${season}.${zoom}.${yaw}`])
    // the pan: along the screen's right at the default yaw (Babylon's camera looks along −(cos α, sin α) in x, z)
    steps.push(viewStep([`${season}.${zoom}.pan`, YAW0, beta, r, TARGET, sv]))
    const rx = -Math.sin(YAW0), rz = Math.cos(YAW0)
    for (let f = 0; f < FRAMES; f++) {
      const d = (f / (FRAMES - 1) - 0.5) * PAN * r
      steps.push(['eval', `__proto.camera.target.set(${TARGET[0] + rx * d}, ${TARGET[1]}, ${TARGET[2] + rz * d}); __proto.scene.render(); ""`], ['shot', `${arm}.${season}.${zoom}.pan.${String(f).padStart(3, '0')}`])
    }
  }
  console.log(`${arm}: ${steps.filter(s => s[0] === 'shot').length} frames`)
  shoot(u.href, shots, steps, W, H, { env: { SHOT_ANGLE: process.env.SHOT_ANGLE ?? 'metal', SHOT_TIMEOUT_S: '3600' } })
  for (const season of Object.keys(SEASONS)) for (const zoom of Object.keys(ZOOMS)) {
    const stem = path.join(shots, `${arm}.${season}.${zoom}.pan`)
    run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', `${stem}.%03d.png`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${stem}.mp4`])
    for (let f = 0; f < FRAMES; f++) fs.rmSync(`${stem}.${String(f).padStart(3, '0')}.png`)
  }
}

// the opaque ids: a hash of the seed and the shot's name (the seed kept in key.json, never on the page)
const id = name => createHash('sha256').update(`${seed}:${name}`).digest('hex').slice(0, 12)
const missing = [], ids = {}
const still = name => { const src = path.join(shots, `${name}.png`); if (!fs.existsSync(src)) { missing.push(name); return null } const i = id(name); ids[i] = name; run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-q:v', '3', path.join(media, `${i}.jpg`)]); return i }
const clip = name => { const src = path.join(shots, `${name}.mp4`); if (!fs.existsSync(src)) { missing.push(name); return null } const i = id(name); ids[i] = name; fs.copyFileSync(src, path.join(media, `${i}.mp4`)); return i }
const side = arm => ({
  stills: Object.fromEntries(Object.keys(SEASONS).flatMap(s => Object.keys(YAWS).map(y => [`${s}.${y}`, null]))),
  clips: Object.fromEntries(Object.keys(SEASONS).map(s => [s, null])), arm,
})
// which arm of the pair is side x: the later arm on exactly half the screens, which half drawn from the seed (the
// judging page then swaps the sides at random per judge)
const order = PAIRS.flatMap((_, p) => Object.keys(ZOOMS).map(zoom => `screen:${p}:${zoom}`))
const laterX = new Set([...order].sort((u, v) => id(`side:${u}`).localeCompare(id(`side:${v}`))).slice(0, order.length / 2))
const screens = [], key = { seed, screens: {}, ids }
PAIRS.forEach(([a, b], p) => Object.keys(ZOOMS).forEach(zoom => {
  const sid = id(`screen:${p}:${zoom}`), [x, y] = laterX.has(`screen:${p}:${zoom}`) ? [b, a] : [a, b], sides = { x: side(x), y: side(y) }
  for (const s of Object.values(sides)) {
    for (const k of Object.keys(s.stills)) { const [season, yaw] = k.split('.'); s.stills[k] = still(`${s.arm}.${season}.${zoom}.${yaw}`) }
    for (const season of Object.keys(s.clips)) s.clips[season] = clip(`${s.arm}.${season}.${zoom}.pan`)
  }
  key.screens[sid] = { pair: [a, b], zoom, x, y }
  screens.push({ id: sid, zoom, x: { stills: sides.x.stills, clips: sides.x.clips }, y: { stills: sides.y.stills, clips: sides.y.clips } })
}))
fs.writeFileSync(path.join(outDir, 'screens.json'), JSON.stringify({ screens }, null, 1))
fs.writeFileSync(path.join(outDir, 'key.json'), JSON.stringify(key, null, 1))
fs.copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'ablation-judge.html'), `${outDir}/judge.html`)
if (missing.length) { console.error(`ablation-kit: ${missing.length} shots missing (shoot their arms first), e.g. ${missing.slice(0, 3).join(', ')}`); process.exit(1) }
console.log(`ablation-kit: ${screens.length} screens, ${Object.keys(ids).length} files in ${media}; the key in ${path.join(outDir, 'key.json')}`)
