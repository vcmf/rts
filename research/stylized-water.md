# Rivers, ponds and painted water for the top-down RTS

Research notes, October 2026. Scope: how to (1) **shape** streams, rivers and ponds
so they stop looking like "a scarf, same width everywhere", and (2) **render** them
so they look painted (*Puss in Boots: The Last Wish* direction) and read clearly
from the fixed top-down camera (pitch about 40–55°, distance 45–260 m, no sky).
Target: Babylon.js 9.29 on WebGL2 now, WebGPU later, custom GLSL
`ShaderMaterial`s. Written against `design.md`,
`research/cheap-painterly-postfx.md` and `prototypes/painted-cinematic.html`.

**Confidence tags** (same scheme as `cheap-painterly-postfx.md`, plus [O])

| Tag | Meaning |
|---|---|
| **[V-src]** | Verified by reading Babylon.js source (the 9.29.0 UMD build the prototype loads, or the `master` TypeScript) |
| **[V-doc]** | Verified in a paper, official doc, talk or developer write-up (linked in §8) |
| **[E]** | My estimate, reasoning shown. Nothing has been measured on this scene yet |
| **[O]** | My observation of a shipped game's look (from footage/play), not a developer statement. Treat it as a reading, not a fact |
| **[U]** | Could not verify. A lead, not a fact |

---

## 1. Executive summary

### 1.1 What is wrong with the current water (from reading the prototype)

- The centre line is `x = a + b·sin(cz) + d·sin(ez+f)` (`STREAM`, line 92). It is a
  function of `z`, so the river can never turn back on itself, and the meander
  amplitude is the same everywhere. It can't produce real bends.
- The channel is carved as `h -= 3.4·(1 − smoothstep(3, 11, |x − streamX(z)|))`
  (line 99). The width, depth and profile are the same along the whole river, and
  `|x − streamX(z)|` is a horizontal distance, not a distance to the curve. It
  shrinks the channel wherever the curve runs diagonally.
- The base terrain (`fbm` hills) doesn't know the river exists. The stream crosses
  hills instead of sitting in a valley with a floodplain.
- The terrain grid is 520 m / 300 ≈ **1.73 m per vertex**. A 6 m stream is about
  3–4 vertices wide, too coarse for cut banks, point bars or gravel bars.
- The water shader is already structured sensibly (depth ramp, flow strokes,
  canopy reflections, glitter, foam, ice), but depth comes from a per-vertex
  `aDepth` on a 15-column ribbon. So the shore line and depth bands are
  interpolated across 2 m triangles, and every effect inherits the "scarf" shape.

### 1.2 Shape generation: ranked recommendation

1. **Authored river splines with per-key attributes, auto-filled by geomorphology
   rules (do this first).** Use a river network of polylines whose keys carry
   width, depth, discharge and speed, the way Unreal's water splines
   (`RiverWidth`, `Depth`, `WaterVelocityScalar` per spline point)
   **[V-doc]** and Guerrilla's Horizon river tool (width from a ramp × scale ×
   slope, height clamped so the river never flows uphill) **[V-doc]** do it.
   Rules fill in the attributes so the river looks natural with no hand tweaking:
   - **Meanders from a Kinoshita / sine-generated direction curve**, with
     wavelength about 11 channel widths and bend radius about 2–3 widths
     **[V-doc]**. Jitter wavelength and amplitude per bend. That jitter is the
     single biggest cure for the scarf look.
   - **Width ∝ discharge^0.5** (Leopold & Maddock's downstream hydraulic
     geometry) **[V-doc]**. Width steps up below every tributary. It also varies
     locally: the bankfull channel is a bit wider at bend apexes, while the wetted
     width at summer flow is narrower there because the point bar is exposed
     **[E, from field observation]**.
   - **Pools at bend apexes, riffles at the crossings between bends**, spaced 5–7
     widths apart **[V-doc]**. Pools are deep, calm and dark; riffles are shallow,
     fast, broken and bright. Riffles double as **fords**, the gameplay crossing
     points.
   - **Asymmetric cross-section driven by curvature**: steep cut bank on the
     outside, gentle point bar on the inside, deepest line (thalweg) shifted
     outward.
   - **The river sits in a valley.** Generate a smooth *valley axis*, let the
     channel meander within a floodplain belt around it, and make the water
     surface strictly descend downstream.
2. **Real rivers for historical maps: OSM centre lines and water polygons plus the
   Terrarium DEM, then re-carve.** The DEM (30 m source data) can't resolve a 5 m
   stream **[V-doc]**, so the channel is always carved procedurally along the
   imported line. Many Central European rivers were straightened and many ponds
   drained in the 19th century; the Žatčany (Satschan) pond at Austerlitz is gone
   and only its embankment remains **[V-doc]**. Use OSM for *where*, Habsburg
   military survey maps (Mapire) for *what it looked like in 1805*, and the rules
   from (1) to re-meander canalised reaches.
3. **Curvature-driven meander migration (Howard & Knutson 1984; `meanderpy`) as
   an offline generator** for maps that need oxbows and meander scars. The
   migration law is simple (migration rate = weighted sum of upstream curvature)
   and runs in JS in about a second for one river **[E]**. It produces cutoffs and
   oxbow lakes for free, which a closed-form curve cannot.
4. **Flow accumulation (priority-flood + D8) on the heightmap** only to *find*
   where tributaries and wet hollows want to be, on generated maps or to sanity
   check imported DEMs. It gives drainage *lines*, not channel shape.
5. **Not recommended as the main tool: grid hydraulic erosion** (droplet / pipe
   models, Sebastian Lague style). At 520 m and 1.7 m/texel it carves dendritic
   gullies, not meandering lowland streams, and it can't be art-directed or kept
   deterministic across map edits. At most, run it as a light offline pass on
   hillsides.

### 1.3 Rendering: ranked recommendation

1. **Bake a world-space "water data" texture once per map instead of using a
   screen depth buffer.** The camera is top-down and the terrain is static, so
   water depth, distance to shore, flow vector and foam sources can be computed
   on the CPU from the river splines and the carved heightmap. Store them in one
   or two RGBA8 textures at 0.25–0.5 m/texel. Crest's "ocean depth cache" does the
   same thing (an ortho top-down render of the seabed) **[V-doc]**. This gives
   soft shores, foam lines and depth colour at zero per-frame cost apart from one
   or two texture fetches, with no depth pre-pass and no sorting.
2. **Opaque water with "painted refraction": shade the river bed inside the water
   shader** using the same ground-albedo function the terrain uses, offset by
   depth along the view ray. Then blend toward the water colour by a per-channel
   absorption ramp. At depth 0 the water colour *equals* the terrain colour, so
   the shore seam, z-fighting at shallow edges and the need for alpha blending all
   disappear. Staying opaque matters here: the prototype writes view depth into
   alpha for the finishing pass, and Babylon's `ALPHA_COMBINE` blends alpha as
   `srcA + dstA`, which would corrupt it **[V-src]**.
3. **A painted depth ramp in 3 bands with grain-broken thresholds**: warm
   ochre-green shallows → turquoise → deep teal/blue-violet. This is the §4 shading
   ramp rule from `design.md` applied to depth instead of light.
4. **Flow strokes aligned with the current**, using (across, along) ribbon UVs and
   a baked **time-of-travel** coordinate so strokes stretch in fast reaches and
   bunch in pools without shearing. Use a two-phase flow map (Valve, Portal 2)
   **[V-doc]** only where flow isn't along the ribbon: eddies behind rocks, pond
   inflows, confluences.
5. **Hard-edged painted foam** from the baked data: a broken shore line, riffle
   chevrons, rock pillows and wakes, weir lines. Wind Waker-style graphic
   patterns, not soft white gradients.
6. **Reflections without a sky**: keep the current painted sky tint and baked
   canopy reflections; add crisp reflections in calm pools and break them up on
   riffles. **Don't use `MirrorTexture` or Babylon's `WaterMaterial`.** Both
   re-render the scene into extra targets every frame and assume one flat water
   plane **[V-src]**. That fails for a stream that drops downhill, and at
   40–55° pitch most mirrored rays would hit the sky we never draw.
7. **Banks do half the work**: a wet dark band above the waterline, exposed earth
   on cut banks, pale gravel on point bars, reeds on slow inside bends and pond
   inflows, overhanging grass breaking the line.
8. **Readability**: water should be the coolest, smoothest family on screen, with
   a dark wet band outside and a light meniscus or foam line inside. That gives a
   graphic outline that reads at 260 m (about 6 px/m, see §6.10).

### 1.4 Order of work for the prototype (estimates)

