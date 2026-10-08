// Formation core (docs/plans/active/formation-feel.md): terrain data, the 20 Hz formation layer and the
// per-frame soldier layer, with no rendering. Loaded by prototypes/formation-map.html (a plain script,
// so it runs from file://). Exposes the global FC.
// The layers follow docs/research/formation-movement-and-doc-systems.md §4. A feel and benchmark test:
// not yet the deterministic simulation (docs/proposals/sim-design.md §2 rules do not apply here).
(() => {
/* ---------- seeded RNG (repeatable maps and screenshots) ---------- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* =========================================================================
   TERRAIN: hills (contours on the map), a stream with one ford, a road, a wood, rocks.
   Heights are sampled once into a grid (the one authority for height, decision 0012); slope and the
   map's contours both read it.
   ========================================================================= */
const FIELD = 360, HALF = FIELD / 2;
const STREAM_X = z => 70 + 6 * Math.sin(z * 0.03);
const FORD = { z0: -9, z1: 9 };
const WOOD = { x: -45, z: 55, r: 30 };
const HILLS = [   // summits for spot heights; r is the spread
  { x: 0, z: 95, h: 22, r: 46, name: 'Hill A' }, { x: -105, z: -55, h: 15, r: 36, name: 'Hill B' },
  { x: 130, z: -95, h: 17, r: 40, name: 'Hill C' }, { x: -20, z: -125, h: 8, r: 30, name: 'Knoll' },
];
const ROAD = [[-180, -14], [-110, -8], [-50, -4], [STREAM_X(0) - 14, 0], [STREAM_X(0) + 14, 0], [125, 18], [180, 40]];
const WATER_HALF = 5;
function baseH(x, z) {
  let h = 6 + 1.6 * Math.sin(x * 0.031 + 1) * Math.cos(z * 0.027) + 0.8 * Math.sin(x * 0.07 - z * 0.05);
  for (const p of HILLS) h += p.h * Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r));
  h -= 4 * Math.exp(-(((x - STREAM_X(z)) / 28) ** 2));   // the stream's valley
  return h;
}
function streamDepth(x, z) {   // depth below the banks: 0 outside the channel
  const d = Math.abs(x - STREAM_X(z)); if (d > WATER_HALF + 2) return 0;
  const bed = z > FORD.z0 && z < FORD.z1 ? 0.45 : 1.1;
  const k = Math.min(1, Math.max(0, (WATER_HALF + 2 - d) / 2.5));
  return bed * k * k * (3 - 2 * k);
}
const formulaH = (x, z) => baseH(x, z) - streamDepth(x, z);
// the height grid: 1 m cells, bilinear reads
const HG = 1, HN = FIELD / HG + 1, heights = new Float32Array(HN * HN);
for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) heights[j * HN + i] = formulaH(i * HG - HALF, j * HG - HALF);
function H(x, z) {
  const u = Math.min(HN - 1.001, Math.max(0, (x + HALF) / HG)), v = Math.min(HN - 1.001, Math.max(0, (z + HALF) / HG));
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * HN + i;
  return (heights[k] * (1 - fu) + heights[k + 1] * fu) * (1 - fv) + (heights[k + HN] * (1 - fu) + heights[k + HN + 1] * fu) * fv;
}
const waterLevel = z => baseH(STREAM_X(z), z) - 0.25;
const inWater = (x, z) => Math.abs(x - STREAM_X(z)) < WATER_HALF && streamDepth(x, z) > 0.25;
const inWood = (x, z) => (x - WOOD.x) ** 2 + (z - WOOD.z) ** 2 < WOOD.r * WOOD.r;
function roadDist(x, z) {
  let m = Infinity;
  for (let k = 0; k + 1 < ROAD.length; k++) { const [ax, az] = ROAD[k], [bx, bz] = ROAD[k + 1], ex = bx - ax, ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez))); m = Math.min(m, Math.hypot(x - ax - ex * t, z - az - ez * t)); }
  return m;
}
// ground speed, baked once on the height grid (the terrain is static): water and woods slow, roads
// help a little; the slope is charged along the direction of travel (climbing slows, a gentle descent
// does not, a steep one does), so a line walking along a contour is not slowed
const GROUND = new Float32Array(HN * HN), GX = new Float32Array(HN * HN), GZ = new Float32Array(HN * HN);
for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) { const x = i * HG - HALF, z = j * HG - HALF, k = j * HN + i;
  GROUND[k] = (inWater(x, z) ? 0.45 : 1) * (inWood(x, z) ? 0.75 : 1) * (roadDist(x, z) < 3 ? 1.1 : 1);
  GX[k] = (H(x + HG, z) - H(x - HG, z)) / (2 * HG); GZ[k] = (H(x, z + HG) - H(x, z - HG)) / (2 * HG); }
