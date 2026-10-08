// Formation core (docs/plans/done/formation-feel.md): terrain data, the 20 Hz formation layer and the
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
  const bed = z > FORD.z0 && z < FORD.z1 ? 0.65 : 1.6;   // water ≈ 0.4 m at the ford (knee), ≈ 1.35 m elsewhere (deep)
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
const BRIDGE = { z: -60, half: 2, x0: STREAM_X(-60) - 8, x1: STREAM_X(-60) + 8 };   // a 4 m wide bridge
const onBridge = (x, z) => Math.abs(z - BRIDGE.z) <= BRIDGE.half && x >= BRIDGE.x0 && x <= BRIDGE.x1;
const waterDepth = (x, z) => onBridge(x, z) ? 0 : Math.max(0, streamDepth(x, z) - 0.25);
const inWater = (x, z) => waterDepth(x, z) > 0;
const inWood = (x, z) => (x - WOOD.x) ** 2 + (z - WOOD.z) ** 2 < WOOD.r * WOOD.r;
function roadDist(x, z) {
  let m = Infinity;
  for (let k = 0; k + 1 < ROAD.length; k++) { const [ax, az] = ROAD[k], [bx, bz] = ROAD[k + 1], ex = bx - ax, ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez))); m = Math.min(m, Math.hypot(x - ax - ex * t, z - az - ez * t)); }
  return m;
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
/* =========================================================================
   TERRAIN CLASSES (era-generic: the era ruleset gives each class its speed factors)
   A 1 m grid of classes, baked once: open, road, crops, ploughed, rough, woods, denseWood, marsh,
   hedge, bridge, water (with its depth).
   ========================================================================= */
const R = window.RULESET;   // loaded before this file (prototypes/ruleset-napoleonic.js)
const CLASSES = ['open', 'road', 'crops', 'ploughed', 'rough', 'woods', 'denseWood', 'marsh', 'hedge', 'bridge', 'water'];
const CROPS = [[-160, 20, -80, 62], [96, -46, 152, -12], [-60, -150, 0, -108]];   // x0 z0 x1 z1
const PLOUGHED = [[-150, -112, -96, -76], [104, 60, 160, 104]];
const MARSH = { x: 46, z: -118, rx: 20, rz: 12 };
const DENSE = { x: -52, z: 62, r: 12 };
const HEDGES = [[[-70, -24], [-24, -22]], [[-18, -22], [26, -20]], [[30, -96], [32, -34]]];   // a gap at x −24..−18
const segDist = (x, z, [ax, az], [bx, bz]) => { const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez))); return Math.hypot(x - ax - ex * t, z - az - ez * t); };
const TERR = new Uint8Array(HN * HN), WDEPTH = new Float32Array(HN * HN), GX = new Float32Array(HN * HN), GZ = new Float32Array(HN * HN);
function classAt(x, z) {
  if (onBridge(x, z)) return 'bridge';
  if (waterDepth(x, z) > 0) return 'water';
  if (roadDist(x, z) < 3) return 'road';
  if (HEDGES.some(([a, b]) => segDist(x, z, a, b) < 0.8)) return 'hedge';
  if (Math.hypot(x - DENSE.x, z - DENSE.z) < DENSE.r) return 'denseWood';
  if (inWood(x, z)) return 'woods';
  if (((x - MARSH.x) / MARSH.rx) ** 2 + ((z - MARSH.z) / MARSH.rz) ** 2 < 1) return 'marsh';
  if (ROCKS.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 3) || Math.hypot(x - HILLS[0].x, z - HILLS[0].z) < 16) return 'rough';
  if (PLOUGHED.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d)) return 'ploughed';
  if (CROPS.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d)) return 'crops';
  return 'open';
}
function bakeTerrain() {
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) { const x = i * HG - HALF, z = j * HG - HALF, k = j * HN + i;
    TERR[k] = CLASSES.indexOf(classAt(x, z)); WDEPTH[k] = waterDepth(x, z);
    GX[k] = (H(x + HG, z) - H(x - HG, z)) / (2 * HG); GZ[k] = (H(x, z + HG) - H(x, z - HG)) / (2 * HG);
    if (onBridge(x, z)) GX[k] = GZ[k] = 0;   // a level deck over the stream valley, not its banks
  }
}
const cellK = (x, z) => Math.min(HN - 1, Math.max(0, Math.round((z + HALF) / HG))) * HN + Math.min(HN - 1, Math.max(0, Math.round((x + HALF) / HG)));
const waterG = d => { const c = R.water.curve; if (d <= 0) return 1; if (d > R.water.limit) return 0;
  for (let n = 1; n < c.length; n++) if (d <= c[n][0]) return c[n - 1][1] + (c[n][1] - c[n - 1][1]) * (d - c[n - 1][0]) / (c[n][0] - c[n - 1][0]);
  return c[c.length - 1][1]; };
// slope factor along the direction of travel: Tobler's hiking curve, capped at the drill pace; a table
// (built once) so the per-sample path has no Math.exp
const SLOPE_T = new Float64Array(401); for (let i = 0; i <= 400; i++) { const sl = i / 200 - 1; SLOPE_T[i] = Math.min(1, R.slopeK * Math.exp(-3.5 * (Math.abs(sl + 0.05) - 0.05))); }
const slopeG = sl => { const u = Math.min(400, Math.max(0, (sl + 1) * 200)), i = Math.min(399, u | 0), f = u - i; return SLOPE_T[i] + (SLOPE_T[i + 1] - SLOPE_T[i]) * f; };
// speed factor g of the ground at (x, z) for a formation kind ('line' | 'column' | 'skirmish'), moving along (dx, dz)
function groundG(x, z, kind, dx, dz) {
  const k = cellK(x, z), t = R.terrain[CLASSES[TERR[k]]];
  return t.g[kind] * waterG(WDEPTH[k]) * slopeG(GX[k] * dx + GZ[k] * dz);
}
bakeTerrain();
// impassable cells for each formation kind (too deep to wade, or a class with g = 0 for that kind) and,
// per cell, the distance in metres to the nearest one (two-pass chamfer): the footprint gate's quick reject
const KINDS = Object.keys(Object.values(R.terrain)[0].g), IMP = {}, IMPD = {};
for (const kind of KINDS) { IMP[kind] = new Uint8Array(HN * HN); IMPD[kind] = new Float32Array(HN * HN); }
function bakeImpassable() { for (const kind of KINDS) bakeImpassableKind(IMP[kind], IMPD[kind], kind); }
function bakeImpassableKind(IMP, IMPD, kind) {
  for (let k = 0; k < HN * HN; k++) { IMP[k] = WDEPTH[k] > R.water.limit || R.terrain[CLASSES[TERR[k]]].g[kind] <= 0 ? 1 : 0; IMPD[k] = IMP[k] ? 0 : 1e9; }
  const D2 = Math.SQRT2 * HG, rel = (k, j, d) => { if (IMPD[j] + d < IMPD[k]) IMPD[k] = IMPD[j] + d; };
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) { const k = j * HN + i;
    if (i > 0) rel(k, k - 1, HG); if (j > 0) { rel(k, k - HN, HG); if (i > 0) rel(k, k - HN - 1, D2); if (i < HN - 1) rel(k, k - HN + 1, D2); } }
  for (let j = HN - 1; j >= 0; j--) for (let i = HN - 1; i >= 0; i--) { const k = j * HN + i;
    if (i < HN - 1) rel(k, k + 1, HG); if (j < HN - 1) { rel(k, k + HN, HG); if (i < HN - 1) rel(k, k + HN + 1, D2); if (i > 0) rel(k, k + HN - 1, D2); } }
}
bakeImpassable();
const groundQ = (x, z, pace) => R.q[pace][R.terrain[CLASSES[TERR[cellK(x, z)]]].q];
const onRoad = (x, z) => !!R.terrain[CLASSES[TERR[cellK(x, z)]]].road;
// cosmetic soldiers: the same table, for their battalion's formation kind; impassable stays impassable
const groundSpeed = (x, z, dx, dz, kind) => groundG(x, z, kind, dx, dz);