| Step | What | Effort [E] | Visual payoff |
|---|---|---|---|
| 1 | River data model + Kinoshita centre line + attribute rules (§2.1–2.3) | 0.5–1 day | Kills the scarf look |
| 2 | Valley/floodplain + asymmetric section carving in `H()` (§2.4) | 1 day | River sits in the land |
| 3 | Water-data bake (depth, SDF, flow, foam) + one texture bound to terrain and water (§2.6) | 1 day | Enables everything below |
| 4 | Ribbon mesh per channel, ponds as flat polygons (§2.7) | 0.5 day | Clean geometry, no folds |
| 5 | New water shader layers (§2.8) + bank painting in the terrain shader | 1–2 days | The painted look |
| 6 | Finer geometry at banks: terrain at ~0.85 m or a bank strip mesh (§2.5) | 0.5–1 day | Cut banks, bars |
| 7 | Rocks, weirs, fords, reeds, ice holes as foam/scatter sources | 1 day | Life and gameplay readability |
| 8 | OSM/Terrarium importer for historical maps (§3.6) | 2–3 days | Real Austerlitz/Berezina |

---

## 2. Implementation plan for `painted-cinematic.html`

Touchpoints to replace: `STREAM`/`streamX`/`STREAM_GLSL` (lines 92–94), the
carve in `H()` (line 99), stream banks in `TER_FS` (lines 271–273), the water
block (lines 303–370), `reflAdd` (line 356), `nearStream` and the stream-side
scatter (lines 481–523). Everything that asked "how far from the stream?" asks
the river query (§2.4) or the baked SDF (§2.6) instead.

### 2.1 Data model

```js
// One channel = one polyline. A network = channels + junctions + ponds.
const RIVERS = {
  channels: [{
    id: 'goldbach',
    keys: [                      // authored or generated; resampled to ~W/4 spacing
      // x, z: plan position (m). Everything else optional: rules fill the gaps.
      { x: -260, z: -240, Q: 1.0 },          // Q: relative discharge
      { x:  -60, z:   40 },
      { x:  140, z:  260, weir: true },      // event keys: weir, ford, bridge, mill
    ],
    W0: 6,          // bankfull width at Q = 1 (m)
    D0: 0.9,        // mean depth at Q = 1 (m)
    bankH: 0.9,     // floodplain height above summer water level (m)
    floodplainW: 70,// meander-belt / floodplain width (m)
    seed: 7,
  }],
  junctions: [{ child: 'trib1', parent: 'goldbach', s: 410 }],  // tributary mouth at parent arc length s
  ponds: [{ id: 'satschan', poly: [[x,z], ...], level: 181.5, maxDepth: 1.6,
            dam: { a: [x,z], b: [x,z], crestH: 1.2 }, inlet: 'goldbach', outlet: 'goldbach' }],
  rocks: [[x, z, r], ...],   // boulders/bridge piers: foam + flow obstacles
};

// After processing, every channel holds dense per-sample arrays (Float32Array):
// px, pz, tx, tz (unit tangent), s (arc length), kappa (signed curvature, smoothed),
// W (bankfull width), D (pool/riffle depth), A (bank asymmetry, -1..1, + = outer bank on +n side),
// zw (water surface height), v (surface speed), tau (time of travel = ∫ds/v), riffle (0..1)
```

Why per-sample arrays: `H(x,z)`, the bake, the mesh builder and the scatter all
query the same thing, "nearest river sample to (x,z) and its attributes", so it
is computed once and shared.

### 2.2 Centre line: Kinoshita curve inside a valley frame

The Kinoshita curve gives the channel *direction* as a function of arc length `s`:

θ(s) = θ₀·sin(2πs/λ) + θ₀³·(J_s·cos(6πs/λ) − J_f·sin(6πs/λ))

θ₀ is the peak angle, and J_s and J_f control skew (bends lean downstream) and
flatness (fatter, boxier bends) **[V-doc]**. With J_s = J_f = 0 it reduces to
Langbein & Leopold's sine-generated curve, the minimum-variance path that real
meanders follow **[V-doc]**. For that curve, sinuosity P = 1/J₀(θ₀), where J₀ is
the Bessel function (Langbein & Leopold 1966, USGS PP 422-H) **[V-doc]**.
Useful values: θ₀ = 1.0 rad → P ≈ 1.31; 1.5 → 1.95; 2.0 → 4.5 (close to
self-touching, where cutoffs happen).

Integrate the direction in a straight local frame (u along the valley, v
across), then bend that frame onto a smooth valley-axis curve. Meanders stay
inside the floodplain, and the valley can follow the land.

```js
const J0=x=>{let s=0;for(let i=0;i<64;i++){const t=(i+0.5)/64*Math.PI;s+=Math.cos(x*Math.sin(t));}return s/64;};
// returns [{u,v}] in the valley frame, spacing ds
function kinoshita({W, length, theta0=1.2, Js=0.03, Jf=0.02, seed=1}){
  const rnd=mulberry(seed), ds=W/4, out=[];
  let u=0, v=0, ph=rnd()*6.283, s=0;
  // per-bend jitter: smooth 1D noise in units of bends. Without it the river is a scarf again.
  const nA=k=>vn(k*0.9+seed,3.1), nL=k=>vn(k*0.9+seed,7.7);
  while(u<length){
    const bend=ph/Math.PI;                                  // fractional bend index
    const th0=theta0*(0.75+0.5*nA(bend));                    // ±25% amplitude per bend
    const lamV=11*W*(0.8+0.4*nL(bend));                      // valley wavelength ≈ 11 W, ±20%
    const lam=lamV/J0(th0);                                  // arc wavelength = valley λ × sinuosity
    const th=th0*Math.sin(ph)+th0**3*(Js*Math.cos(3*ph)-Jf*Math.sin(3*ph));
    u+=Math.cos(th)*ds; v+=Math.sin(th)*ds; s+=ds;
    ph+=2*Math.PI*ds/lam;
    out.push({u,v,s});
  }
  return out;
}
// map onto the valley axis A(u) (a smooth Catmull-Rom with large radius): P = A(u) + N(u)·v
```

Pitfalls
- **Changing θ₀ or λ discontinuously makes kinks.** Accumulate phase (as
  above) and vary the parameters with smooth noise, never per-sample random.
- **Drift:** with J_s ≠ 0 and jittered θ₀, v wanders off. Add a weak restoring
  term `th -= 0.15*v/floodplainW` so the channel stays inside the belt.
- **Valley-frame distortion:** if the axis radius is under about 3× the
  floodplain width, the inner side compresses and bends can fold. Keep the axis
  gentle (or generate directly in world space with axis heading + θ).
- **Self-intersection at high θ₀.** Above about 2.0 rad, adjacent loops touch.
  Either keep θ₀ ≤ 1.7 or detect the near-contact and convert it into a cutoff
  (straight chute + oxbow, §3.4).
- Smooth the resampled points with 1–2 Chaikin passes, then compute signed
  curvature κ and smooth it over a window of about 1 W.

### 2.3 Attributes along the river

```js
function fillAttributes(ch){
  const n=ch.px.length;
  for(let i=0;i<n;i++){
    const Q=ch.Q[i];                                   // steps up below each junction: Q_parent += Q_child
    const k=ch.kappaLag[i];                            // curvature sampled ~0.5 W upstream: bars/pools sit just below the apex
    const bendness=Math.min(1,Math.abs(k)*ch.W0*2.3);  // 1 ≈ bend radius 2.3 W (a tight bend)
    let W=ch.W0*Math.sqrt(Q)*(1+0.12*bendness)*(0.92+0.16*vn(ch.s[i]/(3*ch.W0),1.7)); // Q^0.5, bend widening, noise
    // riffle: crossings between bends (low curvature) plus a 6 W rhythm in straight reaches
    const straightRhythm=0.5+0.5*Math.cos(2*Math.PI*ch.s[i]/(6*W));
    const riffle=Math.max(1-Math.min(1,bendness*1.6), (1-bendness)*straightRhythm);
    ch.W[i]=W;
    ch.riffle[i]=riffle;
    ch.D[i]=ch.D0*Math.pow(Q,0.4)*(1.45-1.0*riffle);  // pools ~1.45×, riffles ~0.45× mean
    ch.A[i]=Math.max(-1,Math.min(1,-k*W*1.6));         // + : outer (cut) bank on the +n side
    ch.v[i]=ch.v0*Math.pow(Q,0.1)*(0.55+1.1*riffle);   // slow pools, fast riffles
  }
  // water surface: sample base terrain along the line, running minimum downstream (never uphill),
  // then concentrate the drop on riffles (pool–riffle staircase)
  let z=Infinity; const raw=new Float32Array(n);
  for(let i=0;i<n;i++){z=Math.min(z,baseH(ch.px[i],ch.pz[i])-ch.bankH);raw[i]=z;}
  const drop=raw[0]-raw[n-1];let wsum=0;for(let i=1;i<n;i++)wsum+=0.25+ch.riffle[i];
  ch.zw[0]=raw[0];for(let i=1;i<n;i++)ch.zw[i]=ch.zw[i-1]-drop*(0.25+ch.riffle[i])/wsum;
  for(let i=0;i<n;i++)ch.zw[i]=Math.min(ch.zw[i],raw[i]);  // staircase must never rise above the running minimum
  // time of travel for flow strokes (§2.8): tau = ∫ ds / v
  ch.tau[0]=0;for(let i=1;i<n;i++)ch.tau[i]=ch.tau[i-1]+(ch.s[i]-ch.s[i-1])/ch.v[i];
}
```