function groundSpeed(x, z, dx, dz) {   // (dx, dz): unit direction of travel, or 0, 0
  const i = Math.min(HN - 1, Math.max(0, Math.round((x + HALF) / HG))), j = Math.min(HN - 1, Math.max(0, Math.round((z + HALF) / HG))), k = j * HN + i;
  const up = GX[k] * dx + GZ[k] * dz;
  return GROUND[k] / (1 + 3 * Math.max(0, up) + 1.2 * Math.max(0, -up - 0.2));
}
// obstacles soldiers walk around: tree trunks in the wood, rocks on the hills and by the stream
const TREES = [], ROCKS = [];
{ const r = rng(11);
  for (let i = 0; i < 600 && TREES.length < 120; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * WOOD.r, x = WOOD.x + Math.cos(a) * d, z = WOOD.z + Math.sin(a) * d;
    if (TREES.every(t => (t.x - x) ** 2 + (t.z - z) ** 2 > 16)) TREES.push({ x, z, r: 0.3 + r() * 0.15 }); }
  const spots = [[0, 95, 22, 26], [130, -95, 16, 14], [-105, -55, 14, 8], [STREAM_X(60) + 9, 60, 10, 6], [STREAM_X(-70) - 9, -70, 10, 6]];
  for (const [cx, cz, rad, n] of spots) for (let k = 0, tries = 0; k < n && tries < 400; tries++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, R = 0.6 + r() * 0.9;
    if (inWater(x, z) || roadDist(x, z) < 4 || ROCKS.some(o => Math.hypot(o.x - x, o.z - z) < o.r + R + 2)) continue;
    const pts = []; const m = 5 + (r() * 3 | 0); for (let q = 0; q < m; q++) { const ang = q / m * Math.PI * 2 + r() * 0.5; pts.push([Math.cos(ang) * R * (0.7 + r() * 0.4), Math.sin(ang) * R * (0.7 + r() * 0.4)]); }
    ROCKS.push({ x, z, r: R, pts }); k++; }
}
const TREE_CELL = 4, TREE_N = FIELD / TREE_CELL, treeCells = Array.from({ length: TREE_N * TREE_N }, () => []);
const treeCell = (x, z) => { const i = Math.floor((x + HALF) / TREE_CELL), j = Math.floor((z + HALF) / TREE_CELL); return i < 0 || j < 0 || i >= TREE_N || j >= TREE_N ? -1 : i * TREE_N + j; };
for (const t of TREES) treeCells[treeCell(t.x, t.z)].push(t);
for (const o of ROCKS) treeCells[treeCell(o.x, o.z)].push(o);   // same grid: an obstacle is a circle

/* =========================================================================
   FORMATION LAYER (20 Hz)
   A battalion = 4 companies × 25 men. A company is a block of 9 files × 3 ranks; every shape is a
   placement (x, z, rotation) of the four blocks in the battalion frame, so a soldier keeps his
   (company, file, rank) in every shape. Changing shape moves each company in turn from its old
   placement to its new one, wheeling around a flank when it turns (drill, not a swarm).
   ========================================================================= */
const TICK = 0.05, FS = 0.65, RS = 0.85, COMPANIES = 4, PER = 25, FILES = 9, RANKS = 3;
const BW = FILES * FS;   // company frontage
const SHAPES = {
  // companies side by side, one file between them
  line: () => [0, 1, 2, 3].map(c => ({ x: (c - 1.5) * (BW + FS), z: 0, rot: 0, face: 0 })),
  // column of divisions: two companies wide, two deep
  column: () => [0, 1, 2, 3].map(c => ({ x: ((c % 2) - 0.5) * (BW + FS), z: c < 2 ? 0 : -(RANKS * RS + 3.2), rot: 0, face: 0 })),
  // each company is one face, facing out. Pinwheel: each face is shifted along its line by half its
  // depth, so its end meets the next face's rear rank and the corners close
  square: () => { const s = (RANKS - 1) * RS / 2 + 0.3, D = BW / 2 + s;
    return [0, -Math.PI / 2, Math.PI, Math.PI / 2].map(rot => { const p = rot2(-s, D, rot); return { x: p[0], z: p[1], rot, face: rot }; }); },
  // by files: each company turns its block so files run front to back; the men face the march
  march: () => [0, 1, 2, 3].map(c => ({ x: 0, z: -c * (BW + 1.0), rot: -Math.PI / 2, face: 0 })),
};
// regulation-like times in seconds at drill factor 1 (docs/proposals/sim-design.md §5; research §2)
const CHANGE_TIME = {
  'line>column': 30, 'column>line': 40, 'column>square': 60, 'line>square': 100, 'square>line': 60, 'square>column': 30,
  'line>march': 20, 'march>line': 60, 'column>march': 20, 'march>column': 30, 'march>square': 60, 'square>march': 40,
};
const rot2 = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
const blockLocal = (f, r) => [(f - (FILES - 1) / 2) * FS, -r * RS];   // front rank at 0, rear ranks behind