const TREE_CELL = 4, TREE_N = FIELD / TREE_CELL, treeCells = Array.from({ length: TREE_N * TREE_N }, () => []);
const treeCell = (x, z) => { const i = Math.floor((x + HALF) / TREE_CELL), j = Math.floor((z + HALF) / TREE_CELL); return i < 0 || j < 0 || i >= TREE_N || j >= TREE_N ? -1 : i * TREE_N + j; };
for (const t of TREES) treeCells[treeCell(t.x, t.z)].push(t);
// every obstacle in the 3×3 cells around (x, z)
function eachObstacle(x, z, fn) {
  const c = treeCell(x, z); if (c < 0) return;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const cell = treeCells[c + i * TREE_N + j]; if (cell) for (const o of cell) fn(o); }
}
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
  // by files: each company turns its block so files run front to back; the men face the march; the
  // ranks centred on the line of march (the trail)
  march: () => [0, 1, 2, 3].map(c => ({ x: (RANKS - 1) * RS / 2, z: -c * (BW + 1.0), rot: -Math.PI / 2, face: 0 })),
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
    x, z, heading, px: x, pz: z, ph: heading, vx: 0, vz: 0, shape: R.start.shape, place: SHAPES[R.start.shape](),
    trans: null, orders: [], colour, rand: rng(seed), soldiers: [], grid: [], moved: 0, log: [], omega: 0, trail: [],
    style: R.start.orders, lags: new Float64Array(COMPANIES * 3), binG: new Float64Array(COMPANIES * 3).fill(1), binQ: new Float64Array(COMPANIES * 3).fill(1), binN: new Int32Array(COMPANIES * 3), lagRate: new Float64Array(COMPANIES * 3), disorder: 0, blockedFor: 0, status: '',
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
const arcCache = {};
function trailAt(b, hx, hz, h, back) {
  const t = b.trail, last = t[t.length - 1], C = arcCache;
  if (C.b !== b || C.hx !== hx || C.hz !== hz || C.h !== h || C.n !== t.length || C.last !== last || C.first !== t[0]) { arcOf(b, hx, hz, h, C); C.b = b; C.n = t.length; C.last = last; C.first = t[0]; }
  return trailPoint(C, back, [0, 0]);
}
// a company's pose in world space: origin, block rotation a (counter-clockwise) and facing (a heading)
function placeWorld(b, c, hx, hz, h, ahead, extra = 0) {
  if (snakes(b)) {
    const back = c * MARCH_GAP + extra;   // the head (hx, hz) is already extrapolated; extra: a lag along the trail
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
  if (snakes(b)) {   // the snake, expressed in the battalion frame
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
// does any pose of the change `trans` (CHANGE_SAMPLES along it, its end included) put a slot on impassable
// ground for the new shape's kind? Every slot counts, empty ones too (casualties are spread over the
// companies when the change starts and ends), with no exemption: a battalion standing on such ground
// must move off it before it changes shape.
const CHANGE_SAMPLES = 128;
function changeWet(b, trans) {
  const kind = R.formations[trans.shape].kind, imp = IMP[kind];
  let reach = 0; for (let c = 0; c < COMPANIES; c++) reach = Math.max(reach, Math.hypot(trans.from[c].x, trans.from[c].z), Math.hypot(trans.to[c].x, trans.to[c].z));
  let lmax = 0; for (let j = 0; j < NB; j++) lmax = Math.max(lmax, b.lags[j]);
  if (IMPD[kind][cellK(b.x, b.z)] > reach + BW + lmax + 2) return false;
  const keep = [simTime, b.trans]; let wet = false; b.trans = trans;
  const span = trans.delay[3] + trans.dur;
  for (let k = 0; k <= CHANGE_SAMPLES && !wet; k++) { simTime = trans.start + span * k / CHANGE_SAMPLES;
    for (let c = 0, i = 0; c < COMPANIES && !wet; c++) { const w = placeWorld(b, c, b.x, b.z, b.heading, 0), ca = Math.cos(w.a), sa = Math.sin(w.a);
      for (let r = 0; r < RANKS; r++) for (let f = 0; f < FILES; f++, i++) { const [lx, lz] = blockLocal(f, r);
        if (imp[cellK(w.x + lx * ca - lz * sa, w.z + lx * sa + lz * ca)]) { wet = true; break; } } } }
  [simTime, b.trans] = keep; return wet;
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
    const full = layoutDistance(SHAPES[base](), to);
    T = Math.max(3, T * Math.min(1, layoutDistance(from, to) / Math.max(1e-6, full)));
    fromLabel = b.trans.shape + ' (part)';
  }
  // companies start in sequence; the last one finishes at T
  const dur = T * 0.55, delay = [0, 1, 2, 3].map(c => c * T * 0.15);
  const trans = { from, to, start: simTime, dur, delay, shape, T, fromLabel };
  // the gate for a change: every pose along its path (the men at their slots: lags are dropped), checked
  // before it starts or interrupts; refused if any would put a man on impassable ground
  if (changeWet(b, trans)) { b.orders = []; b.status = 'cannot form: impassable ground'; return false; }
  if (b.trans) { const last = b.log[b.log.length - 1]; last.took = null; last.interrupted = +(simTime - b.trans.start).toFixed(1); }
  b.vx = b.vz = 0; b.omega = 0; b.lags.fill(0); b.allOnRoad = false;   // new places: the men walk there anyway
  if (!R.formations[shape].closeAcross) rebalance(b);   // the men walk to their new places during the change
  b.trans = trans;
  b.log.push({ change: fromLabel + '>' + shape, start: simTime, planned: T });
  return true;
}

/* =========================================================================
   MOVEMENT OVER TERRAIN: the lag model (docs/research/terrain-movement-speed-models.md §4, §6)
   12 sample points per battalion (3 lateral bins per company). Each bin's ground factor g is the
   harmonic mean over its men's ground (so a column's depth counts), with slope along the direction
   of travel and water depth. A held-up bin falls behind (lag), hurries at the ground's quick step to
   catch up, and the battalion slows only as much as needed to keep one file within Lmax and the
   line on average within Lmean of its place. Era numbers come from the ruleset.
   ========================================================================= */
// formations whose companies follow the head's trail (ruleset `trail`), while not changing shape
function snakes(b) { return !b.trans && !!FORM(b).trail; }
const FORM = b => R.formations[b.shape];
const kindOf = b => R.formations[b.trans ? b.trans.shape : b.shape].kind;   // during a change, the new shape's ground rules
// bins: each company's slots in lateral thirds across the direction of travel, from the shape's
// straight layout (a trail shape is straight along its trail). `of[c][r][f]` is a slot's bin, `pos` its
// place in that layout. The accordion pairs come from the same boxes: a bin wholly behind another, with
// men less than ACC_GAP apart across the line of travel, stays at least ACC_GAP behind it; listed
// rear-most last, so one pass settles a chain.
const ACC_GAP = 0.6, shapeBins = {};
function binsOf(shape) {
  if (shapeBins[shape]) return shapeBins[shape];
  const pl = SHAPES[shape](), of = [], pos = [], box = [];
  for (let c = 0; c < COMPANIES; c++) {
    const ca = Math.cos(pl[c].rot), sa = Math.sin(pl[c].rot), pts = [];
    for (let r = 0; r < RANKS; r++) for (let f = 0; f < FILES; f++) { const [lx, lz] = blockLocal(f, r); pts.push([r, f, pl[c].x + lx * ca - lz * sa, pl[c].z + lx * sa + lz * ca]); }
    const lo = Math.min(...pts.map(p => p[2])), hi = Math.max(...pts.map(p => p[2]));   // across travel: x; along: z (heading 0)
    of[c] = [[], [], []]; pos[c] = [[], [], []];
    for (let k = 0; k < 3; k++) box.push({ j: c * 3 + k, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
    for (const [r, f, x, z] of pts) { const k = Math.min(2, Math.floor((x - lo) / Math.max(1e-6, hi - lo) * 3)), bx = box[c * 3 + k]; of[c][r][f] = k; pos[c][r][f] = [x, z];
      bx.x0 = Math.min(bx.x0, x); bx.x1 = Math.max(bx.x1, x); bx.z0 = Math.min(bx.z0, z); bx.z1 = Math.max(bx.z1, z); }
  }
  const pairs = [];
  for (const rb of [...box].sort((p, q) => q.z1 - p.z1 || p.j - q.j)) for (const ab of box)
    if (Math.floor(ab.j / 3) !== Math.floor(rb.j / 3) && ab.z0 > rb.z1 && ab.x0 < rb.x1 + ACC_GAP && rb.x0 < ab.x1 + ACC_GAP)
      pairs.push([ab.j, rb.j, ab.z0 - rb.z1 - ACC_GAP]);
  let half = 0; for (const comp of pos) for (const rank of comp) for (const p of rank) half = Math.max(half, Math.abs(p[0]));
  return (shapeBins[shape] = { of, pos, pairs, half });   // half: the layout's half-width across travel
}
const binOfSlot = (b, c, r, f) => binsOf(b.shape).of[c][r][f];
// where each man stands: his slot set back by his bin's lag. A straight shape: per-bin frames, the lag
// along the heading. A trail shape: every man on the trail at his own distance behind the head (his
// place in the straight layout plus his lag) and across it by his lateral offset, so the column follows
// its head's bends file by file and a lagging company stays on the trail.
const lagAt = (b, j, dt) => b.trans ? 0 : Math.max(0, b.lags[j] + b.lagRate[j] * dt);   // a bin's lag dt seconds after the tick
function binFrame(b, c, k, hx, hz, h, ahead, out, dt = 0) {
  const lag = lagAt(b, c * 3 + k, dt), w = placeWorld(b, c, hx, hz, h, ahead);
  out.x = w.x - Math.sin(h) * lag; out.z = w.z - Math.cos(h) * lag; out.cos = Math.cos(w.a); out.sin = Math.sin(w.a); out.travel = h; return out;
}
// dt: how far after the tick the lags are wanted (the anchor is interpolated and extrapolated the same way),
// so a held file stays put between ticks and in the soldiers' look-ahead
function placesCtx(b, hx, hz, h, ahead, ctx, dt = 0) {
  ctx.b = b; ctx.snake = snakes(b); ctx.dt = dt;
  if (ctx.snake) arcOf(b, hx, hz, h, ctx);
  else { const F = ctx.F || (ctx.F = Array.from({ length: COMPANIES * 3 }, () => ({}))); for (let j = 0; j < COMPANIES * 3; j++) binFrame(b, Math.floor(j / 3), j % 3, hx, hz, h, ahead, F[j], dt); }
  return ctx;
}
// arc length from the head (hx, hz) back along the trail
function arcOf(b, hx, hz, h, ctx) {
  ctx.hx = hx; ctx.hz = hz; ctx.h = h;
  const t = b.trail, P = ctx.P || (ctx.P = []), S = ctx.S || (ctx.S = []); P.length = S.length = 0;
  let px = hx, pz = hz, acc = 0; P.push(px, pz); S.push(0);
  for (let k = t.length - 1; k >= 0; k--) { const d = Math.hypot(t[k].x - px, t[k].z - pz); if (d < 1e-6) continue; acc += d; px = t[k].x; pz = t[k].z; P.push(px, pz); S.push(acc); }
  return ctx;
}
// the point D metres back along the trail (negative: ahead of the head, along its heading)
function trailPoint(ctx, D, out) {
  const P = ctx.P, S = ctx.S, n = S.length;
  if (D <= 0 || n < 2) { out[0] = ctx.hx - Math.sin(ctx.h) * D; out[1] = ctx.hz - Math.cos(ctx.h) * D; return out; }
  if (D >= S[n - 1]) { const ax = P[2 * n - 2], az = P[2 * n - 1], dx = ax - P[2 * n - 4], dz = az - P[2 * n - 3], l = Math.hypot(dx, dz) || 1, e = D - S[n - 1];
    out[0] = ax + dx / l * e; out[1] = az + dz / l * e; return out; }
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= D) lo = m; else hi = m; }
  const u = (D - S[lo]) / (S[hi] - S[lo]); out[0] = P[2 * lo] + (P[2 * hi] - P[2 * lo]) * u; out[1] = P[2 * lo + 1] + (P[2 * hi + 1] - P[2 * lo + 1]) * u; return out;
}
const tpA = [0, 0], tpB = [0, 0];
// a man's place [x, z, direction of travel] in a context from placesCtx
function placeAt(ctx, c, r, f) {
  const b = ctx.b, k = binOfSlot(b, c, r, f);
  if (!ctx.snake) { const F = ctx.F[c * 3 + k], p = frameSlot(F, f, r); p.push(F.travel); return p; }
  const [lx, lz] = binsOf(b.shape).pos[c][r][f], D = -lz + lagAt(b, c * 3 + k, ctx.dt);
  trailPoint(ctx, D - 1, tpA); trailPoint(ctx, D + 1, tpB);
  const t = Math.atan2(tpA[0] - tpB[0], tpA[1] - tpB[1]); trailPoint(ctx, D, tpA);
  return [tpA[0] + Math.cos(t) * lx, tpA[1] - Math.sin(t) * lx, t];
}
const tickCtx = {};
const ctxNow = b => placesCtx(b, b.x, b.z, b.heading, 0, tickCtx);
// pace (m/s) and its name: a formation with a road pace uses it while every man stood on a road at the
// last sampling (sampleBins)
function paceOf(b) {
  const F = FORM(b), name = F.roadPace && !b.trans && b.allOnRoad ? F.roadPace : F.pace; return [R.pace[name], name];
}

/* FOOTPRINT GATE: no man's place (his slot less his file's lag) ever moves onto impassable ground.
   Every change of pose or of lags is tried through `gate`; a step that would put a place there is cut
   back by halving (a fixed count, so deterministic). Far from impassable ground (IMPD, baked with the
   terrain) the check is one lookup. */
const GATE_HALVINGS = 6;
// bitmask of bins with a live man's place on impassable ground, for the pose as it is now
function wetBins(b) {
  let reach = 0; for (let c = 0; c < COMPANIES; c++) { const w = placeWorld(b, c, b.x, b.z, b.heading, 0); reach = Math.max(reach, Math.hypot(w.x - b.x, w.z - b.z)); }
  let lmax = 0; for (let j = 0; j < NB; j++) lmax = Math.max(lmax, b.lags[j]);
  const imp = IMP[kindOf(b)]; if (IMPD[kindOf(b)][cellK(b.x, b.z)] > reach + BW + lmax + 2) return 0;   // nothing impassable within reach
  let mask = 0;
  if (b.trans) {   // lags are zero during a change: company frames
    for (let c = 0; c < COMPANIES; c++) { const w = placeWorld(b, c, b.x, b.z, b.heading, 0), ca = Math.cos(w.a), sa = Math.sin(w.a);
      for (let r = 0; r < RANKS; r++) for (let f = 0; f < FILES; f++) { if (b.grid[c][r][f] < 0) continue; const [lx, lz] = blockLocal(f, r);
        if (imp[cellK(w.x + lx * ca - lz * sa, w.z + lx * sa + lz * ca)]) mask |= 1 << (c * 3); } }
    return mask;
  }
  const ctx = ctxNow(b);
  for (let c = 0; c < COMPANIES; c++) for (let r = 0; r < RANKS; r++) for (let f = 0; f < FILES; f++) {
    if (b.grid[c][r][f] < 0) continue; const j = c * 3 + binOfSlot(b, c, r, f); if (mask & (1 << j)) continue;
    const p = placeAt(ctx, c, r, f); if (imp[cellK(p[0], p[1])]) mask |= 1 << j;
  }
  return mask;
}
// apply(u) sets the pose for the fraction u of a step (u = 0: as before). Keeps the largest of 1, ½, …
// that puts no bin newly on impassable ground (`before`: the bins already there), else 0.
function gate(b, before, apply) {
  for (let k = 0, u = 1; k <= GATE_HALVINGS; k++, u /= 2) { apply(u); if (!(wetBins(b) & ~before)) return u; }
  apply(0); return 0;
}

const NB = COMPANIES * 3, gTmp = new Float64Array(NB), nTmp = new Int32Array(NB), qTmp = new Float64Array(NB), blkTmp = new Int32Array(NB);
const QMAX = Math.max(...Object.values(R.q).flatMap(t => Object.values(t)));
// sample the ground for the 12 bins: each man's ground where he stands (his place), along his
// direction of travel. A bin's g is the harmonic mean over its men; q is set by its worst ground class.
// A bin is held (g = 0) when one of its men has impassable ground underfoot or within one step ahead
// (the gate would stop him there anyway); binN counts its live men (0: empty, left out of the solve).
function sampleBins(b, paceName, V0) {
  const kind = FORM(b).kind, imp = IMP[kind], look = V0 * QMAX * TICK, ctx = ctxNow(b);
  gTmp.fill(0); nTmp.fill(0); qTmp.fill(Infinity); blkTmp.fill(0); let road = true;
  for (let c = 0; c < COMPANIES; c++) for (let r = 0; r < RANKS; r++) for (let f = 0; f < FILES; f++) {
    if (b.grid[c][r][f] < 0) continue;
    const j = c * 3 + binOfSlot(b, c, r, f), [px, pz, tr] = placeAt(ctx, c, r, f), dx = Math.sin(tr), dz = Math.cos(tr);
    const g = groundG(px, pz, kind, dx, dz);
    if (g <= 0 || imp[cellK(px + dx * look, pz + dz * look)]) blkTmp[j]++; else { gTmp[j] += 1 / g; nTmp[j]++; }
    if (road && !onRoad(px, pz)) road = false;
    qTmp[j] = Math.min(qTmp[j], groundQ(px, pz, paceName));
  }
  b.allOnRoad = road;   // for the next tick's pace
  for (let j = 0; j < NB; j++) { b.binN[j] = nTmp[j] + blkTmp[j]; b.binG[j] = blkTmp[j] ? 0 : nTmp[j] ? nTmp[j] / gTmp[j] : 1; b.binQ[j] = qTmp[j] === Infinity ? 1 : qTmp[j]; }
}
// the accordion: a bin's lag is at least the lag of each bin wholly ahead of it, less the room between
function accordion(b) {
  if (b.trans) return;
  for (const [a, j, room] of binsOf(b.shape).pairs) if (b.binN[a] && b.binN[j]) b.lags[j] = Math.max(b.lags[j], b.lags[a] - room);
}
const capTmp = new Float64Array(NB), ordTmp = [];
// battalion speed this tick (m/s) toward `want`, given its pace V0; advances the lags and the disorder.
// Returns the speed and how far the leading file fell back (the anchor stays with it). Empty bins (no
// live men) take no part: they neither lead nor lag.
function lagStep(b, V0, want) {
  const P = R.orders[b.style], tau = P.tau;
  ordTmp.length = 0; for (let j = 0; j < NB; j++) if (b.binN[j]) ordTmp.push(j); else b.lags[j] = 0;
  const n = ordTmp.length; if (!n) return { V: want, back: 0 };
  for (const j of ordTmp) capTmp[j] = V0 * b.binG[j] * b.binQ[j];
  let V = want;
  for (const j of ordTmp) V = Math.min(V, capTmp[j] + (P.Lmax - b.lags[j]) / tau);   // no file beyond Lmax
  V = Math.max(0, V);
  // the line's mean lag must not grow past Lmean: n·V − Σ u_j(V) ≤ n (Lmean − l̄) / τ, with
  // u_j = min(cap_j, V + l_j/τ). The left side grows with V piecewise linearly; solve it exactly by
  // walking the breakpoints t_j = cap_j − l_j/τ in ascending order (deterministic, one pass).
  let lbar = 0; for (const j of ordTmp) lbar += b.lags[j]; lbar /= n;
  const S = n * (P.Lmean - lbar) / tau;
  ordTmp.sort((p, q) => (capTmp[p] - b.lags[p] / tau) - (capTmp[q] - b.lags[q] / tau) || p - q);
  let heldCap = 0, freeLag = 0; for (const j of ordTmp) freeLag += b.lags[j] / tau;
  for (let k = 0; k < n; k++) {   // after k+1 bins are held (at their caps)
    const j = ordTmp[k], t = capTmp[j] - b.lags[j] / tau; heldCap += capTmp[j]; freeLag -= b.lags[j] / tau;
    const next = k + 1 < n ? capTmp[ordTmp[k + 1]] - b.lags[ordTmp[k + 1]] / tau : Infinity;
    const Vk = (S + heldCap + freeLag) / (k + 1);   // F(V) = (k+1)V − Σheld cap − Σfree l/τ = S
    if (Vk <= next && Vk >= t) { V = Math.max(0, Math.min(V, Vk)); break; }
    if (Vk < t) { V = Math.max(0, Math.min(V, t)); break; }
  }
  for (const j of ordTmp) { const u = Math.min(capTmp[j], V + b.lags[j] / tau); b.lags[j] = Math.max(0, b.lags[j] + (V - u) * TICK); }
  accordion(b);
  let m = Infinity; for (const j of ordTmp) m = Math.min(m, b.lags[j]);
  for (const j of ordTmp) b.lags[j] -= m;   // keep the reference on the leading file (and the anchor with its men)
  updateDisorder(b, V, V0);
  return { V, back: m };
}
// disorder: grows with a file far behind and with the line's bow, recovers once dressed (faster when
// halted). Bins held at impassable ground are left out: their men stand at its edge, not out of order.
function updateDisorder(b, V, V0) {
  const D = R.disorder; let lmax = 0, lsum = 0, n = 0;
  for (let j = 0; j < NB; j++) { if (b.binG[j] <= 0 || !b.binN[j]) continue; lmax = Math.max(lmax, b.lags[j]); lsum += b.lags[j]; n++; }
  const lbar = n ? lsum / n : 0;
  const grow = D.kLag * Math.max(0, lmax - D.Lok) / D.Lok * (V / Math.max(1e-6, V0)) + D.kBow * Math.max(0, lbar - D.Lok / 3) / D.Lok;
  const rec = lmax < D.Lok ? D.kRec * (V < 0.05 ? 3 : 1) : 0;
  b.disorder = Math.min(1, Math.max(0, b.disorder + (grow * D.scale[FORM(b).kind] - rec) * TICK));
}
// move the anchor d metres back: along the trail for a trail shape (the trail ahead of it dropped),
// else along the heading
function stepBack(b, d) {
  b.allOnRoad = false;
  if (!snakes(b)) { b.x -= Math.sin(b.heading) * d; b.z -= Math.cos(b.heading) * d; return; }
  const t = b.trail; let px = b.x, pz = b.z, left = d;
  for (let k = t.length - 1; k >= 0; k--) { const q = t[k], s = Math.hypot(px - q.x, pz - q.z);
    if (s >= left && s > 1e-9) { b.x = px + (q.x - px) * left / s; b.z = pz + (q.z - pz) * left / s; b.heading = Math.atan2(b.x - q.x, b.z - q.z); t.length = k + 1; break; }
    left -= s; px = q.x; pz = q.z; if (k === 0) { b.x = px; b.z = pz; t.length = 1; } }
  t.push({ x: b.x, z: b.z }); b.trailLen = 0; for (let k = 1; k < t.length; k++) b.trailLen += Math.hypot(t[k].x - t[k - 1].x, t[k].z - t[k - 1].z);
}
// FACE ABOUT: the battalion turns about where it stands. Every man keeps his place: company, file and
// rank are relabelled by the shape's half-turn symmetry (a slot maps to the slot at its point reflection
// through the layout's centre) and the anchor moves to match; a trail shape's trail is rebuilt from its
// old tail. Then each file closes toward its new front rank, so a few men step up. The result is
// checked through the gate as a whole; refused if it would put anyone on impassable ground.
const FACE_TIME = 3;   // s the battalion stands while it faces about
const DRESS_TIME = 30;   // s at most to dress before the next drill order
function halfTurnOf(shape) {
  const L = binsOf(shape); if (L.turnMap !== undefined) return L.turnMap;   // { cx, cz, m: slot map, bin: bin map } or null
  const all = []; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let c = 0; c < COMPANIES; c++) for (let r = 0; r < RANKS; r++) for (let f = 0; f < FILES; f++) { const [x, z] = L.pos[c][r][f]; all.push([c, r, f, x, z]);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, m = [];
  for (const [c, r, f, x, z] of all) { const q = all.find(a => Math.abs(a[3] - (2 * cx - x)) < 1e-6 && Math.abs(a[4] - (2 * cz - z)) < 1e-6);
    if (!q) return (L.turnMap = null); ((m[c] = m[c] || [])[r] = m[c][r] || [])[f] = [q[0], q[1], q[2]]; }
  const bin = []; for (const [c, r, f] of all) { const [c2, r2, f2] = m[c][r][f]; bin[c * 3 + L.of[c][r][f]] = c2 * 3 + L.of[c2][r2][f2]; }
  return (L.turnMap = { cx, cz, m, bin });
}
// returns '' when done, else why not
function faceAbout(b) {
  const T = halfTurnOf(b.shape); if (!T) return 'the shape has no half-turn symmetry'; if (b.trans) return 'changing shape';
  const snake = snakes(b); if (snake && Math.abs(T.cx) > 1e-6) return 'the column is not centred on its trail';
  const keep = [b.x, b.z, b.heading, b.trail, b.trailLen, b.lags.slice(), b.soldiers.map(s => [s.c, s.r, s.f]), b.grid.map(g => g.map(r => r.slice()))], before0 = wetBins(b);
  // lags: a file l behind its place stands L − l ahead of its mirrored place once the anchor steps back
  // by L, the largest lag; so every man keeps his place
  let L = 0; for (let j = 0; j < NB; j++) if (b.binN[j]) L = Math.max(L, b.lags[j]);
  const lag1 = new Float64Array(NB); for (let j = 0; j < NB; j++) lag1[T.bin[j]] = b.binN[j] ? L - b.lags[j] : 0;
  let before = 0; for (let j = 0; j < NB; j++) if (before0 & (1 << j)) before |= 1 << T.bin[j];   // the same men, new labels
  if (snake) {   // the new head is the trail point the old tail's mirror stands on, L further back
    const Dt = -2 * T.cz + L, ctx = arcOf(b, b.x, b.z, b.heading, {}), p = trailPoint(ctx, Dt, [0, 0]), pa = trailPoint(ctx, Dt - 1, [0, 0]), pb = trailPoint(ctx, Dt + 1, [0, 0]);
    const trail = []; for (let D = -15; D < Dt; D += 0.25) { const q = trailPoint(ctx, D, [0, 0]); trail.push({ x: q[0], z: q[1] }); }
    b.x = p[0]; b.z = p[1]; b.heading = Math.atan2(pb[0] - pa[0], pb[1] - pa[1]); b.trail = trail;
    b.trailLen = 0; for (let k = 1; k < trail.length; k++) b.trailLen += Math.hypot(trail[k].x - trail[k - 1].x, trail[k].z - trail[k - 1].z);
  } else { const o = rot2(T.cx, T.cz, -b.heading); b.x += 2 * o[0] - Math.sin(b.heading) * L; b.z += 2 * o[1] - Math.cos(b.heading) * L; b.heading += Math.PI; }
  b.lags.set(lag1);
  for (const g of b.grid) for (const rank of g) rank.fill(-1);
  b.soldiers.forEach((s, i) => { [s.c, s.r, s.f] = T.m[s.c][s.r][s.f]; if (s.alive) b.grid[s.c][s.r][s.f] = i; });
  for (let c = 0; c < COMPANIES; c++) for (let f = 0; f < FILES; f++) {   // close each file toward its front rank
    const men = []; for (let r = 0; r < RANKS; r++) if (b.grid[c][r][f] >= 0) men.push(b.grid[c][r][f]);
    for (let r = 0; r < RANKS; r++) b.grid[c][r][f] = r < men.length ? men[r] : -1;
    men.forEach((i, r) => { b.soldiers[i].r = r; }); }
  closeRanks(b);   // files back to the centring casualties close toward (the mirror moves them); gated with the rest
  if (wetBins(b) & ~before) {
    [b.x, b.z, b.heading, b.trail, b.trailLen] = keep; b.lags.set(keep[5]); b.soldiers.forEach((s, i) => { [s.c, s.r, s.f] = keep[6][i]; }); b.grid = keep[7]; return 'impassable ground'; }
  b.px = b.x; b.pz = b.z; b.ph = b.heading; b.rateOff = true; b.allOnRoad = false; return '';
}
// stopped by impassable ground: the order ends and the slots come back to where the held men stand
// (the anchor steps back by the largest held lag; the other files dress back with them)
// a halt drops the rest of the orders except those that finish a drill (Retire's last Face about)
const haltOrders = b => { b.orders = b.orders.filter(o => o.finish); };
function haltAtEdge(b, held) {
  haltOrders(b); b.vx = b.vz = 0; b.omega = 0; b.status = 'halted: impassable ground'; b.blockedFor = 0; b.rateOff = true;
  let d = 0; for (let j = 0; j < NB; j++) if (held & (1 << j)) d = Math.max(d, b.lags[j]);
  if (d > 0) { const before = wetBins(b), keep = [b.x, b.z, b.heading, b.trail.slice(), b.trailLen, b.lags.slice()];
    stepBack(b, d); for (let j = 0; j < NB; j++) b.lags[j] = Math.max(0, b.lags[j] - d);
    if (wetBins(b) & ~before) { [b.x, b.z, b.heading] = keep; b.trail = keep[3]; b.trailLen = keep[4]; b.lags.set(keep[5]); } }
  b.px = b.x; b.pz = b.z; b.ph = b.heading;
}
// a battalion not marching forward (halted, wheeling): lagging files walk up to their places at their
// ground's quick step; a file whose place would reach impassable ground stays where it is
const lagTmp = new Float64Array(NB);
function lagSettle(b) {
  if (b.trans) return;
  let any = false; for (let j = 0; j < NB; j++) if (b.lags[j] > 0) any = true;
  if (!any) { if (b.disorder > 0) updateDisorder(b, 0, R.pace[FORM(b).pace]); return; }
  const [V0, paceName] = paceOf(b); sampleBins(b, paceName, V0);
  const before = wetBins(b); lagTmp.set(b.lags);
  for (let j = 0; j < NB; j++) if (b.binG[j] > 0) b.lags[j] = Math.max(0, b.lags[j] - V0 * b.binG[j] * b.binQ[j] * TICK);
  accordion(b);
  const wet = wetBins(b) & ~before; for (let j = 0; j < NB; j++) if (wet & (1 << j)) b.lags[j] = lagTmp[j];
  updateDisorder(b, 0, V0);
}
// the turning radius of a trail shape's head: men one file apart along the trail (FS) stay at least
// SEP apart on the inside of the bend, r_in / R >= SEP / FS with r_in = R − half-width
const turnRadius = b => binsOf(b.shape).half * FS / (FS - SEP);
// the shape's half-width across its heading (for the turning rate and a wheel's pivot)
function halfWidth(b) {
  if (snakes(b)) return binsOf(b.shape).half;
  let w = 0; for (let c = 0; c < COMPANIES; c++) w = Math.max(w, Math.abs(companyPlace(b, c).x));
  return w + BW / 2;
}
const STALL = 0.04;   // m/s: an anchor slower than this, with a held bin, is stopped by impassable ground
const HALT_AFTER = 1;   // s held and stalled before the order is given up

const tickLag0 = new Float64Array(NB);
function formationTick(b) {
  tickLag0.set(b.lags); b.rateOff = false;
  formationStep(b);
  for (let j = 0; j < NB; j++) b.lagRate[j] = b.trans || b.rateOff ? 0 : (b.lags[j] - tickLag0[j]) / TICK;
}
function formationStep(b) {
  b.px = b.x; b.pz = b.z; b.ph = b.heading; b.omega = 0;
  if (b.trans) {   // no marching while the companies change places; a new shape order interrupts the change
    b.vx = b.vz = 0;
    if (b.orders[0] && b.orders[0].type === 'form') { startChange(b, b.orders.shift().shape); return; }
    if (simTime >= b.trans.start + b.trans.delay[3] + b.trans.dur) {
      b.place = b.trans.to; b.shape = b.trans.shape; b.log[b.log.length - 1].took = simTime - b.trans.start; b.trans = null;
      if (FORM(b).trail) resetTrail(b);   // the column stands straight behind its head
      if (!FORM(b).closeAcross) rebalance(b);   // casualties during the change: even the companies again
      closeRanks(b);   // re-forming is when the files dress and close
    }
    return;
  }
  const o = b.orders[0]; if (!o) { b.vx = b.vz = 0; lagSettle(b); return; }
  const h0 = b.heading;
  if (o.type === 'form') { b.orders.shift(); startChange(b, o.shape); return; }
  const [V0, paceName] = paceOf(b);
  const v = V0;   // turning rate uses the base pace
  const halfW = halfWidth(b);
  if (o.type === 'move') {
    if (o.x === undefined) { o.x = b.x + Math.sin(b.heading) * o.ahead; o.z = b.z + Math.cos(b.heading) * o.ahead; }
    const dx = o.x - b.x, dz = o.z - b.z, dist = Math.hypot(dx, dz);
    if (dist < 0.4) { b.orders.shift(); b.vx = b.vz = 0; return; }
    let want = Math.atan2(dx, dz), dh = want - b.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const wmax = 1.2 * v / halfW * TICK;   // the outer flank may not outrun the quick step: long lines turn slowly
    // the turn, through the gate: a straight shape turns first (in place when the turn is large); a trail
    // shape turns only as its head advances, on a radius of at least turnRadius (after the advance below)
    const snake = snakes(b);
    // a trail shape cannot reach a target inside its turning circle on the side it turns to: this move
    // ends there (no automatic manoeuvre: the player re-orders, faces about or re-forms)
    if (snake) { const R0 = turnRadius(b), sd = dh > 0 ? 1 : -1, cx = b.x + Math.cos(b.heading) * R0 * sd, cz = b.z - Math.sin(b.heading) * R0 * sd;
      if (Math.hypot(o.x - cx, o.z - cz) < R0) { b.orders.shift(); b.vx = b.vz = 0; b.status = 'arrived: as near as the column can turn'; return; } }   // the next order goes on
    const before = wetBins(b); let turnHeld = false;
    const turnBy = lim => { const h1 = b.heading, turn = Math.max(-lim, Math.min(lim, dh)), ut = gate(b, before, u => { b.heading = h1 + turn * u; }); turnHeld = Math.abs(turn) > 1e-4 && ut < 1; };
    if (!snake) turnBy(wmax);
    // the advance: lags and speed from the lag model, then the gate holds any bin whose places would
    // reach impassable ground (its lag grows by the step: its men stand still) and cuts back the rest
    sampleBins(b, paceName, V0);
    const want0 = snake || (Math.abs(dh) < 1.0 && !turnHeld) ? Math.min(V0, dist / TICK) : 0;   // a straight shape turns before advancing
    const lag0 = b.lags.slice(), x0 = b.x, z0 = b.z;
    const { V, back } = lagStep(b, V0, want0);
    const step = V * TICK - back;   // renormalised: the anchor stays with its leading file
    const lag1 = b.lags.slice(), sx = Math.sin(b.heading) * step, sz = Math.cos(b.heading) * step;
    const set = u => { b.x = x0 + sx * u; b.z = z0 + sz * u; for (let j = 0; j < NB; j++) b.lags[j] = lag0[j] + (lag1[j] - lag0[j]) * u; };
    set(1);
    let held = 0;
    if (step > 0) { const wet = wetBins(b) & ~before;
      if (wet) { for (let j = 0; j < NB; j++) if (wet & (1 << j)) { lag1[j] = lag0[j] + step; held |= 1 << j; } set(1); accordion(b); lag1.set(b.lags); } }
    const ua = gate(b, before, set);
    pushTrail(b);
    const moved = step * ua;
    if (snake) turnBy(Math.min(wmax, Math.max(0, moved) / turnRadius(b)));
    b.vx = (b.x - x0) / TICK; b.vz = (b.z - z0) / TICK;
    for (let j = 0; j < NB; j++) if (b.binN[j] && b.binG[j] <= 0) held |= 1 << j;
    // stopped by impassable ground: held and not advancing (or not able to turn) for a while
    if ((held || turnHeld) && (moved < STALL * TICK || turnHeld) && (want0 > 0 || turnHeld)) { b.blockedFor += TICK; if (b.blockedFor > HALT_AFTER) haltAtEdge(b, held); }
    else { b.blockedFor = 0; if (moved > 0.001) b.status = ''; }
  } else if (o.type === 'dress') {   // halt and dress: lagging files close up (at most DRESS_TIME)
    b.vx = b.vz = 0; lagSettle(b); if (o.t0 === undefined) o.t0 = simTime;
    let lmax = 0; for (let j = 0; j < NB; j++) if (b.binN[j]) lmax = Math.max(lmax, b.lags[j]);
    if (lmax < 0.05 || simTime - o.t0 > DRESS_TIME) b.orders.shift();
  } else if (o.type === 'face') {   // face about, then stand while the men turn
    b.vx = b.vz = 0;
    if (o.t0 === undefined) { const why = faceAbout(b); if (why) { b.orders = []; b.status = 'cannot face about: ' + why; return; } o.t0 = simTime; b.blockedFor = 0; }
    if (simTime - o.t0 >= FACE_TIME * drill) b.orders.shift();
  } else if (o.type === 'wheel') {   // rotate the whole battalion around the flank it turns to
    if (snakes(b)) { b.orders.shift(); b.status = 'cannot wheel: a column of route turns as it marches'; return; }
    lagSettle(b);
    if (o.left === undefined) { o.left = o.angle > 0; const piv = rot2(o.left ? -halfW : halfW, 0, -b.heading); o.px = b.x + piv[0]; o.pz = b.z + piv[1]; o.done = 0; }
    const w = Math.min(Math.abs(o.angle) - o.done, 1.0 * v / (2 * halfW) * TICK);   // outer flank at marching pace
    const sgn = o.angle > 0 ? -1 : 1, x0 = b.x, z0 = b.z, before = wetBins(b);
    const uw = gate(b, before, u => { const r = rot2(x0 - o.px, z0 - o.pz, -sgn * w * u); b.x = o.px + r[0]; b.z = o.pz + r[1]; b.heading = h0 + sgn * w * u; });
    b.vx = (b.x - x0) / TICK; b.vz = (b.z - z0) / TICK; o.done += w * uw; pushTrail(b);
    if (uw === 0) haltAtEdge(b, 0);   // the wheel would put men on impassable ground: it stops short of it
    else if (o.done >= Math.abs(o.angle) - 1e-6) { b.orders.shift(); b.vx = b.vz = 0; }
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
/* even out the companies when a shape other than line starts or ends: closing toward the colours moves
   men between companies, and casualties during a change thin them unevenly; a square or a column needs
   four equal, centred companies. Men keep their order along the line; files fill front to back. */
function rebalance(b) {
  const alive = []; for (let i = 0; i < b.soldiers.length; i++) if (b.soldiers[i].alive) alive.push(i);
  const size = [0, 0, 0, 0]; for (const i of alive) size[b.soldiers[i].c]++;
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
  if (FORM(b).closeAcross && !b.trans) {
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
// how far a soldier's file has fallen behind (metres), from his bin's lag
const lagOf = (b, s) => b.trans ? 0 : b.lags[s.c * 3 + binOfSlot(b, s.c, s.r, s.f)];
// his place this frame: the slot, set back along the company's facing by his file's lag
// f.ctx: the frame's places context (companyFrames). Looking ahead, a place on impassable ground falls back
// to the place now (which the gate keeps off it): a file about to be held aims at where it will stop
function soldierPlace(b, f, s) {
  const p = placeAt(f.ctx, s.c, s.r, s.f);
  return f.ctx0 && IMP[kindOf(b)][cellK(p[0], p[1])] ? placeAt(f.ctx0, s.c, s.r, s.f) : p;
}
const frameSlot = (f, file, rank) => { const lx = (file - (FILES - 1) / 2) * FS, lz = -rank * RS; return [f.x + lx * f.cos - lz * f.sin, f.z + lx * f.sin + lz * f.cos]; };
// each company's frame in world space, computed once per battalion per frame (not per soldier)
function companyFrames(b, ahead, alpha) {
  const [hx, hz, h] = anchorAt(b, alpha, ahead), out = b.frames || (b.frames = [{}, {}, {}, {}]);
  b.frameCtx = placesCtx(b, hx, hz, h, ahead, b.frameCtx || {}, ahead - (1 - alpha) * TICK);
  if (ahead > 0) { const [x0, z0, h0] = anchorAt(b, alpha, 0); b.frameCtx0 = placesCtx(b, x0, z0, h0, 0, b.frameCtx0 || {}, -(1 - alpha) * TICK); }
  for (let c = 0; c < COMPANIES; c++) { const w = placeWorld(b, c, hx, hz, h, ahead), f = out[c]; f.x = w.x; f.z = w.z; f.cos = Math.cos(w.a); f.sin = Math.sin(w.a); f.face = w.face;
    f.ctx = b.frameCtx; f.ctx0 = ahead > 0 ? b.frameCtx0 : null; }
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
      const f = fr[s.c], [sx, sz] = soldierPlace(b, f, s);   // the slot, set back by his file's lag
      const amp = (inWood(s.x, s.z) ? 0.3 : 0.1) * b.sway;   // personal drift: the ranks loosen in woods
      let tx = sx + amp * Math.sin(t + s.dx), tz = sz + amp * Math.sin(t * 0.8 + s.dz);
      // a slot inside a trunk or rock moves to its edge: a stable place to stand, not a tug of war
      eachObstacle(tx, tz, o => { const ex = tx - o.x, ez = tz - o.z, d = Math.sqrt(ex * ex + ez * ez), R = o.r + 0.4;
        if (d < R) { if (d > 1e-6) { tx = o.x + ex / d * R; tz = o.z + ez / d * R; } else tx = o.x + R; } });
      // settled: a man who reached his place while the battalion is halted holds still (no steering, no
      // pushing) until his place moves; this is what lets the ranks come to rest among trees
      if (s.settled && (busy || Math.hypot(tx - s.hx, tz - s.hz) > 0.3)) s.settled = false;
      if (s.settled) { s.vx = s.vz = 0; continue; }
      const dx = tx - s.x, dz = tz - s.z, dist = Math.sqrt(dx * dx + dz * dz);
      if (!busy && b.sway < 0.05 && dist < 0.25) { s.settled = true; s.hx = tx; s.hz = tz; s.vx = s.vz = 0; continue; }
      const kind = FORM(b).kind, gs = Math.max(0.15, dist > 1e-6 ? groundSpeed(s.x, s.z, dx / dist, dz / dist, kind) : groundSpeed(s.x, s.z, 0, 0, kind));   // never frozen mid-step
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
      // obstacles (trunks, rocks): while walking, steer round the ones just ahead
      const walking = Math.min(1, Math.sqrt(s.vx * s.vx + s.vz * s.vz) / 0.5);
      if (walking > 0) eachObstacle(s.x, s.z, o => { const ex = s.x - o.x, ez = s.z - o.z, d = Math.sqrt(ex * ex + ez * ez), R = o.r + 0.35;
        if (d < R + 0.8 && d > 1e-6) { const push = (R + 0.8 - d) / 0.8 * 1.4 * walking; wx += ex / d * push; wz += ez / d * push; } });
      const k = Math.min(1, dt * 5); s.vx += (wx - s.vx) * k; s.vz += (wz - s.vz) * k;
      if (dist < 0.08) { const damp = Math.max(0, 1 - dt * 8); s.vx *= damp; s.vz *= damp; }   // arrived: come to rest
      const sp2 = s.vx * s.vx + s.vz * s.vz, cap = RUN * gs; if (sp2 > cap * cap) { const r = cap / Math.sqrt(sp2); s.vx *= r; s.vz *= r; }
      const nx = s.x + s.vx * dt, nz = s.z + s.vz * dt;
      const imp = IMP[kindOf(b)]; if (imp[cellK(nx, nz)] && !imp[cellK(s.x, s.z)]) { s.vx = s.vz = 0; } else { s.x = nx; s.z = nz; }   // never onto impassable ground
      eachObstacle(s.x, s.z, o => { const ex = s.x - o.x, ez = s.z - o.z, d = Math.sqrt(ex * ex + ez * ez), R = o.r + 0.3;   // never inside one
        if (d < R && d > 1e-6) { s.x = o.x + ex / d * R; s.z = o.z + ez / d * R; } });
    }
  }
}

/* ---------- commands ---------- */
let main;
function reset(x = -20, z = -40, heading = 0) {
  battalions.length = 0; simTime = 0; acc = 0; manyOn = false;
  main = makeBattalion(x, z, heading, 0, 7);
}
function order(name, a) {
  const b = main;
  b.status = ''; b.blockedFor = 0;
  if (SHAPES[name]) { b.orders = [{ type: 'form', shape: name }]; return; }
  if (name === 'move') { b.orders = [{ type: 'move', x: a.x, z: a.z }]; return; }
  if (name === 'face') { b.orders = [{ type: 'face' }]; return; }
  // retire: face about, march a metres, halt and dress, face the front again (all through the gate)
  if (name === 'retire') { b.orders = [{ type: 'face' }, { type: 'move', ahead: a || 30 }, { type: 'dress', finish: true }, { type: 'face', finish: true }]; return; }
  if (name === 'wheelL') { b.orders = [{ type: 'wheel', angle: Math.PI / 4 }]; return; }
  if (name === 'wheelR') { b.orders = [{ type: 'wheel', angle: -Math.PI / 4 }]; return; }
  if (name === 'wood') { b.orders = [{ type: 'move', x: WOOD.x, z: WOOD.z - WOOD.r - 12 }, { type: 'move', x: WOOD.x, z: WOOD.z + WOOD.r + 14 }]; return; }
  // a passage (the ruleset's narrow and deploy shapes): narrow short of it, cross, deploy beyond
  const cross = (xe, xx, zc) => { b.orders = [{ type: 'move', x: xe - 30, z: zc }, { type: 'form', shape: R.passage.narrow }, { type: 'move', x: xe, z: zc }, { type: 'move', x: xx, z: zc }, { type: 'form', shape: R.passage.deploy }]; };
  if (name === 'ford') return cross(STREAM_X(0) - 22, STREAM_X(0) + 24, 0);
  if (name === 'kill') return kill(b, 10);
  if (name === 'bridge') return cross(BRIDGE.x0 - 12, BRIDGE.x1 + 32, BRIDGE.z);   // deploy with the column's rear off the bridge
  if (name === 'style') { b.style = a; return; }
}
let manyOn = false;
function setMany(on) {
  manyOn = on; battalions.length = 1;
  if (!on) return;
  const r = rng(99);
  for (let i = 0; i < 39; i++) { const gx = i % 8, gz = Math.floor(i / 8), x = -150 + gx * 38, z = -150 + gz * 55;   // rows clear of a 27 m march column
    const b = makeBattalion(x, z, 0, 0, 100 + i); const shapes = Object.keys(R.formations);
    b.orders = [{ type: 'form', shape: shapes[i % shapes.length] }, { type: 'move', x: x + (r() - 0.5) * 30, z: z + 40 }]; }
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
    soldiers: battalions.reduce((a, x) => a + x.soldiers.length, 0), steerMs: +avg.toFixed(2),
    style: b.style, lagMax: +Math.max(...b.lags).toFixed(2), lagMean: +([...b.lags].filter((l, j) => b.binN[j]).reduce((a, x, k, A) => a + x / A.length, 0)).toFixed(2), disorder: +b.disorder.toFixed(2), status: b.status };
}
// how far soldiers are from their slots (a measurement, not a pass/fail check): max and mean, metres
function slotError() {
  let max = 0, sum = 0, n = 0;
  for (const b of battalions) { const fr = companyFrames(b, 0, acc / TICK);
    for (const s of b.soldiers) if (s.alive) { const p = soldierPlace(b, fr[s.c], s), d = Math.hypot(s.x - p[0], s.z - p[1]); max = Math.max(max, d); sum += d; n++; } }
  return { max: +max.toFixed(2), mean: +(sum / Math.max(1, n)).toFixed(2) };
}
// simulation CPU per frame (formation ticks + steering) over `frames` frames of 1/60 s
function measure(frames = 60) {
  let t = 0; for (let k = 0; k < frames; k++) { const t0 = performance.now(); advance(1 / 60); t += performance.now() - t0; }
  return +(t / frames).toFixed(2);
}
// test hook: water depth over a rectangle (null: the map's own); rebakes the impassable grid
function paintDepth(x0, z0, x1, z1, d) {
  for (let z = Math.ceil(z0); z <= z1; z++) for (let x = Math.ceil(x0); x <= x1; x++) WDEPTH[cellK(x, z)] = d === null ? waterDepth(x, z) : d;
  bakeImpassable();
}
function paintTerrain(x0, z0, x1, z1, cls) {
  const id = cls === null ? -1 : CLASSES.indexOf(cls);
  for (let z = Math.ceil(z0); z <= z1; z++) for (let x = Math.ceil(x0); x <= x1; x++) { const k = cellK(x, z); TERR[k] = id < 0 ? CLASSES.indexOf(classAt(x, z)) : id; }
  bakeImpassable();
}
reset();
window.FC = { paintTerrain, paintDepth, IMP, bakeImpassable, AHEAD, place: (x, z, h) => reset(x, z, h),
  FIELD, HALF, H, heights, HN, HG, STREAM_X, FORD, WOOD, WATER_HALF, HILLS, ROAD, TREES, ROCKS, inWater, inWood,
  FILES, RANKS, COMPANIES, battalions, groundSpeed, groundG, CLASSES, TERR, WDEPTH, CROPS, PLOUGHED, MARSH, DENSE, HEDGES, BRIDGE, RULESET: R,
  soldierPlace, lagOf, cellK, wetBins, get main() { return main; }, get simTime() { return simTime; }, get alpha() { return acc / TICK; },
  get speed() { return speed; }, set speed(v) { speed = v; }, get drill() { return drill; }, set drill(v) { drill = v; },
  order, reset, setMany, kill: n => kill(main, n), advance, stats, slotError, measure, companyFrames, frameSlot,
  get manyOn() { return manyOn; },
};
})();