The exponents 0.5 (width), 0.4 (depth) and 0.1 (velocity) are the commonly
quoted average downstream values from Leopold & Maddock (1953). The USGS abstract
confirms the power-law form **[V-doc]**; the specific numbers are textbook
values **[V-doc, secondary]**. Pool/riffle depth factors and the bend-widening
12% are art choices **[E]**.

Pitfalls
- **Perched water.** If `zw` ends up above the surrounding ground (a dip in
  `baseH` beside the river), the outer ribbon columns float over land. The final
  `min(stair, raw)` prevents it along the centre line; check the bake for wet
  texels far from any channel as a debug view.
- **Monotonic water surface is mandatory.** The running minimum is Horizon's
  trick **[V-doc]**. Without it, noise terrain makes water flow uphill or pond
  in mid-air.
- **Equal riffle spacing reads as artificial.** Let it come from the jittered
  bends. The straight-reach rhythm only fills long straight reaches.
- **Don't make "wider at the pool".** The bankfull channel can be slightly wider
  at the apex, but the *water* is narrower there because the point bar emerges.
  That contrast (dark narrow pool against pale bar) is what makes a bend read.

### 2.4 Carving: valley, floodplain, asymmetric channel

**River query.** Bucket all samples of all channels into a 16 m grid. For a
point, test the segments in its cell and neighbours, find the closest segment,
and return arc length `s`, signed offset `n` (+ to the left of the tangent) and
the interpolated attributes. This is the distance to a polyline with variable
radius, the 2D version of iq's segment / uneven-capsule distance **[V-doc]**.

```js
function riverQuery(x,z){            // -> {ch,i,t,n,s,dist} of the nearest segment, or null
  let best=null;
  for(const seg of grid.near(x,z)){  // seg = [ch, i] for segment i..i+1
    const [ch,i]=seg, ax=ch.px[i],az=ch.pz[i],bx=ch.px[i+1],bz=ch.pz[i+1];
    const ex=bx-ax,ez=bz-az,L2=ex*ex+ez*ez,t=Math.max(0,Math.min(1,((x-ax)*ex+(z-az)*ez)/L2));
    const dx=x-(ax+ex*t),dz=z-(az+ez*t),d=Math.hypot(dx,dz);
    if(!best||d<best.dist){const n=Math.sign(ex*dz-ez*dx)*d;   // + = left of tangent
      best={ch,i,t,n,dist:d};}
  }
  return best;
}
const lerpA=(arr,q)=>arr[q.i]+(arr[q.i+1]-arr[q.i])*q.t;
```

**Cross-section** returns the ground height relative to the local water surface
(negative = under water). The outer side is steep (cut bank); the inner side
reaches the water early and then rises slowly as a point bar.

```js
const sm=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function section(n, hw, A, D, bankH){        // n: signed offset (m); A: asymmetry, + = outer bank on +n
  const sgn=A>=0?1:-1, a=Math.abs(A), m=n*sgn; // m > 0 : toward the outer bank
  const tw=0.35*a*hw;                          // thalweg shifted toward the outer bank
  if(m>=tw){                                   // ---- outer half: cut bank
    const t=(m-tw)/(hw-tw);
    if(t<=1) return -D*(1-Math.pow(t,2+4*a));                // steep wall under water
    return bankH*sm((m-hw)/(hw*(0.35-0.29*a)));              // near-vertical scarp when a→1
  }
  const e=hw+tw, t=(tw-m)/e, wet=1-0.45*a;     // ---- inner half: point bar
  if(t<=wet) return -D*(1-Math.pow(t/wet,2-0.6*a));
  return bankH*Math.pow(sm((t-wet)*e/(hw*(0.35+1.0*a))),1.6); // long, low gravel bar
}
```

**Height function.** Keep the old noise as `baseH`, then (a) pull the floodplain
down to the river, (b) cut the channel.

```js
function H(x,z){
  let h=baseH(x,z);
  const q=riverQuery(x,z); if(!q) return h;
  const ch=q.ch, hw=lerpA(ch.W,q)/2, zw=lerpA(ch.zw,q);
  const fp=zw+ch.bankH+0.25*(fbm(x*0.05,z*0.05)-0.5);        // floodplain: nearly flat, slight swales
  const valley=fp+Math.max(0,q.dist-ch.floodplainW/2)*0.18;  // valley sides rise at ~10°
  h=Math.min(h,valley);                                      // trough only; never raises hills
  if(q.dist<hw*3){
    const sec=zw+section(q.n,hw,lerpA(ch.A,q),lerpA(ch.D,q),ch.bankH);
    h=Math.min(h,sec);                                       // channel (min keeps confluences correct)
  }
  return h;
}
```

Pitfalls
- **`min`, not blend, at confluences and braids.** Taking the minimum of each
  channel's carved height keeps two channels' beds intact where they overlap. For
  speed, query the nearest *two* channels only near junctions (flag cells in the
  grid).
- **The nearest-segment switch at the inside of tight bends** produces a ridge in
  `n` (the medial axis). The point bar sits there, so it reads as a natural bar
  crest. If it shows as a seam, blend the two nearest segments by distance.
- **`H()` is called a lot** (two terrain meshes, AO bake 128² × 13 calls,
  scatter). The bucket grid keeps it at about 5–10 segment tests per call
  **[E]**; cache `baseH` in a Float32Array if the AO bake slows down.
- **Floodplain slope.** The floodplain inherits the water-surface slope. Real
  floodplains also have levees (slightly higher next to the channel) and
  backswamps further out. A +0.2 m bump within 1 W of the bank adds realism
  cheaply **[E]**.

### 2.5 Geometry resolution at the banks

A 1.73 m grid can't show a 0.5 m cut-bank scarp or a 3 m wide gravel bar. Options:

| Option | Cost [E] | Quality |
|---|---|---|
| Terrain at 600 subdivisions (0.87 m), 361k vertices for the detailed tile | +3–4 MB VB, ~0.2 ms vertex time on M1 | OK for banks ≥ 1 m |
| **Bank strip mesh** following each channel (24–32 columns from floodplain edge to edge, terrain material), terrain pushed 0.5 m below it inside the strip | ~10–30k vertices per km | Best: true scarps, bars, exact shoreline |
| Per-pixel normals from a baked 0.25 m height texture (no new geometry) | 1 fetch + 3 for gradient | Shading reads sharp even on coarse geometry |

Recommendation: per-pixel normals from the bake now (cheap, big gain), then the
bank strip mesh when the shapes are settled. The strip uses the same `section()`
so terrain, strip and water agree exactly.

### 2.6 The water-data bake

One RGBA8 texture covering the detailed tile (520 m). Use 1024² (0.51 m/texel) to
start, 2048² (0.25 m) if the shoreline looks polygonal at the closest zoom.

| Channel | Content | Encoding |
|---|---|---|
| R | water depth `zw − H(x,z)` (0 on dry land) | 0..4 m → 0..255 (1.6 cm steps) |
| G | signed distance to the shoreline (+ in water) | ±16 m → 0..255 (12.5 cm steps), 0.5 = shore |
| B, A | flow vector (tangent × speed / vmax) | −1..1 → 0..255 |

A second RGBA8 texture (optional): R = obstacle foam (rock pillows and wakes,
weirs, bridge piers), G = riffle mask, B = reeds/vegetation mask, A = bed material
(mud / sand / gravel / weed).