let simTime = 0, drill = 1;
const battalions = [];

function makeBattalion(x, z, heading, colour, seed) {
  const b = {
    x, z, heading, px: x, pz: z, ph: heading, vx: 0, vz: 0, shape: 'line', place: SHAPES.line(),
    trans: null, orders: [], colour, rand: rng(seed), soldiers: [], grid: [], moved: 0, log: [], omega: 0, trail: [],
  };
  resetTrail(b);
  // slot table: grid[company][rank][file] = soldier index or -1
  for (let c = 0; c < COMPANIES; c++) {
    const g = []; for (let r = 0; r < RANKS; r++) g.push(new Array(FILES).fill(-1)); b.grid.push(g);
    for (let k = 0; k < PER; k++) { const r = Math.floor(k / FILES), f = k % FILES; g[r][f] = b.soldiers.length;
      b.soldiers.push({ c, f, r, x: 0, z: 0, vx: 0, vz: 0, alive: true, dx: b.rand() * 6.28, dz: b.rand() * 6.28 }); }
  }
  b.soldiers.forEach(s => { const p = slotWorld(b, s, 0); s.x = p[0]; s.z = p[1]; });
  battalions.push(b); return b;
}

/* march column as a snake: the head leaves a trail; each company stands on the trail at its distance
   behind the head and faces along it, so the column turns where its head turned (not as a rigid stick) */
const MARCH_GAP = BW + 1.0;
function resetTrail(b) {   // a straight trail behind the head, along the current heading
  b.trail.length = 0; const n = 8;
  for (let k = n; k >= 0; k--) b.trail.push({ x: b.x - Math.sin(b.heading) * k * 6, z: b.z - Math.cos(b.heading) * k * 6 });
  b.trailLen = n * 6;
}
function pushTrail(b) {
  const last = b.trail[b.trail.length - 1], d = Math.hypot(b.x - last.x, b.z - last.z);
  if (d < 0.25) return;
  b.trail.push({ x: b.x, z: b.z }); b.trailLen += d;
  while (b.trail.length > 2 && b.trailLen - Math.hypot(b.trail[1].x - b.trail[0].x, b.trail[1].z - b.trail[0].z) > 5 * MARCH_GAP + 12) {
    b.trailLen -= Math.hypot(b.trail[1].x - b.trail[0].x, b.trail[1].z - b.trail[0].z); b.trail.shift(); }
}
// point on the trail `back` metres behind (hx, hz), the head this frame; negative = ahead of the head
function trailAt(b, hx, hz, h, back) {
  if (back <= 0) return [hx - Math.sin(h) * back, hz - Math.cos(h) * back];
  let px = hx, pz = hz, left = back;
  for (let k = b.trail.length - 1; k >= 0; k--) {
    const q = b.trail[k], d = Math.hypot(px - q.x, pz - q.z);
    if (d >= left && d > 1e-9) return [px + (q.x - px) * left / d, pz + (q.z - pz) * left / d];
    left -= d; px = q.x; pz = q.z;
  }
  const a = b.trail[0], c = b.trail[1] || { x: hx, z: hz }, d = Math.hypot(c.x - a.x, c.z - a.z) || 1;   // past the end: straight on
  return [a.x - (c.x - a.x) / d * left, a.z - (c.z - a.z) / d * left];
}
// a company's pose in world space: origin, block rotation a (counter-clockwise) and facing (a heading)
function placeWorld(b, c, hx, hz, h, ahead) {
  if (!b.trans && b.shape === 'march') {
    const back = c * MARCH_GAP;   // the head (hx, hz) is already extrapolated
    const p = trailAt(b, hx, hz, h, back), p1 = trailAt(b, hx, hz, h, back + 2), p0 = trailAt(b, hx, hz, h, back - 2);
    const ch = Math.atan2(p0[0] - p1[0], p0[1] - p1[1]);
    return { x: p[0], z: p[1], a: -Math.PI / 2 - ch, face: ch };
  }
  const pl = companyPlace(b, c), o = rot2(pl.x, pl.z, -h);
  return { x: hx + o[0], z: hz + o[1], a: pl.rot - h, face: h - pl.face };
}
// company placement in the battalion frame (interpolated during a change: wheel around the turning flank)
function companyPlace(b, c) {
  const t = b.trans;
  if (!t && b.shape === 'march') {   // the snake, expressed in the battalion frame
    const w = placeWorld(b, c, b.x, b.z, b.heading, 0), l = rot2(w.x - b.x, w.z - b.z, b.heading);
    return { x: l[0], z: l[1], rot: w.a + b.heading, face: b.heading - w.face };
  }
  if (!t) return b.place[c];
  const p0 = t.from[c], p1 = t.to[c], u0 = (simTime - t.start - t.delay[c]) / t.dur;
  const u = Math.min(1, Math.max(0, u0)), e = u * u * (3 - 2 * u);
  let d = p1.rot - p0.rot; d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) < 1e-3) return { x: p0.x + (p1.x - p0.x) * e, z: p0.z + (p1.z - p0.z) * e, rot: p0.rot, face: p0.face + (p1.face - p0.face) * e };
  // pivot: the end of the front rank on the side the company turns to
  const pl = [d > 0 ? -BW / 2 : BW / 2, 0];
  const a0 = rot2(pl[0], pl[1], p0.rot), a1 = rot2(pl[0], pl[1], p1.rot);
  const piv = [p0.x + a0[0] + (p1.x + a1[0] - p0.x - a0[0]) * e, p0.z + a0[1] + (p1.z + a1[1] - p0.z - a0[1]) * e];
  const rot = p0.rot + d * e, o = rot2(pl[0], pl[1], rot);
  let df = p1.face - p0.face; df = Math.atan2(Math.sin(df), Math.cos(df));
  return { x: piv[0] - o[0], z: piv[1] - o[1], rot, face: p0.face + df * e };
}
// the battalion's anchor this frame: interpolated between ticks, extrapolated `ahead` seconds (position and turn)
function anchorAt(b, alpha, ahead) {
  let dh = b.heading - b.ph; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  return [b.px + (b.x - b.px) * alpha + b.vx * ahead, b.pz + (b.z - b.pz) * alpha + b.vz * ahead, b.ph + dh * alpha + b.omega * ahead];
}
// a soldier's slot in world space (the reference the per-frame company frames must reproduce)
function slotWorld(b, s, ahead, alpha = 1) {
  const [hx, hz, h] = anchorAt(b, alpha, ahead), w = placeWorld(b, s.c, hx, hz, h, ahead), l = blockLocal(s.f, s.r);
  return [w.x + l[0] * Math.cos(w.a) - l[1] * Math.sin(w.a), w.z + l[0] * Math.sin(w.a) + l[1] * Math.cos(w.a), w.face];
}

// how far the companies must move between two layouts (metres, a turn counted at the flank)
function layoutDistance(A, B) {
  let m = 0;
  for (let c = 0; c < COMPANIES; c++) { let d = B[c].rot - A[c].rot; d = Math.atan2(Math.sin(d), Math.cos(d));
    m = Math.max(m, Math.hypot(A[c].x - B[c].x, A[c].z - B[c].z) + Math.abs(d) * BW / 2); }
  return m;
}
function startChange(b, shape) {
  if (shape === b.shape && !b.trans) return false;
  if (b.trans && shape === b.trans.shape) return false;   // already changing to it
  const from = [0, 1, 2, 3].map(c => companyPlace(b, c)), to = SHAPES[shape]();
  // b.shape stays the last completed shape; an interrupted change times the new one by the distance
  // the companies still have to cover, against a full change of the same kind (a reversal 30% in takes
  // about 30% of the time; reversing that again takes what is left)
  const base = shape === b.shape && b.trans ? b.trans.shape : b.shape;
  let T = (CHANGE_TIME[base + '>' + shape] || 30) * drill, fromLabel = b.shape;
  if (b.trans) {
    const last = b.log[b.log.length - 1]; last.took = null; last.interrupted = +(simTime - b.trans.start).toFixed(1);
    const full = layoutDistance(SHAPES[base](), to);
    T = Math.max(3, T * Math.min(1, layoutDistance(from, to) / Math.max(1e-6, full)));
    fromLabel = b.trans.shape + ' (part)'; b.trans = null;
  }
  b.vx = b.vz = 0; b.omega = 0;
  if (shape !== 'line') rebalance(b);   // the men walk to their new places during the change
  // companies start in sequence; the last one finishes at T
  const dur = T * 0.55, delay = [0, 1, 2, 3].map(c => c * T * 0.15);
  b.trans = { from, to, start: simTime, dur, delay, shape, T, fromLabel };
  b.log.push({ change: fromLabel + '>' + shape, start: simTime, planned: T });
  return true;
}