```js
function bakeWater(N){
  const half=SMW/2, px=SMW/N, depth=new Float32Array(N*N), wet=new Uint8Array(N*N), rgba=new Uint8Array(N*N*4);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const x=(i+0.5)*px-half, z=(j+0.5)*px-half, k=j*N+i;
    const ws=waterSurfaceAt(x,z);                 // channel zw(s) or pond level, or -Infinity
    const d=ws-H(x,z); depth[k]=Math.max(0,d); wet[k]=d>0?1:0;
  }
  const sdf=signedEDT(wet,N).map(v=>v*px);        // exact Euclidean DT inside & outside (Felzenszwalb–Huttenlocher), metres
  for(let k=0;k<N*N;k++){
    const x=((k%N)+0.5)*px-half, z=(Math.floor(k/N)+0.5)*px-half, f=flowAt(x,z); // tangent*speed, or pond drift
    rgba[k*4  ]=Math.min(255,depth[k]/4*255);
    rgba[k*4+1]=Math.max(0,Math.min(255,(0.5+sdf[k]/32)*255));
    rgba[k*4+2]=(f[0]*0.5+0.5)*255; rgba[k*4+3]=(f[1]*0.5+0.5)*255;
  }
  const t=B.RawTexture.CreateRGBATexture(rgba,N,N,scene,false,false,B.Texture.BILINEAR_SAMPLINGMODE);
  t.wrapU=t.wrapV=B.Texture.CLAMP_ADDRESSMODE; return t;
}
```

Why this layout
- **RGBA8 is universally filterable.** Half-float textures are linear-filterable
  on WebGL2 (Babylon sets `textureHalfFloatLinearFiltering = true` for WebGL2),
  but float32 needs `OES_texture_float_linear` **[V-src]**. 8-bit precision is
  plenty for these ranges.
- **SDF from a distance transform, not from the spline.** The shoreline is where
  the water surface meets the *carved* terrain, including point bars, islands,
  gravel bars and pond outlines, and that is not a fixed offset from the centre
  line. An exact EDT on the wet mask handles every shape the same way.
- **Bind the same texture to the terrain material** for wet banks, reeds and bed
  colour (§2.9).

Cost [E]: 1024² texels × one `riverQuery` (~5–10 segment tests) ≈ 50–150 ms in JS;
the EDT is O(N), ≈ 30–60 ms at 1024². At 2048², run it in a Worker (≈ 0.5–1 s).

Pitfalls
- **Bake after the final `H()`**, from the same function the terrain mesh uses,
  or the shoreline in the texture and the geometric intersection disagree.
- **Clamp the SDF range to what the shader uses** (±16 m is plenty); more range
  costs precision.
- **Bilinear SDF near thin features** (a 1 m channel at 0.5 m/texel) rounds
  corners. That is acceptable; or bake 2048² locally around the river's bounding
  box instead of the whole tile.

### 2.7 Water meshes

**Per-channel ribbon.** Columns span from the inner wet edge minus a margin to
the outer wet edge plus a margin. Outer columns dive below the terrain, as the
current code already does, so the *terrain* defines the visible shoreline. The
surface is flat across and follows `zw(s)` along.

```js
function buildRibbon(ch, COLS=12, margin=1.2){
  const pos=[],uv=[],tau=[],idx=[];
  for(let i=0;i<ch.px.length;i++){
    const hw=ch.W[i]/2, nx=-ch.tz[i], nz=ch.tx[i];          // left normal
    const R=1/Math.max(1e-4,Math.abs(ch.kappa[i]));         // radius of curvature
    const inner=Math.sign(ch.kappa[i]);                     // +1: inner side is +n
    for(let c=0;c<=COLS;c++){
      let n=(c/COLS*2-1)*(hw+margin);
      if(Math.sign(n)===inner) n=Math.sign(n)*Math.min(Math.abs(n),0.85*R); // never cross the centre of curvature
      const x=ch.px[i]+nx*n, z=ch.pz[i]+nz*n, y=ch.zw[i];
      const yy=Math.abs(n)>hw?Math.min(y,H(x,z)-0.15):y;         // outer columns sink under the bank
      pos.push(x,yy,z);
      uv.push(n, ch.s[i]); tau.push(ch.tau[i]);
    }
    if(i)for(let c=0;c<COLS;c++){const a=(i-1)*(COLS+1)+c,b=i*(COLS+1)+c;idx.push(a,b,a+1,a+1,b,b+1);}
  }
  // + setVerticesData('aTau', tau, false, 1)
}
```

**Ponds**: triangulate the polygon (Babylon `PolygonMeshBuilder` needs earcut, or
use a 1 m grid clipped to the wet mask) at the flat pond level. Make it slightly
larger than the polygon so the terrain cuts the shore.

**Pond shape** for millponds and fishponds (typical of South Moravia): a
smoothed polygon SDF plus noise for the shore, a straight **dam** (hráz) on the
downstream side, deepest at the dam outlet, shallow and reedy at the inflow end.

```js
// pond bed: depth grows with distance from shore and toward the dam
const pondDepth=(sdIn,dDam)=>Math.min(p.maxDepth, sdIn*0.12)*(0.55+0.45*sm(1-dDam/p.length));
```

Pitfalls
- **Ribbon folding on the inside of bends** when half-width + margin > radius of
  curvature. The clamp above (0.85 R) prevents inverted triangles.
- **Junction overlap.** A tributary ribbon ends inside the parent; both are
  opaque at nearly the same height, so they z-fight. Sink the tributary's last
  1–2 rows 3–5 cm below the parent surface so the parent always wins. The colour
  is identical anyway because depth and bed come from the shared world-space
  texture; only the strokes differ, and that seam sits in the confluence foam.
- **Stream into pond**: the channel's last `zw` must equal the pond level, and
  the outlet's first `zw` must be ≤ level minus the weir drop. Put a weir foam
  line at the outlet.
- **Alternative for complex braids**: one water mesh for the whole tile, a 1 m
  grid restricted to wet cells, with y from a baked water-surface height and flow
  from the flow map only (no ribbon UVs). It's simpler topologically, but
  strokes must then come from the two-phase flow map (§4.3).

### 2.8 Water shader, layer by layer

Inputs: world position, ribbon UV `(n, s)`, `aTau`, the water-data texture, and
the existing helpers (`G()` grain, `paint()`, `LM()`, `cloud()`, `atmos()`,
`mist()`, `depthA()`). The material is **opaque**.

```glsl
uniform sampler2D uWater, uWater2;                      // §2.6
uniform vec3 uDeep, uMid, uShal, uSkyTint;              // painted palette, not physical
varying vec2 vUv; varying float vTau;
vec4 WD(vec2 xz){return texture2D(uWater,(xz+260.0)/520.0);}

void main(){
  vec4 wd=WD(vW.xz);
  float depth=wd.r*4.0, sdf=(wd.g-0.5)*32.0;
  vec2 flow=wd.ba*2.0-1.0; float speed=length(flow);
  vec4 w2=texture2D(uWater2,(vW.xz+260.0)/520.0);       // obstacle foam, riffle, reeds, bed type
  vec3 V=normalize(uCamPos-vW);
  vec4 lm=LM(vW); float sh=(1.0-lm.r)*uShadowsOn, cs=max(cloud(vW)*0.6,sh);

  // 1. BED seen through the water ("painted refraction"): offset along the view, apparent depth ~3/4
  vec2 off=-V.xz/max(V.y,0.35)*depth*0.75;
  vec3 bp=vec3(vW.x+off.x, vW.y-depth, vW.z+off.y);
  vec3 bed=paint(groundAlbedo(bp,depth,w2.a),vec3(0,1,0),bp,1.0,0.12,1.0,(1.0-LM(bp).r)*uShadowsOn);

  // 2. ABSORPTION as a painted 3-band ramp. Red is lost first, so the hue shifts toward teal with depth
  float g=G(vW.xz/5.0).g-0.5;
  float dn=depth*(1.0+0.35*g*uGrainAmt);                        // grain breaks the band edges
  vec3 T=exp(-vec3(1.10,0.45,0.30)*dn);                         // per-metre "absorption" (art values)
  float band=floor(clamp(1.0-T.g,0.0,0.999)*3.0+0.5*(G(vW.xz/2.0).r))/3.0;
  vec3 wc=band<0.34?uShal:band<0.67?uMid:uDeep;                 // painted ramp picks the scatter colour
  vec3 c=bed*T+wc*(1.0-T);                                      // bed shows through; at depth 0, c == bed

  // 3. CALM vs ROUGH: riffles break reflections, pools hold them
  float rough=max(w2.g, smoothstep(0.55,0.9,speed)*smoothstep(0.8,0.25,depth));

  // 4. SKY TINT (painted, no sky) + bank/tree reflections in calm water (existing reflAt trick)
  c=mix(c,uSkyTint,0.30*smoothstep(0.2,1.0,depth)*(1.0-0.6*rough));
  // ... existing canopy-reflection block, weighted by (1.0-rough)

  // 5. FLOW STROKES: long horizontal marks along the current; tau stretches them in fast water
  float along=vTau*uStrokeV-uTime*uStrokeV;                     // pattern(tau - t): continuous, no shear
  float st=G(vec2(along*0.05, vUv.x*0.18)).b;
  float st2=G(vec2(along*0.11+0.37, vUv.x*0.35+0.2)).g;
  float marks=smoothstep(0.64,0.80,st*0.6+st2*0.4)*smoothstep(0.15,0.6,depth);
  c=mix(c, c*1.12+vec3(0.03,0.05,0.05), marks*(0.35+0.4*rough));        // light marks
  c=mix(c, c*0.82, smoothstep(0.70,0.85,st2)*0.25*(1.0-rough));          // a few dark marks in pools

  // 6. SHADOWS cool the water; deep water takes them more than the shallows (bed already shadowed)
  c=mix(c,c*vec3(0.58,0.70,0.88),cs*smoothstep(0.1,0.8,depth));

  // 7. GLITTER: painted sun dabs, mostly on riffles, a few in pools
  vec3 R=reflect(-V,vec3(0,1,0)); float spec=pow(max(dot(R,uSunDir),0.0),5.0);
  float dab=step(mix(0.86,0.70,rough),G(vec2(along*0.45,vUv.x*0.9)).r)*step(0.5,G(vW.xz/2.3+uTime*0.015).g);
  c+=uSunCol*vec3(1.0,0.86,0.58)*dab*(0.2+spec*1.6)*(1.0-cs)*smoothstep(0.15,0.5,depth);

  // 8. FOAM: hard-edged, broken. Shore line from the SDF, riffles, obstacles (baked pillows + wakes)
  float gr=G(vW.xz/1.4).r;
  float shore=smoothstep(0.30,0.12,abs(sdf-0.25-(G(vec2(along*0.5,vUv.x)).g-0.5)*0.2))*step(0.45,gr);
  float riff=w2.g*step(0.62,G(vec2(along*0.30,vUv.x*0.6)).r);
  float obst=step(0.5,w2.r+(gr-0.5)*0.5);
  float foam=max(max(shore,riff*0.9),obst);
  c=mix(c,vec3(0.93,0.92,0.84)*mix(1.0,0.78,cs),foam*0.85);

  // 9. ICE (season) — §4.10
  // 10. paper grain, atmosphere, mist; alpha keeps the view-depth contract
  c*=1.0+(G(vW.xz/4.0).r-0.5)*uGrainAmt*0.14;
  gl_FragColor=vec4(atmos(mist(c,vW,lm,0.0),vW),depthA(vW));
}
```