function formationTick(b) {
  b.px = b.x; b.pz = b.z; b.ph = b.heading; b.omega = 0;
  if (b.trans) {   // no marching while the companies change places; a new shape order interrupts the change
    b.vx = b.vz = 0;
    if (b.orders[0] && b.orders[0].type === 'form') { startChange(b, b.orders.shift().shape); return; }
    if (simTime >= b.trans.start + b.trans.delay[3] + b.trans.dur) {
      b.place = b.trans.to; b.shape = b.trans.shape; b.log[b.log.length - 1].took = simTime - b.trans.start; b.trans = null;
      if (b.shape === 'march') resetTrail(b);   // the column stands straight behind its head
      closeRanks(b);   // re-forming is when the files dress and close
    }
    return;
  }
  const o = b.orders[0]; if (!o) { b.vx = b.vz = 0; return; }
  const h0 = b.heading;
  if (o.type === 'form') { b.orders.shift(); startChange(b, o.shape); return; }
  const v = (b.shape === 'march' ? 1.25 : 1.0) * groundSpeed(b.x, b.z, Math.sin(b.heading), Math.cos(b.heading));   // ordinary pace ≈ 61 m/min; march column faster
  const halfW = b.shape === 'line' ? (BW * 2 + FS * 1.5) : b.shape === 'march' ? 1.5 : BW;
  if (o.type === 'move') {
    const dx = o.x - b.x, dz = o.z - b.z, dist = Math.hypot(dx, dz);
    if (dist < 0.4) { b.orders.shift(); b.vx = b.vz = 0; return; }
    let want = Math.atan2(dx, dz), dh = want - b.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const wmax = 1.2 * v / halfW * TICK;   // the outer flank may not outrun the quick step: long lines turn slowly
    b.heading += Math.max(-wmax, Math.min(wmax, dh));
    const go = Math.abs(dh) < 1.0 ? Math.min(v, dist / TICK) : 0;   // turn before advancing
    b.vx = Math.sin(b.heading) * go; b.vz = Math.cos(b.heading) * go;
    b.x += b.vx * TICK; b.z += b.vz * TICK; pushTrail(b);
  } else if (o.type === 'wheel') {   // rotate the whole battalion around the flank it turns to
    if (o.left === undefined) { o.left = o.angle > 0; const piv = rot2(o.left ? -halfW : halfW, 0, -b.heading); o.px = b.x + piv[0]; o.pz = b.z + piv[1]; o.done = 0; }
    const w = Math.min(Math.abs(o.angle) - o.done, 1.0 * v / (2 * halfW) * TICK);   // outer flank at marching pace
    const sgn = o.angle > 0 ? -1 : 1, dx = b.x - o.px, dz = b.z - o.pz, r = rot2(dx, dz, -sgn * w);
    const nx = o.px + r[0], nz = o.pz + r[1]; b.vx = (nx - b.x) / TICK; b.vz = (nz - b.z) / TICK; b.x = nx; b.z = nz;
    b.heading += sgn * w; o.done += w; pushTrail(b);
    if (o.done >= Math.abs(o.angle) - 1e-6) { b.orders.shift(); b.vx = b.vz = 0; }
  }
  let dh = b.heading - h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); b.omega = b.vx || b.vz ? dh / TICK : 0;   // a turn in place is not extrapolated
}

// casualties: the man behind steps up into the gap; nobody else changes slot
function kill(b, n) {
  let moved = 0;
  const alive = b.soldiers.map((s, i) => i).filter(i => b.soldiers[i].alive);
  for (let k = 0; k < n && alive.length; k++) {
    const i = alive.splice(Math.floor(b.rand() * alive.length), 1)[0], s = b.soldiers[i];
    s.alive = false; const g = b.grid[s.c];
    for (let r = s.r; r < RANKS - 1; r++) { const j = g[r + 1][s.f]; g[r][s.f] = j; if (j >= 0) { b.soldiers[j].r = r; moved++; } }
    g[RANKS - 1][s.f] = -1;
  }
  closeRanks(b);
  b.moved += moved; return moved;
}
/* even out the companies when the battalion leaves line: closing toward the colours moves men between
   companies, so the outer ones drain; a square or a column needs four equal companies. Men keep their
   order along the line; each company fills its files front to back, centred. */
function rebalance(b) {
  const alive = []; for (let i = 0; i < b.soldiers.length; i++) if (b.soldiers[i].alive) alive.push(i);
  const size = [0, 0, 0, 0]; for (const i of alive) size[b.soldiers[i].c]++;
  if (Math.max(...size) - Math.min(...size) <= 1) return 0;
  const key = i => { const s = b.soldiers[i]; return (s.c * FILES + s.f) * RANKS + s.r; };
  alive.sort((p, q) => key(p) - key(q));
  for (let c = 0; c < COMPANIES; c++) for (let r = 0; r < RANKS; r++) b.grid[c][r].fill(-1);
  let k = 0, moved = 0;
  for (let c = 0; c < COMPANIES; c++) {
    const m = Math.floor(alive.length / COMPANIES) + (c < alive.length % COMPANIES ? 1 : 0), files = Math.ceil(m / RANKS), start = Math.floor((FILES - files) / 2);
    for (let q = 0; q < m; q++, k++) { const s = b.soldiers[alive[k]], f = start + Math.floor(q / RANKS), r = q % RANKS;
      if (s.c !== c || s.f !== f || s.r !== r) moved++; s.c = c; s.f = f; s.r = r; b.grid[c][r][f] = alive[k]; }
  }
  b.closed = (b.closed || 0) + moved; return moved;
}
/* close the ranks after losses: empty files are taken by the files beyond them.
   In line the battalion closes toward the colours (between companies 1 and 2) across company
   boundaries, so no hole stays inside the line; in other shapes each company closes toward its own
   centre, so a square keeps its corners and a column its alignment. Also run when a change ends. */
function closeRanks(b) {
  let closed = 0;
  const fileOf = (c, f) => b.grid[c].map(rank => rank[f]);
  const place = (cols, slots, companies) => {   // put the non-empty files `cols` into `slots` = [[c, f], ...] in order
    for (const c of companies) for (let r = 0; r < RANKS; r++) b.grid[c][r].fill(-1);   // every company the files come from or go to
    cols.forEach((col, k) => { const [c, f] = slots[k]; col.forEach((j, r) => { b.grid[c][r][f] = j;
      if (j >= 0) { const s = b.soldiers[j]; if (s.c !== c || s.f !== f) { s.c = c; s.f = f; closed++; } } }); });
  };
  if (b.shape === 'line' && !b.trans) {
    for (const half of [[0, 1], [2, 3]]) {
      const all = []; for (const c of half) for (let f = 0; f < FILES; f++) all.push([c, f]);
      const cols = all.map(([c, f]) => fileOf(c, f)).filter(col => col.some(j => j >= 0));
      const slots = half[0] === 0 ? all.slice(all.length - cols.length) : all.slice(0, cols.length);   // against the colours
      place(cols, slots, half);
    }
  } else if (!b.trans) {
    for (let c = 0; c < COMPANIES; c++) {
      const cols = []; for (let f = 0; f < FILES; f++) { const col = fileOf(c, f); if (col.some(j => j >= 0)) cols.push(col); }
      const start = Math.floor((FILES - cols.length) / 2), slots = []; for (let k = 0; k < cols.length; k++) slots.push([c, start + k]);
      place(cols, slots, [c]);
    }
  }
  b.closed = (b.closed || 0) + closed; return closed;
}

/* =========================================================================
   SOLDIER LAYER (every frame, cosmetic)
   ========================================================================= */