Notes on the sketch
- Layer 2 is written so that **at depth 0 (T = 1) the output equals `bed`**, which
  equals what the terrain draws at the same point. That is the soft intersection.
  There is no alpha, so nothing needs sorting.
- `groundAlbedo()` must be **one shared GLSL function** used by both the terrain
  and the water shader, switching to bed materials (mud, sand, gravel, weed) below
  the water line and to wet bank colours just above it.
- Texture fetches: water data 2 + grain about 8 + bed albedo about 8 + light map
  2 + canopy reflection 2 ≈ 22 per water pixel. Water covers about 3–10% of the
  screen, so ≈ 0.1–0.3 ms at 1080p on M1 **[E]**.

### 2.9 Terrain shader additions (banks)

```glsl
vec4 wd=texture2D(uWater,(wp.xz+260.0)/520.0); float sdf=(wd.g-0.5)*32.0; // − on land
float land=-sdf;                                                        // metres from the water
float gr=(G(wp.xz/3.0).r-0.5);
// wet band: darker, cooler, a touch more saturated. Wider on gentle banks (point bars), thin on cut banks
float wetW=mix(0.4,1.6,smoothstep(0.75,0.98,n.y));
c=mix(c*vec3(0.62,0.68,0.66), c, smoothstep(0.0,wetW,land+gr*0.5));
// exposed earth on steep banks near water (cut bank scarps)
c=mix(c, vec3(0.50,0.38,0.24)*(0.9+0.2*G(wp.xz/2.0).b), smoothstep(0.80,0.55,n.y)*smoothstep(4.0,0.5,land));
// gravel/sand on low ground just above water (point bars): pale warm dabs
float bar=smoothstep(0.6,0.1,wp.y-uWaterLevelAt(wp))*smoothstep(3.0,0.3,land)*smoothstep(0.9,0.97,n.y);
c=mix(c, vec3(0.74,0.68,0.56)*(0.85+0.3*G(wp.xz/0.9).r), bar*0.85);
```

`uWaterLevelAt` can be a fourth channel in the second texture (local water
surface height relative to the terrain, clamped to 0..2 m above).

---

## 3. Shape techniques in detail

### 3.1 Hydraulic erosion (droplet and pipe models)