const frameSlot = (f, file, rank) => { const lx = (file - (FILES - 1) / 2) * FS, lz = -rank * RS; return [f.x + lx * f.cos - lz * f.sin, f.z + lx * f.sin + lz * f.cos]; };
// each company's frame in world space, computed once per battalion per frame (not per soldier)
function companyFrames(b, ahead, alpha) {
  const [hx, hz, h] = anchorAt(b, alpha, ahead), out = b.frames || (b.frames = [{}, {}, {}, {}]);
  for (let c = 0; c < COMPANIES; c++) { const w = placeWorld(b, c, hx, hz, h, ahead), f = out[c]; f.x = w.x; f.z = w.z; f.cos = Math.cos(w.a); f.sin = Math.sin(w.a); f.face = w.face; }
  return out;
}
const SC = 0.6, SN = Math.ceil(FIELD / SC), cellHead = new Int32Array(SN * SN).fill(-1), cellNext = new Int32Array(41 * COMPANIES * PER);   // SC ≥ SEP: the 3×3 search sees every neighbour
let flat = [], touched = [];
const AHEAD = 0.6, WALK = 1.35, RUN = 3.2, SEP = 0.52;
function soldierStep(dt, alpha) {
  // neighbour grid: 0.6 m cells, linked lists in typed arrays, rebuilt every frame
  for (const c of touched) cellHead[c] = -1; flat.length = 0; touched.length = 0;   // clear only the cells used last frame
  for (const b of battalions) for (const s of b.soldiers) if (s.alive) {
    const i = Math.floor((s.x + HALF) / SC), j = Math.floor((s.z + HALF) / SC); s.cell = i >= 0 && j >= 0 && i < SN && j < SN ? i * SN + j : -1;
    const k = flat.length; flat.push(s); if (s.cell >= 0) { if (cellHead[s.cell] < 0) touched.push(s.cell); cellNext[k] = cellHead[s.cell]; cellHead[s.cell] = k; }
  }
  const t = simTime * 0.35;
  for (const b of battalions) {
    const fr = companyFrames(b, AHEAD, alpha);
    // sway only while the battalion is busy; it eases out when it halts, so the ranks come to rest
    const busy = !!(b.trans || b.orders.length);
    b.sway = (b.sway || 0) + ((busy ? 1 : 0) - (b.sway || 0)) * Math.min(1, dt * 0.8);
    for (const s of b.soldiers) {
      if (!s.alive) continue;
      const f = fr[s.c], lx = (s.f - (FILES - 1) / 2) * FS, lz = -s.r * RS;
      const sx = f.x + lx * f.cos - lz * f.sin, sz = f.z + lx * f.sin + lz * f.cos;   // origin + rot2(lx, lz, rot - h): same as slotWorld
      const amp = (inWood(s.x, s.z) ? 0.3 : 0.1) * b.sway;   // personal drift: the ranks loosen in woods
      let tx = sx + amp * Math.sin(t + s.dx), tz = sz + amp * Math.sin(t * 0.8 + s.dz);
      // a slot inside a trunk or rock moves to its edge: a stable place to stand, not a tug of war
      const tc = treeCell(tx, tz);
      if (tc >= 0) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const cell = treeCells[tc + i * TREE_N + j]; if (!cell) continue;
        for (const o of cell) { const ex = tx - o.x, ez = tz - o.z, d = Math.sqrt(ex * ex + ez * ez), R = o.r + 0.4; if (d < R) { const u = d > 1e-6 ? 1 / d : 0; tx = o.x + (u ? ex * u : 1) * R; tz = o.z + (u ? ez * u : 0) * R; } } }
      const dx = tx - s.x, dz = tz - s.z, dist = Math.sqrt(dx * dx + dz * dz);
      const gs = dist > 1e-6 ? groundSpeed(s.x, s.z, dx / dist, dz / dist) : groundSpeed(s.x, s.z, 0, 0);
      const top = (dist > 2.5 ? RUN : WALK) * gs, want = dist < 0.08 ? 0 : Math.min(top, dist / 0.7);
      let wx = dist > 1e-6 ? dx / dist * want : 0, wz = dist > 1e-6 ? dz / dist * want : 0;
      // separation from neighbours (same and other battalions)
      const ci = Math.floor((s.x + HALF) / SC), cj = Math.floor((s.z + HALF) / SC);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        if (i < 0 || j < 0 || i >= SN || j >= SN) continue;
        for (let k = cellHead[i * SN + j]; k >= 0; k = cellNext[k]) { const o = flat[k]; if (o === s) continue;
          const ex = s.x - o.x, ez = s.z - o.z, d2 = ex * ex + ez * ez;
          if (d2 < SEP * SEP && d2 > 1e-8) { const d = Math.sqrt(d2), push = (SEP - d) / SEP * 1.8; wx += ex / d * push; wz += ez / d * push; } }
      }
      // obstacles (trunks, rocks): while walking, steer round the ones just ahead; never stand inside one
      const spd0 = Math.sqrt(s.vx * s.vx + s.vz * s.vz), walking = Math.min(1, spd0 / 0.5), oc = treeCell(s.x, s.z);
      if (oc >= 0 && walking > 0) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const cell = treeCells[oc + i * TREE_N + j]; if (!cell) continue;
        for (const o of cell) { const ex = s.x - o.x, ez = s.z - o.z, d = Math.sqrt(ex * ex + ez * ez), R = o.r + 0.35;
          if (d < R + 0.8 && d > 1e-6) { const push = (R + 0.8 - d) / 0.8 * 1.4 * walking; wx += ex / d * push; wz += ez / d * push; } } }
      const k = Math.min(1, dt * 5); s.vx += (wx - s.vx) * k; s.vz += (wz - s.vz) * k;
      if (dist < 0.08) { const damp = Math.max(0, 1 - dt * 8); s.vx *= damp; s.vz *= damp; }   // arrived: come to rest
      const sp2 = s.vx * s.vx + s.vz * s.vz, cap = RUN * gs; if (sp2 > cap * cap) { const r = cap / Math.sqrt(sp2); s.vx *= r; s.vz *= r; }
      s.x += s.vx * dt; s.z += s.vz * dt;
      if (oc >= 0) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const cell = treeCells[oc + i * TREE_N + j]; if (!cell) continue;
        for (const o of cell) { const ex = s.x - o.x, ez = s.z - o.z, d = Math.sqrt(ex * ex + ez * ez), R = o.r + 0.3; if (d < R && d > 1e-6) { s.x = o.x + ex / d * R; s.z = o.z + ez / d * R; } } }
    }
  }
}

/* ---------- commands ---------- */
let main;
function reset() {
  battalions.length = 0; simTime = 0; acc = 0; manyOn = false;
  main = makeBattalion(-20, -40, 0, 0, 7);
}
function order(name, a) {
  const b = main;
  if (SHAPES[name]) { b.orders = [{ type: 'form', shape: name }]; return; }
  if (name === 'move') { b.orders = [{ type: 'move', x: a.x, z: a.z }]; return; }
  if (name === 'wheelL') { b.orders = [{ type: 'wheel', angle: Math.PI / 4 }]; return; }
  if (name === 'wheelR') { b.orders = [{ type: 'wheel', angle: -Math.PI / 4 }]; return; }
  if (name === 'wood') { b.orders = [{ type: 'move', x: WOOD.x, z: WOOD.z - WOOD.r - 12 }, { type: 'move', x: WOOD.x, z: WOOD.z + WOOD.r + 14 }]; return; }
  if (name === 'ford') {   // narrow to files, cross, deploy again on the far bank
    const zf = 0, xe = STREAM_X(zf) - 22, xx = STREAM_X(zf) + 24;
    b.orders = [{ type: 'move', x: xe - 30, z: zf }, { type: 'form', shape: 'march' }, { type: 'move', x: xe, z: zf }, { type: 'move', x: xx, z: zf }, { type: 'form', shape: 'line' }];
    return;
  }
  if (name === 'kill') return kill(b, 10);
}
let manyOn = false;
function setMany(on) {
  manyOn = on; battalions.length = 1;
  if (!on) return;
  const r = rng(99);
  for (let i = 0; i < 39; i++) { const gx = i % 8, gz = Math.floor(i / 8), x = -150 + gx * 38, z = -150 + gz * 55;   // rows clear of a 27 m march column
    const b = makeBattalion(x, z, 0, 0, 100 + i); const shapes = ['line', 'column', 'march'];
    b.orders = [{ type: 'form', shape: shapes[i % 3] }, { type: 'move', x: x + (r() - 0.5) * 30, z: z + 40 }]; }
}

/* ---------- loop: formation at 20 Hz, soldiers every frame ---------- */
let acc = 0, speed = 1;
const steerMs = [];
function advance(dt) {
  const step = Math.min(dt * speed, 0.25); acc += step;
  while (acc >= TICK) { for (const b of battalions) formationTick(b); simTime += TICK; acc -= TICK; }
  const t0 = performance.now(); soldierStep(step, acc / TICK);
  steerMs.push(performance.now() - t0); if (steerMs.length > 60) steerMs.shift();
}
function stats() {
  const b = main, alive = b.soldiers.filter(s => s.alive).length, avg = steerMs.reduce((a, x) => a + x, 0) / Math.max(1, steerMs.length);
  return { shape: b.trans ? b.trans.fromLabel + ' → ' + b.trans.shape : b.shape, alive, moved: b.moved, closed: b.closed || 0, simTime: +simTime.toFixed(1),
    changes: b.log.map(l => ({ change: l.change, planned: +l.planned.toFixed(1), took: l.took != null ? +l.took.toFixed(1) : null, interrupted: l.interrupted })),
    soldiers: battalions.reduce((a, x) => a + x.soldiers.length, 0), steerMs: +avg.toFixed(2) };
}
// how far soldiers are from their slots (a measurement, not a pass/fail check): max and mean, metres
function slotError() {
  let max = 0, sum = 0, n = 0;
  for (const b of battalions) { const fr = companyFrames(b, 0, acc / TICK);
    for (const s of b.soldiers) if (s.alive) { const p = frameSlot(fr[s.c], s.f, s.r), d = Math.hypot(s.x - p[0], s.z - p[1]); max = Math.max(max, d); sum += d; n++; } }
  return { max: +max.toFixed(2), mean: +(sum / Math.max(1, n)).toFixed(2) };
}
// simulation CPU per frame (formation ticks + steering) over `frames` frames of 1/60 s
function measure(frames = 60) {
  let t = 0; for (let k = 0; k < frames; k++) { const t0 = performance.now(); advance(1 / 60); t += performance.now() - t0; }
  return +(t / frames).toFixed(2);
}
reset();
window.FC = {
  FIELD, HALF, H, heights, HN, HG, STREAM_X, FORD, WOOD, WATER_HALF, HILLS, ROAD, TREES, ROCKS, inWater, inWood,
  FILES, RANKS, COMPANIES, battalions, groundSpeed, get main() { return main; }, get simTime() { return simTime; }, get alpha() { return acc / TICK; },
  get speed() { return speed; }, set speed(v) { speed = v; }, get drill() { return drill; }, set drill(v) { drill = v; },
  order, reset, setMany, kill: n => kill(main, n), advance, stats, slotError, measure, companyFrames, frameSlot,
  get manyOn() { return manyOn; },
};
})();