What it is: particles (droplets) or a shallow-water grid move water downhill,
pick up sediment where fast and deposit where slow. Sebastian Lague's
open-source Unity implementation (based on Hans Beyer's thesis) is the
most-copied reference **[V-doc]**.

Use here: low. Erosion makes convincing *mountain* drainage and debris fans.
Lowland meandering streams come from lateral bank migration, which grid
erosion at this resolution doesn't model.

Pitfalls: not art-directable; results change globally when you edit one hill;
slow in JS at 1M cells; fills the map with gullies that compete with
formations for readability (`design.md` pillar 1).

### 3.2 Graph / flow accumulation (drainage networks)

- **Génevaux et al. 2013** build the terrain *from* a hierarchical river graph:
  rivers first, then the terrain is assembled around them from procedural
  primitives in a construction tree **[V-doc]**. This is the right *order* for a
  game map: decide the drainage, then the land.
- **Red Blob Games (mapgen2/mapgen4)**: each node drains to its lowest neighbour,
  so rivers join but never split, and flow accumulation sets the width. A later
  experiment grows river trees with noisy Dijkstra/BFS and uses the Strahler
  number for thickness **[V-doc]**.
- **On a real DEM**: fill depressions with Priority-Flood (Barnes et al. 2014;
  about 20 lines of pseudocode, O(n log n) on float data) **[V-doc]**, then D8
  directions and accumulation. Use the result to locate tributaries, wet
  hollows and spring lines, then replace the stair-stepped D8 line with a
  smoothed, meandered spline.

Pitfalls: D8 lines are 45°-quantised and dead straight on flat floodplains,
exactly where real streams meander most. Never render the D8 line itself.
Floodplains in the DEM are often too flat for flow routing (ties); Priority-Flood
with an epsilon gradient resolves that.

### 3.3 Meander curves (sine-generated, Kinoshita)

Covered in §2.2. Empirical ratios to drive it **[V-doc]**:
- meander wavelength ≈ 10–14 channel widths (mean about 11);
- radius of curvature ≈ 2–3 widths (about 2.3 is typical);
- pool/riffle spacing ≈ 5–7 widths (one riffle per half wavelength).

Pitfalls: a pure sine-generated curve with fixed parameters is still a scarf,
just a curlier one. Jitter per bend, add skew (J_s > 0 bends lean downstream),
and vary width independently of curvature.

### 3.4 Curvature-driven migration, cutoffs and oxbows

Howard & Knutson (1984) migrate each centre-line node sideways at a rate set by a
weighted sum of upstream curvature. `meanderpy` (Apache 2.0) implements it with
neck cutoffs that leave oxbow lakes, and can produce point-bar scroll topography
**[V-doc]**.

Use: offline (or at map load in a Worker) for maps that want a mature
floodplain. Run a few hundred steps from a gently perturbed line; keep the final
channel plus the cut-off loops. Render those as oxbows: still water, shallower,
greener-browner, partly reed-filled. Faint curved meander scars in the
floodplain grass (from older centre lines) look striking from above **[E]**.

Pitfalls: needs resampling every step (nodes bunch up); cutoff detection is the
fiddly part (test non-adjacent nodes closer than ~1 W); and the result is not
directly authorable. Treat it as a generator whose output the designer then
edits as splines.

### 3.5 Width, depth, bars, braids, tributaries, ponds

- **Width** ∝ Q^0.5 and steps up at junctions; jitter ±8% with noise over 3 W
  (§2.3).
- **Point bars** on the inside of every bend, peaking slightly downstream of the
  apex (lag the curvature by ~0.5 W). They are the main tool for varying the
  *visible* water width.
- **Mid-channel gravel bars and islands**: where W/D is large (wide, shallow
  reaches), add Gaussian bumps to the bed so they emerge 0.1–0.4 m above the
  water. Islands are areas between two channels of a split; represent a braid as
  two channel splines sharing start and end junctions, with Q split 60/40.
- **Tributaries** join at 40–70° pointing downstream, with a small scour pool at
  the junction and a bar on the downstream corner **[E, field observation]**.
- **Ponds**: flat polygons with dams (§2.7). Reed belts at the shallow inflow
  end, open water at the dam.
- **Mills** (very common in 1805 Moravia/Bohemia, a good landmark): weir across
  the stream (white foam line), a straight mill race (leat) branching off to the
  mill and rejoining below. That is a perfectly straight artificial channel, a
  nice contrast to the natural meanders.

### 3.6 Importing real (historical) rivers

| Source | What you get | Resolution / caveats |
|---|---|---|
| **OpenStreetMap** via Overpass | `waterway=river/stream/canal/ditch` centre lines (direction = flow), `natural=water` + `water=river/pond/oxbow` areas, `width=*` | Best detail. Rivers wider than ~5 m should also have area polygons **[V-doc]**. ODbL: attribution required. Shows *today's* water. |
| **Copernicus EU-Hydro** | Photo-interpreted river network + water bodies, plus a DEM-derived drainage network with catchments | 1 ha minimum mapping unit; per-basin GPKG **[V-doc]** |
| **Natural Earth** rivers/lake centre lines | Major rivers only, with tapering width attributes | 1:10 million: useful only for a strategic map **[V-doc]** |
| **AWS Terrarium tiles** (already used) | Elevation = (R·256 + G + B/256) − 32768 **[V-doc]** | EU-DEM/SRTM source at ~30 m **[V-doc]**; z15 ≈ 4.8 m/px at the equator, ≈ 3.1 m/px at 49° N, *oversampled*. Streams are not in it. |
| **Mapire: Habsburg First (1764–1785) and Second (1806–1869) Military Surveys** | The landscape as it was around 1805: ponds, mills, marshes, unregulated channels | First survey has no proper projection; georeferencing errors of hundreds of metres are common **[V-doc]**. Trace by hand against landmarks (churches, road junctions). |

Pipeline:
1. Overpass query on the battle bbox:
   ```
   [out:json];(way["waterway"~"river|stream|canal|ditch"](bbox);
               way["natural"="water"](bbox);relation["natural"="water"](bbox);
               way["natural"="wetland"](bbox););out geom;
   ```
2. Project to local metres: `x = R·(lon−lon0)·cos(lat0)`, `z = R·(lat−lat0)`
   (equirectangular is fine for a few km). Do the same for Terrarium pixel
   centres. Web Mercator tiles are *not* square metres: scale by cos(lat).
3. Resample lines to W/4, smooth, then decide per reach: keep (natural) or
   re-meander (if the line is suspiciously straight over > 15 W, it was probably
   regulated; replace it with a Kinoshita reach between the same endpoints,
   inside the valley floor).
4. Width: `width=*` if tagged, else measure the OSM water polygon across the
   centre line, else defaults (stream 2–5 m, small river 8–20 m) **[E]**.
5. Water surface: sample the DEM along the line, running minimum downstream
   (§2.3). The DEM is a smoothed surface model, so subtract a bank height.
6. Carve with §2.4 on top of the DEM-derived `baseH`.
7. Add historical features traced from Mapire (drained ponds, mill races).

Pitfalls
- **Anachronism.** Satschan/Žatčany and Menitz ponds at Austerlitz were later
  drained (the Žatčany pond embankment survives) **[V-doc]**. Rivers like the
  Berezina have shifted over 200 years. OSM is only a starting point.
- **DEM artefacts.** SRTM/EU-DEM are surface-like near forests and villages, and
  water bodies are flattened. Expect bumps on floodplains; smooth `baseH` inside
  the floodplain belt.
- **Direction.** OSM waterway ways point downstream by convention, but check
  against DEM elevations and flip if they rise.

---

## 4. Rendering techniques in detail

### 4.1 Depth from a baked world-space texture vs. screen depth

Shipped engines usually read the scene depth buffer behind the water ("depth
fade", soft particles, Lorach/NVIDIA 2007) **[V-doc]**. Here the baked texture is
better:
- Static terrain plus a top-down camera means depth is a property of the *map*,
  not of the view.
- It needs no depth pre-pass. In Babylon, `scene.enableDepthRenderer()` renders
  the scene again into a depth target; custom `ShaderMaterial`s need
  `setMaterialForRendering` to match vertex animation **[V-src d.ts]**.
- It is stable: no shimmer at grazing angles, no dependency on what is drawn
  behind (units, trees).

Pitfall: dynamic things in water (units wading, pontoon bridges at the
Berezina, ice slabs) won't affect the baked depth. Give them their own foam
decals (instanced quads with a foam ring) instead.

### 4.2 Depth colour ramp

Use a painted 3-band ramp, not physical absorption: shallow warm green-ochre
(bed showing), turquoise middle, deep teal leaning blue-violet. Break the band
edges with the paint grain (same mechanism as the light bands in `paint()`).
Pick the colours from the palette, not from physics; `design.md` asks for
"chosen colours rather than computed ones".

Pitfalls: if the deepest colour is too dark, pools read as holes. Keep deep
water's value above the darkest tree shadows. The ramp also needs a cloud-shadow
variant: shadowed deep water goes blue-violet, not black.

### 4.3 Flow: ribbon UVs, time of travel, flow maps

- **Ribbon UVs** (n across, s along) are free and ideal for "long smooth
  horizontals" (`design.md` §7 water fill).
- **Time of travel**: with varying speed, `pattern(s·k − t·v(s))` shears and
  compresses over time. `pattern(τ − t)` with τ = ∫ds/v stays continuous, and
  features are automatically longer where water is faster **[E, derivation]**.
- **Two-phase flow maps** (Vlachos, Portal 2 / Left 4 Dead 2, SIGGRAPH 2010):
  distort UVs by `flow × phase` for two phases half a cycle apart and
  cross-fade, which hides the reset **[V-doc]**. Catlike Coding's "Directional
  Flow" aligns a stroke texture with the flow direction per cell **[V-doc]**. Use
  these for ponds (slow drift from inlet to outlet), eddies behind rocks and
  confluences.
- Godot "Waterways" builds flow maps from a distance field of the bank
  collision mask, so flow turns along the banks **[V-doc]**. The same idea works
  for the baked flow channel.

Pitfalls: `tau·k − uTime·k` grows without bound, and grain lookups lose float
precision after a long session. Wrap time with `mod(uTime, P)` where P is a
whole number of texture periods. Two-phase flow pulses visibly if the cycle is short; use 2–4 s cycles
and offset the phase by a noise texture. Flow-map strokes look "smeared" in
stagnant spots; fade strokes out where speed < 0.1.

### 4.4 Foam and whitewater

Two families, per the taxonomy by Bopp et al. (GamesLab Hamburg) analysing
Wind Waker, RiME, Sea of Thieves and others **[V-doc]**:
- **Foam lines** around shores and obstacles: here from the SDF and baked
  obstacle masks.
- **Foam patterns** on open water: here, riffle chevrons and stroke-like
  streaks.

Painterly rules: hard edges, threshold the grain (never alpha-gradient),
2–3 widths of line, white that's a little warm in sun and cool in shadow.

Rocks: bake a **pillow** (thin arc upstream) and a **wake** (V or two streaks
downstream, length about 4–8 rock radii, widening downstream) in the flow frame
of the nearest channel. Weirs: a full-width line with streaks below. Fords
(riffles): broken chevrons pointing upstream.

Pitfalls: foam everywhere kills readability and makes water read as rapids.
Keep the shoreline foam broken (about 50% coverage) and reserve dense foam for
riffles, weirs and rocks.

### 4.5 Caustics

At 45–260 m distance, caustics on the bed are sub-pixel. Skip them in gameplay.
For photo mode at the closest zoom, a single cheap pattern (sum of two scrolled
Voronoi-edge textures, multiplied onto the bed in shallow sunny water) is enough
**[E]**.

### 4.6 Reflections without a sky

- At 40–55° pitch, the mirrored view ray leaves the water at 40–55° elevation.
  It mostly sees sky and tree crowns near the bank. The prototype's baked canopy
  mask traced to crown height (`reflAt`) is the right cheap model; keep it.
- Real-time options and why not:
  - **`MirrorTexture`**: extends `RenderTargetTexture` with one `mirrorPlane`; it
    re-renders its render list every refresh **[V-src]**. One plane per texture,
    so a sloped stream breaks it. Cost ≈ another scene pass at reduced
    resolution, ~+25–50% frame time **[E]**.
  - **`WaterMaterial`** (materials library) creates *two* render targets,
    reflection and refraction (512² by default), re-renders the render list into
    both every frame, and sets clip planes at the mesh's `absolutePosition.y`
    **[V-src]**. It assumes one flat water height and uses Babylon's lighting
    rather than our `paint()`. Not suitable.
  - **SSR**: only reflects what's on screen, which from top-down is mostly the
    ground, and is wrong for the exact things we want (tree crowns above the
    frame). Not worth a pass.
- Painterly treatment: in calm pools, show a crisp darker band of reflected bank
  and trees on the far side of the water from the camera's point of view. On
  riffles, break it into horizontal dashes. Rim the reflection edge with a few
  bright glints.

### 4.7 Waves: Gerstner or not

Streams and ponds shouldn't get Gerstner waves: there are no wind waves worth
displacing at this scale, and the vertex motion would fight the terrain
intersection. Use a slight *normal* perturbation only for glitter. A big lake on
a windy day (rare here) could use 2–3 Gerstner waves in the *normal* only
**[E]**.

### 4.8 Banks and wetness

Wet porous ground darkens (Lagarde's survey: the darkening factor depends on
porosity, and low albedos darken relatively more) and becomes glossier
**[V-doc]**. Painterly version: a darker, cooler, slightly more saturated band
whose width depends on slope (§2.9), plus occasional glints on the wet band in
low sun. Add reeds (scatter instances) on slow inner bends, pond inflows and
oxbows; willows and alders along the banks (classic Central European riparian
galleries), placed by SDF distance 1–6 m and gaps for fords.

### 4.9 Edge softening and z-fighting

- Soft shore = colour convergence (§2.8), not transparency.
- Z-fighting where water and gentle point bars are nearly coplanar is invisible
  because both draw the same colour there. Elsewhere, the depth precision at
  260 m with `minZ = 0.5` on a 24-bit buffer is ≈ z²/(near·2²⁴) ≈ 8 mm **[E]**,
  enough. Raising `minZ` to 2 m improves it 4×.
- The geometric shoreline is polygonal at the terrain grid. Hide it by drawing
  the visible edge from the SDF texture: a foam or meniscus line and the terrain
  wet band. The eye follows the painted line, not the triangle edge.

### 4.10 Ice and frozen ponds (Satschan, winter presets)

- Opaque ice: pale cool blue-grey (cooler and smoother than snow, so it reads as
  ice and not as a field); clearer, darker ice where depth is greater (black ice
  in the middle, grey-white at the margins).
- Wind-aligned snow drifts on the ice (stretched noise along the wind
  direction), denser near the shore.
- Cracks: thin dark lines from Voronoi cell edges at two scales, the larger set
  radiating from the shore and dam.
- A pressure/shore crack: a dark line a metre or two inside the shoreline.
- Breaking ice (scripted or artillery hits): a dark open-water decal with
  instanced flat ice slabs that tilt and sink. That is a strong top-down read.
- Frozen streams: freeze pools first and leave riffles and weirs open (dark water
  with steam/frost edges), as happens in real cold snaps **[E, observation]**.

### 4.11 Making water read at small screen size

- The camera has vertical FOV 0.62 rad. At 260 m distance the view height at the
  target is 2·260·tan(0.31) ≈ 167 m across ~1080 px ≈ 6.5 px/m, so a 6 m stream
  is ~40 px wide at the target and narrower toward the top of the screen. At 45 m
  it's ~28 px/m **[E]**. The stream is never sub-pixel, but small features
  (bars, foam, rocks) are. Size foam lines ≥ 2 px at max zoom-out.
- Readability recipe: **(1)** water is the coolest, least textured large area
  on screen; **(2)** graphic edge: dark wet band outside, light meniscus/foam
  inside; **(3)** value structure: dark pools, bright riffles. That gives rhythm,
  and riffles mark fords; **(4)** water is less saturated than army colours
  (`design.md` pillar 1).
- Grade check: the finishing pass's teal-shadow split tone pushes water toward
  the shadows' hue. Test water in shadow vs. in light so it doesn't vanish into
  shadowed grass.

---

## 5. Shipped references: what they show, what translates

| Game / film | What is documented or visible | Translate? |
|---|---|---|
| **Wind Waker** | Flat-shaded water, no reflection calculation, graphic foam patterns **[V-doc]** | Yes: graphic foam, opaque water, chosen colours |
| **Breath of the Wild / TotK** | Art direction inspired by gouache and plein-air painting, "reconciliation between playability and reality" (Takizawa, GDC 2017) **[V-doc]**. Water: clear shallows over visible beds, strong depth ramp, simple sky tint **[O]** | Yes: bed-through-water and depth ramp |
| **RiME** | Fresnel imitation with simple cubemap reflections **[V-doc]** | Partly: painted constant tint instead of a cubemap (no sky) |
| **Sea of Thieves** | FFT ocean with stylisation layers on top (SIGGRAPH 2018 Rare talk) **[V-doc]** | No for the waves; yes for the "stylise a simulation" idea |
| **Horizon Zero Dawn** | Houdini river tool in Maya: spline snapped to terrain, never flows uphill, width ramp × scale × slope, banks slid down the terrain, cascades/reservoirs **[V-doc]** | Yes: the model for §2.1–2.4 |
| **Far Cry 5** | Houdini "freshwater network" tools in the Ubisoft editor, ecosystem-linked (water → erosion → vegetation) **[V-doc]**; detail is in the talk video only | Yes in spirit: river data drives scatter |
| **Unreal Water plugin** | Per-spline-point `RiverWidth`, `Depth`, `WaterVelocityScalar` as interpolated curves **[V-doc]** | Yes: our data model |
| **Portal 2 / L4D2** | Artist-painted flow maps, two-phase flow **[V-doc]** | Yes, for ponds and eddies |
| **Crest (Unity ocean)** | Top-down ortho depth cache of the seabed for shoreline foam and shallow shading **[V-doc]** | Yes: our water-data bake |
| **Puss in Boots: The Last Wish** | Painterly irregular edges, textured and hand-drawn 2D/3D FX elements, looser detail at frame edges (Before & Afters / AWN interviews) **[V-doc]**. No water-specific breakdown found **[U]** | Yes: hard-edged textured foam, edge breakup on the shoreline |
| **Tiny Glade, Townscaper, Bad North, Dorfromantik, Sable, A Short Hike, Genshin** | No public water-shader breakdowns found **[U]**. Common visible traits: opaque or near-opaque water, bright shoreline foam bands, strong depth/value ramp, few or no real reflections **[O]** | Confirms the direction; nothing specific to copy |
| **Manor Lords, Anno 1800, Total War** | No public water breakdowns found **[U]**. Readability observation: rivers read via a dark/teal value band and bright edges more than via surface detail **[O]** | The readability recipe in §4.11 |

---

## 6. Babylon.js 9 + WebGL2: what's realistic at 60 fps

| Feature | Verdict | Cost [E] unless noted |
|---|---|---|
| Custom opaque `ShaderMaterial` with 1–2 baked data textures | **Use** | ≈0.1–0.3 ms (water covers a small screen fraction) |
| `RawTexture.CreateRGBATexture` (RGBA8, bilinear) | **Use** | Exists in 9.29 **[V-src]** |
| Half-float data textures | OK on WebGL2 (`textureHalfFloatLinearFiltering` true) **[V-src]** | Needs float→half conversion in JS |
| Float32 data textures with linear filtering | Only with `OES_texture_float_linear` **[V-src]** | Avoid |
| `scene.enableDepthRenderer()` → depth map in a custom shader | Possible: `setMaterialForRendering` for custom vertex code, linear/non-linear options **[V-src d.ts]** | Extra full scene pass ≈ 20–40% of geometry cost. Not needed. |
| Alpha-blended water | Possible, but `ALPHA_COMBINE` writes `alpha = srcA + dstA` **[V-src]**, breaking the depth-in-alpha contract. Would need a custom blend state. | Avoid |
| `MirrorTexture` | One plane, re-renders its list **[V-src]** | +25–50% frame. Avoid. |
| `WaterMaterial` | 2 RTTs (reflection + refraction), flat height from mesh position, Babylon lighting **[V-src]** | +50–100% frame. Avoid. |
| Worker bake of 2048² SDF | Fine | 0.5–1 s once at load |
| WebGPU port | Same design; textures and shaders port directly (WGSL) | — |

Note the depth renderer's material override: instanced vegetation with wind in
custom vertex code would render *without* sway into the depth map unless
overridden. That's another reason to avoid screen depth here.

---

## 7. Pitfall checklist

1. Generating x as a function of z (current code): can't make real bends. Use
   arc-length parametrisation.
2. Fixed width/depth: the scarf. Width from Q^0.5, bends, bars, noise.
3. River ignores the terrain: it needs a valley and floodplain, with monotonic
   water level.
4. Horizontal distance `|x − f(z)|` instead of true distance to the curve:
   channel narrows on diagonals.
5. Terrain grid too coarse for banks: per-pixel normals from a bake, then a bank
   strip mesh.
6. Ribbon folding at inner bends: clamp offsets to 0.85 R.
7. Junction z-fighting: sink tributary ends under the parent.
8. Alpha blending breaks depth-in-alpha: stay opaque.
9. Shore seam: shared `groundAlbedo()` so water at depth 0 equals terrain.
10. Strokes shear with variable speed: time-of-travel coordinate.
11. Foam everywhere: reserve dense foam for riffles, weirs and rocks.
12. Deep water too dark: pools read as holes. Keep value above tree shadow.
13. Modern OSM ≠ 1805: check Mapire; ponds drained, rivers straightened.
14. DEM can't see streams: always carve.
15. Equal riffle spacing and identical bends read as artificial: jitter per bend.

---

## 8. Sources

Geomorphology and terrain
- Génevaux, Galin, Guérin, Peytavie, Beneš, *Terrain Generation Using Procedural Models Based on Hydrology*, ACM TOG 32(4), SIGGRAPH 2013: [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf), [HAL](https://hal.archives-ouvertes.fr/hal-01339224)
- Leopold & Maddock, *The hydraulic geometry of stream channels and some physiographic implications*, USGS PP 252 (1953): [USGS](https://pubs.usgs.gov/publication/pp252), [PDF](https://www.arlis.org/docs/vol1/AK_Heritage/USGS/ProfPaper/2/ProfPaper-252.pdf)
- Leopold & Wolman, *River channel patterns: braided, meandering and straight*, USGS PP 282-B: [USGS](https://pubs.usgs.gov/publication/pp282B); *River meanders* (1960): [USGS](https://pubs.usgs.gov/publication/70185557)
- Langbein & Leopold, *River meanders: theory of minimum variance*, USGS PP 422-H (1966): [PDF](https://pubs.usgs.gov/pp/0422h/report.pdf)
- Meander shape and design (sine-generated curve summary), USDA ARS: [PDF](https://www.ars.usda.gov/ARSUserFiles/6112/meanderShapeAndTheDesign.pdf)
- Kinoshita curve with skewness/flatness coefficients (formulation as used in LES morphodynamics): [arXiv 2207.11190](https://arxiv.org/pdf/2207.11190)
- Howard & Knutson 1984 (WRR 20:1659–1667) via CSDMS meander model docs: [PDF](https://csdms.colorado.edu/w/images/Documentation_for_Meander_Evolution_Model.pdf); `meanderpy`: [GitHub](https://github.com/zsylvester/meanderpy)
- Barnes, Lehman, Mulla, *Priority-Flood*, Computers & Geosciences 62 (2014): [arXiv](https://arxiv.org/pdf/1511.04463)
- Red Blob Games: [polygon map generation](https://www.redblobgames.com/maps/polygon-map-generation/), [mapgen4](https://www.redblobgames.com/maps/mapgen4/), [procedural river drainage basins](https://redblobgames.com/x/1723-procedural-river-growing)
- Sebastian Lague, hydraulic erosion: [itch.io demo](https://sebastian.itch.io/hydraulic-erosion)
- Inigo Quilez, 2D distance functions (segment, uneven capsule, Bézier): [iquilezles.org](https://iquilezles.org/articles/distfunctions2d)

Production tools
- Horizon Zero Dawn river tool (Houdini in Maya): [80.lv](https://80.lv/articles/horizon-zero-dawn-procedural-rivers-wires/); GPU procedural placement: [Guerrilla GDC 2017 PDF](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)
- Far Cry 5 procedural world generation (Étienne Carrier): [GDC Vault](https://gdcvault.com/play/1025557/Procedural-World-Generation-of-Far), [80.lv](https://80.lv/articles/houdini-procedural-world-generation-of-far-cry-5/)
- Unreal `UWaterSplineMetadata` (RiverWidth, Depth, WaterVelocityScalar): [Epic docs](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/Water/UWaterSplineMetadata)
- Godot Waterways (river mesh, flow and foam maps from bezier curves): [GitHub](https://github.com/Arnklit/WaterGenGodot)
- Crest, shorelines and shallows (depth cache): [docs](https://crest.readthedocs.io/en/stable/user/shallows-and-shorelines.html)

Water rendering
- Vlachos, *Water Flow in Portal 2*, SIGGRAPH 2010 Advances: [PDF](https://www.advances.realtimerendering.com/s2010/Vlachos-Waterflow(SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course).pdf)
- Catlike Coding, [Texture Distortion](https://catlikecoding.com/unity/tutorials/flow/texture-distortion/) and [Directional Flow](https://catlikecoding.com/unity/tutorials/flow/directional-flow/)
- Bopp, Geideck, zu Münster, stylised water taxonomy (Wind Waker, RiME, Sea of Thieves…): [80.lv](https://80.lv/articles/how-to-build-stylized-water-shader-design-implementation-for-nimue/)
- Rare, *The Technical Art of Sea of Thieves*, SIGGRAPH 2018: [PDF](https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf)
- Lorach, *Soft Particles*, NVIDIA 2007: [PDF](https://developer.download.nvidia.com/whitepapers/2007/SDK10/SoftParticles_hi.pdf)
- Lagarde, *Water drop 3b – physically based wet surfaces*: [blog](https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/)
- Breath of the Wild art direction (Takizawa, GDC 2017): [Thumbsticks](https://www.thumbsticks.com/gdc17-designing-zelda-breath-of-the-wild/), [Zelda Universe](https://zeldauniverse.net/2017/03/14/takizawa-explains-how-the-wind-waker-hd-inspired-the-visual-style-for-breath-of-the-wild/)
- Puss in Boots: The Last Wish look development: [Before & Afters](https://beforesandafters.com/2023/01/11/heres-how-dreamworks-lent-a-whole-new-brand-of-stylized-look-and-feel-to-puss-in-boots-the-last-wish), [AWN (Mark Edwards)](https://awn.com/animationworld/mark-edwards-talks-visual-development-puss-boots-last-wish)

Babylon.js (read in source)
- `WaterMaterial` (two RTTs, clip planes at mesh height): [waterMaterial.ts](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/materials/src/water/waterMaterial.ts)
- `MirrorTexture` (extends RenderTargetTexture, `mirrorPlane`, blur kernels): [mirrorTexture.pure.ts](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Materials/Textures/mirrorTexture.pure.ts)
- `DepthRenderer` API (storeNonLinearDepth, storeCameraSpaceZ, setMaterialForRendering): [depthRenderer.pure.d.ts @9.18](https://app.unpkg.com/@babylonjs/core@9.18.0/files/Rendering/depthRenderer.pure.d.ts)
- Blend modes (`ALPHA_COMBINE` = SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE) and float-filtering caps: `babylon.max.js` 9.29.0 from [jsDelivr](https://cdn.jsdelivr.net/npm/babylonjs@9.29.0/babylon.max.js)

Geodata
- OSM [Key:waterway](https://wiki.openstreetmap.org/wiki/Key:waterway); Overpass API: [wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)
- Copernicus [EU-Hydro River Network Database](https://land.copernicus.eu/en/products/eu-hydro/eu-hydro-river-network-database)
- Natural Earth rivers and lake centre lines 1:10m: [Stanford catalog](https://purl.stanford.edu/hv485tn5089)
- Terrarium format and data sources: [joerd formats](https://github.com/tilezen/joerd/blob/master/docs/formats.md), [joerd data sources](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md)
- Habsburg military surveys, Mapire georeferencing accuracy: [Hungaricana paper (Molnár)](https://library.hungaricana.hu/en/view/LeveltariKorpusz_Elektronikus_042_Molnar_DACH2014_127_132)
- Žatčany (Satschan) pond embankment and drained ponds: [Napoleonic Moravia itinerary](https://www.morava-napoleonska.cz/en/recommended-itineraries/napric-slavkovskym-bojistem/); 19th-century pond drainage in Bohemia/Moravia: [infoglobe.cz](https://en.infoglobe.cz/topics-of-interest/do-you-know-that-the-ponds-of-bohemia/)

Not verified / leads
- Exact water techniques of Tiny Glade, Townscaper, Bad North, Dorfromantik, Sable, A Short Hike, Genshin, Manor Lords, Anno 1800, Total War, Spider-Verse: no primary write-ups found **[U]**.
- Felzenszwalb & Huttenlocher, *Distance Transforms of Sampled Functions* (2012): the standard O(n) exact EDT; link not re-checked in this session **[U]**.
