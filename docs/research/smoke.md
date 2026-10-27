---
status: research
last_reviewed: 2026-10-27
---

# Powder smoke: painted, readable and cheap

Research notes, October 2026, for the art bible's musket and cannon smoke (`docs/art-bible.md` §9) and the track's
smoke stage (L6 in `docs/plans/active/track-e-look.md`, P4 in `docs/research/painterly-style-in-real-time.md`).
The owner's brief: smoke matters (artillery, musket and rifle fire); it should be "painterly 2D on 3D, like a
painting: simple, elegant yet beautiful", and above all cheap. The flat smoke of the staff map prototype (PR #49,
`epic/map-engine`) is the style reference, not the code to port.

**Tags.** **[V]** checked against the linked source by fetching it; **[S]** seen only in a search result or a page
quoted by another; **[O]** my reading of an image or a screenshot; **[E]** my estimate, nothing measured on our page.

## Summary

- **The reference is a silhouette, not a volume.** The staff map draws each cloud as four overlapping circles merged
  into one path and filled once in a warm white, with the same path shifted down-right in a dark brown at 22 % as its
  shadow (§1). It reads because it is one flat value with a crisp edge and a cast shadow, nothing else.
- **The films do the same thing at higher cost.** DreamWorks, Imageworks and Fortiche take the shape from a coarse
  simulation or a drawing, discard the soft detail, put back a hard graphic edge and brush texture, light it with two
  or three flat tones and step it in time (§3).
- **Games publish almost no numbers.** What they show: players keep musket smoke when they cut everything else;
  Grand Tactician spawns smoke on about a third of shots and feeds the clouds into sight; War of Rights' cost grows
  with the shooters and its lingering smoke had to be darkened so it would not glow; Ultimate General keeps small
  white puffs at the line with markers above (§2). The cost is overdraw (§4).
- **History supports banks, not puffs only:** a firing line makes a continuous low bank that hangs in still air and
  clears when the firing slackens; colour is white close up and grey to bluish grey from far off (§5). That a gun
  throws a forward jet that rolls into a cloud is our reading of photos and the masters, not a sourced fact.
- **Recommendation (§6):** **opaque, cut-out painted puffs**: instanced low-poly blobs (or flat discs facing the
  camera) shaded with the world's three-band ramp from the mood's sun, edged by a world-anchored brush mask with
  alpha-to-coverage, dissolving by eroding the mask, and casting the staff map's offset shadow as a ground decal.
  No blending, so no overdraw bill; one draw call; about 0.2–0.6 ms at a heavy fight on the M1 **[E]**. Readability
  by a hole the smoke opens around each formation's figures (a screen-space or per-battalion mask), and smoke kept
  lower in value contrast and saturation than the coats.

## 1. The reference: how the staff map draws smoke

Read from `prototypes/staff-map.html` on `origin/epic/map-engine` (lit style added in #136), and screenshotted
headless (`node tools/shot.mjs '…/staff-map.html?style=lit&simto=900&x=-700&z=450&R=1600'`). A cropped still is in
the owner's refs folder (below).

- **Spawning** (`puff()`): while a unit fires, each sim step spawns a puff with a probability of `dt × 0.5` per
  battalion (`0.25` for a battery). A line's puff lands at a random point along its front (90 % of its width), 8 m
  ahead (14 m for guns); a square spawns one on each of its four faces. Puffs live 4.2 s (6 s for a gun).
- **Budget**: at most 220 live puffs (`SMOKE_MAX`); when full, the one nearest the end of its fade is dropped, so new
  fire always shows. The code's own note: 500 puffs cost about 3.7 ms a frame on the 2D canvas in a big fight.
- **The shape** (`cloudUnit`): one `Path2D` of four circles, one of radius 0.8 at the centre and three of 0.62 set
  0.45 out at angles `rot + i·1.7`, squashed to 0.7 vertically. All four are filled **once** as one path, so the
  overlaps leave no seams and the cloud is one flat silhouette with a scalloped edge.
- **The two passes** (`clouds()`): every shadow first, then every cloud, so no shadow lands on a cloud. The shadow is
  the same path offset 1.5 px away from the map's north-west light (`raiseOf`), filled `#3a2e1c` at 22 % of the
  cloud's alpha; the cloud is filled `#fbfaf6` (paper white).
- **Life**: a volley's cloud grows from radius 2.6 to 7.6 px and rises 4 px while its alpha falls linearly to 0. A
  gun's shot is a 0.2 s yellow flash disc (`#ffc94a` with a `#fff3c4` core) at the muzzle, then three clouds strung
  out forward along the gun's facing, each larger and fainter than the last (alpha 0.95, 0.77, 0.59), drifting
  forward and growing over 6 s.
- **The world fallback** (as the camera zooms into the painted world): a cream circle and a smaller grey circle
  offset down-right, both fading with `(1 − k)²`. The plain ink style (not lit) draws a pencil spiral instead.

What carries over: **one value, one hard scalloped edge, one offset shadow**; clouds as a few merged circles; a gun
as a forward string of clouds plus a short flash; a fixed budget that drops the oldest; fire that always shows.
What does not: it is screen-space 2D at a fixed pixel size, has no light beyond the shadow offset, fades by alpha,
and its cost grows with every canvas fill (the 3.7 ms for 500 is CPU canvas work).

**[O]** The concept masters agree: in `design/refs/north-star-painted-v1.png` and `austerlitz-pratzen-v2.png` the
musket smoke is a few soft-edged cream puffs at the muzzles and a thin bank drifting back over and behind the line,
warm-lit on top and grey-violet underneath, never covering the men; in `wagram-grand-battery-v1.png` the guns throw
big sculpted cumulus banks, lit gold on the sun side, with orange flashes at the muzzles, rolling *forward and away*
from the battery, so the gun line itself stays legible.

## 2. How games do black-powder smoke

No developer talk, blog or modding doc found gives particle counts, texture sizes or overdraw budgets for powder
smoke in these games. What can be checked comes from patch notes, dev diaries, one shared config and mod pages.
Steam posts are cited by their announcement id (read through Steam's news API).

- **Grand Tactician: The Civil War.** A player-posted settings list includes "the multiplicator for line of sight
  reduction, taking into account smoke and dust with remaining alpha and size" (default 0.8) and "the probability of
  showing musket fire smoke and flash" (default 0.33): smoke clouds are tracked with alpha and size and feed
  spotting, and only about a third of shots spawn their smoke **[V]**
  ([Steam discussion](https://steamcommunity.com/app/654890/discussions/0/3814034217019125088)). Its dev blogs list
  "Is he blinded by smoke?" among hit modifiers and say thick smoke can slow an order's delivery **[V]**
  ([DevBlog #3](https://store.steampowered.com/news/app/654890/view/1800357164447124),
  [DevBlog #5](https://store.steampowered.com/news/app/654890/view/1811772772567124)).
- **War of Rights** (CryEngine, up to 400 players), all from its patch notes **[V]**: a separate "Smoke" graphics
  setting ([Update 83](https://store.steampowered.com/news/app/424030/view/2140760316590888161)); smoke optimised for
  "100 or more players", "greatly improving the FPS"
  ([Update 94](https://store.steampowered.com/news/app/424030/view/2363696743796516462)): the cost scales with
  shooters; two stages, the initial shot smoke and a "lingering smoke particle effect"
  ([Update 97](https://store.steampowered.com/news/app/424030/view/2361446846766711008),
  [Update 191](https://store.steampowered.com/news/app/424030/view/5124584051970274431)); particles spawned faster so
  a tight volley's smoke is not delayed
  ([Update 166](https://store.steampowered.com/news/app/424030/view/3516698970146947908)); a wind system "pushing gun
  smoke off the battlefield more quickly"
  ([Field Report 40](https://store.steampowered.com/news/app/424030/view/3594328263090054664)). Its recurring
  problem is light: lingering clouds "too bright and visible (they look like floating ghosts)", fixed by darkening
  the long-lasting smoke ([test notes](https://store.steampowered.com/news/app/424030/view/4093189347050344411),
  [Update 163](https://store.steampowered.com/news/app/424030/view/2426802221733459862),
  [Update 113](https://store.steampowered.com/news/app/424030/view/2499943313634549046)).
- **Holdfast: Nations at War.** Aim assist works "unless obstructed by smoke"; the pan's puff is its own effect
  **[V]** ([patch](https://store.steampowered.com/news/app/589290/view/5747236506606547761),
  [Changelog 6](https://store.steampowered.com/news/app/589290/view/2145261379795369728)).
- **Napoleon: Total War.** A popular mod "removes some particle effects (dust, cloud, smoke) while still keeping the
  smoke coming from the musket fire" for frame rate **[V]**
  ([GameWatcher, DarthMod Napoleon](https://www.gamewatcher.com/mods/napoleon-total-war-mod/darthmod-napoleon-v2-65));
  a player keeps "decent looking terrain and smoke" while letting units drop to sprites **[V]**
  ([Steam discussion](https://steamcommunity.com/app/34030/discussions/0/1474221865201138298)). Players pay for musket
  smoke before anything else. No Creative Assembly source on smoke and sight or readability was found.
- **Ultimate General: Civil War.** A reviewer: "a wall of smoke that follows the muskets", "while also making it
  really easy to see the combatants" **[V]**
  ([review](https://cdromfossil.com/2021/08/30/reviewing-ultimate-general-civil-war/)). **[O]** Its store
  screenshots show small, nearly opaque white puffs at the firing line and the brigades' markers floating above:
  the closest shipped precedent for our camera.
- **Sea of Thieves** trimmed smoke so that hits "show water splashes clearly without being obscured by smoke
  effects" **[V]** ([3.8.2](https://store.steampowered.com/news/app/1172620/view/1841579228665179)): gameplay
  feedback wins over smoke.
- Cossacks 3, Company of Heroes: nothing checkable found.

What the games teach: smoke is worth its frame cost to players (they keep it last); spawn it on a fraction of shots;
cost scales with shooters, so cap it; two stages (shot, lingering); lingering smoke must be darker than fresh smoke or
it glows; wind clears it; gameplay feedback must show through it. No game documented how it keeps formations
readable under smoke; Ultimate General's answer is simply small puffs and markers above.

## 3. Stylised films: the techniques

The common recipe: the shape and the timing come from a coarse simulation or a drawing; the soft, high-frequency
volume detail is thrown away; a hard graphic edge, brush texture and two or three flat tones are put back; the
timing is stepped.

- ***Puss in Boots: The Last Wish*** (DreamWorks). Dust and explosions were rendered twice, as volumes and as surfaces
  ("scalloping"), so they "always had these passes where we could get more of a 2D graphic hard edge, and we would
  layer that in"; volumes "smooth step through" unless noise is added; the Stamp Map scatters brush-stroke images over
  a point cloud on any object as a separate pass; much was "augmented just with hand drawn effects"; action stepped
  on 2s or 4s **[V]** ([befores & afters](https://beforesandafters.com/2023/01/11/heres-how-dreamworks-lent-a-whole-new-brand-of-stylized-look-and-feel-to-puss-in-boots-the-last-wish)).
  "Volumetric passes that are turned into meshes", and "volumetrics had brushstrokes in them" **[V]**
  ([VFX Voice](https://vfxvoice.com/wishing-upon-a-star-for-puss-in-boots-the-last-wish/)).
- ***The Wild Robot*** (DreamWorks, 2024). Fire simulated at low resolution, turned into geometry, thresholded, then
  finished by hand to a drawn look; volumes deformed to look hand-drawn; leaves simplified with distance ("Level of
  Artistic Detail") **[V]** ([CGWORLD on the SIGGRAPH 2025 talk](https://cgworld.jp/article/202510-siggraph-roz.html)).
  The lit side gets "high-frequency texture in the key light" and the shadow side loses "superfluous information";
  edges are "broken up" with splatter and smeared with a bristle brush **[V]**
  ([befores & afters](https://beforesandafters.com/2025/01/10/if-you-want-a-painterly-bush-paint-the-bush/)).
- ***Spider-Verse*** (Imageworks). Particle and sphere tests never felt "stylised or hand-drawn enough"; a 2D artist
  drew a library of explosion, smoke and steam elements used as sprite sheets; explosions on 2s, then 1s **[V]**
  ([SideFX](https://sidefx.com/community/spider-man-into-the-spider-verse)). Hand-drawn explosions "split out into
  tones of color – a smoke tone, a smoke layer and a hotter layer": about three flat tones **[V]**
  ([VFX Voice](https://vfxvoice.com/?p=13136379)). In *Across*, "the 2D animation [leads] the effect, with the 3D work
  adding enhancements on top" **[V]** ([Toon Boom](https://www.toonboom.com/?p=16859)).
- ***The Mitchells vs. the Machines*** (Imageworks). The most game-like recipe: partial pyro sims advect particles that
  become "camera facing cards with brush stroke textures", so the result "looked illustrated, but also had the motion
  and color of the underlying simulation" **[V]** ([VFX Voice](https://vfxvoice.com/?p=13136379)); smoke always had
  brushstrokes mixed in, and the stroke density grew with the shadow **[V]**
  ([befores & afters](https://beforesandafters.com/2021/04/29/turning-a-painting-into-moving-images-reveals-a-lot-of-things/)).
- ***Arcane*** (Fortiche). Smoke and explosions hand-drawn over stylised 3D at 12 fps for a "staccato effect" **[V]**,
  single source ([RedShark](https://redsharknews.com/why-netflixs-arcane-looks-so-good-how-fortiche-ramped-up-the-animation-pipeline));
  season 2 moved to a hybrid of 2D and 3D FX **[V]**
  ([3DVF](https://3dvf.com/en/fortiche-production-shares-the-secrets-behind-arcane-season-2-at-view-conference/)).
- ***Klaus***. 2D lighting as up to eight layers of flat shapes (occlusion, rim, bounce) tracked to the drawing, with a
  texture pass whose grain "travels with the character" **[V]**
  ([befores & afters](https://beforesandafters.com/2019/11/14/heres-what-made-the-2d-animation-in-klaus-look-3d/)):
  light flat shapes with a few discrete layers.
- **Hand-drawn convention.** Set the flow with two lines first; bumps "random in shape, size and placement"; trails'
  bumps get smaller toward their tips and break their outline to lighten **[V]**
  ([AnimeOutline](https://www.animeoutline.com/how-to-draw-explosions-smoke-fire-step-by-step/)). Gilland's
  *Elemental Magic* covers smoke design and timing **[S]**; no Ghibli-specific source on tone counts was found.

What we take: (1) **a hard, scalloped silhouette** over at most a soft inner gradient; (2) **two or three flat tones**,
lit and shadow, with texture on the lit side only; (3) **broken edges** from a brush mask, not a smooth falloff;
(4) **stepped timing**, 12 fps like our soldiers (`docs/art-bible.md` §3); (5) **simpler, larger shapes with
distance**; (6) **dissolve by eroding the shape**, as `docs/research/painterly-style-in-real-time.md` already
recommends from *The Bad Guys 2*.

## 4. Real-time techniques and their cost

- **Overdraw is the cost.** Smoke can produce "near-unbounded overdraw"; GPU Gems 3 renders particles off-screen at
  low resolution against a downsampled (max-of-4) depth and composites back; on an 8800 GTX at 1600×1200 with a
  73-instruction shader, 46.9 M particle pixels at full resolution gave 25 fps, 2×2 low resolution (11.7 M) 46 fps,
  4×4 (2.9 M) 61 fps; with a 9-instruction shader the gain shrank (44 against 57 fps). Recommended only for soft,
  low-frequency effects **[V]** ([GPU Gems 3, ch. 23](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles)).
  Fit the mesh to the sprite so transparent corners cost nothing **[V]**
  ([PowerVR](https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/optimal-particle-rendering-on-powervr.html),
  [Humus](https://www.humus.name/index.php?page=Cool&ID=8)).
- **Opaque cut-out instead of blending.** A stylised mesh-smoke devlog displaces a cube-sphere along its normals with
  seeded noise, fakes occlusion by lighting the peaks, and dissolves with `clip(thickness − t)`, rejecting alpha
  blending as too expensive for many explosions at once **[V]**
  ([Adrift Arena](https://quirkbit.itch.io/adrift-arena/devlog/122433/creating-stylised-explosions)). Sea of
  Thieves' opaque cloud meshes at quarter resolution with threshold edges are summarised (and sourced) in
  `docs/research/painterly-style-in-real-time.md` §Effects.
- **Toon smoke.** A SIBGRAPI 2023 paper renders cartoon smoke in WebGL/Three.js, each particle a small piece of
  geometry with controllable shade steps, sorted, with silhouette outlines; real time on "modest hardware", no numbers
  **[V abstract]** ([SBC](https://sol.sbc.org.br/index.php/sibgrapi/article/view/27342)). McGuire and Fein's cartoon
  smoke (2006) quantises the shading and draws a slightly larger black billboard behind each particle as its outline
  **[S]** ([PDF](https://faculty.digipen.edu/~gherron/references/References/NPR/mf-2006-toonsmoke.pdf)).
- **Lighting a flat puff.** Six-way lightmaps (two RGBA textures, light from six directions) respond to any light
  at about the cost of a lit sprite (vendor claim) **[V]**
  ([Unity](https://unity.com/blog/engine-platform/realistic-smoke-with-6-way-lighting-in-vfx-graph)). With our one
  static sun, a single baked "lit from the sun" ramp coordinate per puff texel is enough **[E]**.
- **Drift and wind** in the vertex shader or by a flow map: one flow sample plus two texture samples a pixel **[V]**
  ([Catlike Coding](https://catlikecoding.com/unity/tutorials/flow/texture-distortion/)).
- **Babylon.js 9.** `ParticleSystem` has flipbooks, noise and blend modes but **no soft-particle or depth input**
  **[V]** ([typings](https://app.unpkg.com/@babylonjs/core@9.18.0/files/Particles/baseParticleSystem.pure.d.ts)); a
  depth texture has to be bound by hand through a custom particle effect **[V]**
  ([docs](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/customizingParticles),
  [forum](https://forum.babylonjs.com/t/getting-depth-texture-from-prepassrenderer-into-particle-effect/51253)).
  `GPUParticleSystem` needs transform feedback and lacks several features **[V]**
  ([docs](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/gpu_particles)). **Thin
  instances** have no per-object JS cost, are culled as one set, and update through a dynamic buffer **[V]**
  ([docs](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances)): the carrier we already use
  for the soldiers (`src/look/units.ts`).
- **Our page.** The scene renders into a 4× MSAA target, and the materials write view distance into its alpha for the
  depth of field (`src/look/post.ts`): **a blended smoke pass must keep the destination alpha** (separate alpha blend)
  or it breaks the depth of field, and blended smoke cannot write that distance at all, so it would not blur with the
  scene (the owner's rule: units and everything blur by their depth). An opaque cut-out puff writes depth and distance
  like any other surface. On the M1 (a tile-based GPU) blending is resolved on tile, but every covered layer is still
  shaded; `discard` stops hidden-surface removal there (`docs/research/frame-rate-120.md` §2), so cut-out puffs should
  be few and large rather than many and small **[E]**.

## 5. What powder smoke looked like

- **Why so much:** burning black powder leaves more than half its mass as particles; one measurement gives 55.91 %
  solid products (potassium carbonate, sulfate, sulfide) against 42.98 % gas, a "fog that hinders vision" **[V]**
  ([Wikipedia, Gunpowder](https://en.wikipedia.org/wiki/Gunpowder)); the figure goes back to one study.
- **Unless the wind blew, a few shots hid the view;** commanders "since the Napoleonic Wars" complained of it;
  smokeless powder came in 1884 **[V]** ([Wikipedia, Smokeless powder](https://en.wikipedia.org/wiki/Smokeless_powder)).
- **Colour and the bank** (Mercer, Royal Horse Artillery, 1815) **[V]**
  ([Gutenberg](https://www.gutenberg.org/cache/epub/75872/pg75872.txt)): "volumes of grey smoke", "the greyish blue
  smoke of the battle" seen from afar; squares as "dark masses … relieved from a background of grey smoke, which
  seemed to fill the valley"; smoke that "for want of wind, hung over them"; an ammunition wagon's smoke "rising
  straight into the air like a great pillar, then spreading out a mushroom-head"; and as the cannonade slackened, "the
  smoke clearing away a little".
- **Inside it** (Kincaid, Rifle Brigade, Waterloo) **[V]**
  ([Gutenberg](https://www.gutenberg.org/cache/epub/28981/pg28981.txt)): "The smoke hung so thick about, that,
  although not more than eighty yards asunder, we could only distinguish each other by the flashes of the pieces";
  smoke also gave away a firing position.
- **Borodino** (Lejeune): strong wind raised dust that "mingled with the smoke from the guns" **[V]**
  ([WTJ](https://www.wtj.com/archives/lejeune1.htm)). Austerlitz's morning murk was natural fog, cleared by about
  8:45 **[V]** ([Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Austerlitz)).
- **No measured hang times** were found: "minutes" is an estimate. The sources support: it hangs in still air,
  clears when firing slackens, is carried off by a strong wind.
- **Painters' convention** **[O]**: Lejeune's *Borodino* (1822) has big soft white-grey masses rising behind the
  lines, low white bands along the firing lines, and separate black columns from burning villages; Dighton's
  *Waterloo* low drifting banks in the middle distance; Lady Butler's *28th at Quatre Bras* a pale band at muzzle
  height along the square's face. The painters keep the men in front of the smoke, as dark shapes on it: the
  readability rule we want, and it is historically honest (Mercer's "dark masses … relieved from a background of grey
  smoke").

For the look: white and warm on the sunlit top, grey to blue-grey in shadow and at distance; volleys build a low,
continuous bank along the front that thickens with the rate of fire and drifts with the wind; a gun's smoke is a
forward jet that rolls into a cloud **[O]**; burning buildings give dark smoke (`docs/art-bible.md` already warns against
realistic black smoke).

## 6. What we could do

Common to all: the sim already plans **smoke puffs** (≤ 512, position, radius, density, drifting with a fixed wind,
`docs/proposals/sim-design.md` §11); the renderer draws those, with cosmetic extra puffs per company volley. The mood
gives the sun's colour and direction (`src/look/mood.ts`); puffs are moving things, so they are lit at runtime, but
by the one sun and the mood's ramp, not by a lighting model. Costs are for 1920×1080 on the M1 at a heavy fight
(20 battalions and 6 batteries firing, about 300 puffs, 15–25 % of the screen under smoke), all **[E]**.

### A. Flat painted cards, blended (the staff map in 3D)

Camera-facing quads, each a painted RGBA puff texture (a few hand-painted variants, the scalloped silhouette baked
in), tinted by a two-tone sun/shadow ramp from a "lit from the sun" channel; drawn after the opaque scene with
premultiplied blending; the offset shadow as a ground decal. *Look*: closest to the staff map and the concept art,
soft where wanted. *Cost*: about 300 quads × 1–3 layers over ~20 % of the screen: 1–4 M blended fragments at full
resolution, about 0.3–1 ms **[E]**, more when they pile up (overdraw unbounded). *Readability*: needs a fade-out
over formations (the blend makes it easy). *Fit*: must preserve the destination alpha (depth of field); no depth
write, so it does not blur with the scene; needs a depth texture for soft intersections with the ground.

### B. Opaque cut-out puffs (recommended)

Instanced low-poly blobs (an icosphere of ~80 triangles, or a camera-facing disc with a baked normal), one thin
instance set, per-instance seed, age and size; the vertex shader grows, drifts (wind uniform) and squashes them; the
fragment shader shades with the world's three-band ramp from the mood's sun (warm lit band, cool shadow band, a rim),
breaks the silhouette with the the world's paint grain (`src/look/grain.ts`), anchored in world space, through alpha-to-coverage (as the
soldiers already do, `src/look/units.ts`), and dissolves by eroding the mask with age. Cast shadow: the staff map's offset
silhouette as a soft ground decal, like the soldiers' simple shadows (decision 0062). Time stepped at 12 fps.
*Look*: Puss's "hard graphic edge" and Wild Robot's thresholded geometry; reads as sculpted cumulus in the Wagram
master. *Cost*: no blending; ~300 × 80 = 24 k triangles (nothing next to 3.2 M); fragments only where smoke is the
front surface, with MSAA coverage at the edges: about 0.2–0.6 ms **[E]**. *Readability*: a hole cut where a
formation stands (below). *Fit*: writes depth and the view distance, so it blurs with the depth of field and sits in the
pipeline like any other painted surface; no new pass.

### C. Half-resolution smoke buffer for the banks

The banks (persistent, low-frequency) drawn as large soft blended cards into a half-resolution off-screen target
against a downsampled depth, then composited with a threshold edge (Sea of Thieves, GPU Gems 3). *Look*: soft
lingering banks over the field, the "battle tells its story" accumulation (`docs/art-bible.md` §11). *Cost*: a
quarter of the fragments of A plus a full-screen composite (~2 M one-texture reads): about 0.3–0.6 ms, a new render
target and pass **[E]**. *Fit*: another pass in a frame already over 8.3 ms; the composite has to respect the depth of
field's alpha. Worth it only if B's banks look too solid.

### D. Hybrid: B for the shot, a few A cards for the bank

Fresh fire (the flash, the jet, the first puffs) as B; the old smoke merging into a handful of large, very pale
blended cards per firing line that drift and thin out. *Cost*: B plus a capped 20–40 large cards, about 0.3–0.8 ms
**[E]**. The likely end state if the owner wants hanging banks.

### Readability in all of them

- **Never over the men.** The painters' rule: formations as dark shapes in front of the smoke. Puffs spawn at the
  muzzle line and drift *away* from the front (forward, then up and downwind); a per-battalion **clearance** (the
  formation's footprint plus a margin, passed as a small uniform array or a coarse mask texture) erodes any puff
  that drifts over it, with a few metres of eroded edge rather than a cut.
- **Lower value contrast and saturation than the coats:** smoke stays within the ground's value range on its shadow
  side; only the lit top is bright.
- **Thin with zoom:** fewer, larger puffs toward the far zoom, and the staff map's own flat clouds past the
  map threshold (the stage where `mapness` takes over).
- **Density as a quality tier**, never off (Napoleon: Total War's precedent, `docs/research/painterly-style-in-real-time.md`).

### Recommendation

Build **B** first, in the look page, with the staff map's grammar: one silhouette of merged blobs, two tones plus a
rim, a hard brushed edge, an offset ground shadow, a gun as a forward string of three clouds behind a 0.2 s flash,
fire that always shows within a fixed budget (drop the most faded). Measure it at 20 battalions firing on the M1
(frame interval, `docs/research/frame-rate-120.md` §1) against the P4 bar (≤ 1.5 ms) and the readability gate.
Add D's bank cards only if the owner wants the lingering banks of the Wagram master and B's are not enough.

## 7. Reference images

Stills for the owner, kept outside the repo (reference stills never go in git); the folder's `refs.md` lists each
source:

- the staff map's lit smoke (our screenshot, PR #49);
- period paintings: Lejeune's [*Battle of Borodino*](https://commons.wikimedia.org/wiki/File:Battle_of_Borodino.jpg),
  Dighton's [*General Advance of the British Lines*](https://commons.wikimedia.org/wiki/File:Denis_Dighton_(1792-1827)_-_The_Battle_of_Waterloo,_General_Advance_of_the_British_Lines_-_RCIN_407486_-_Royal_Collection.jpg),
  Lady Butler's [*28th Regiment at Quatre Bras*](https://commons.wikimedia.org/wiki/File:Elizabeth_Thompson_-_The_28th_Regiment_at_Quatre_Bras_-_Google_Art_Project.jpg);
- a [musket fired at a reenactment](https://commons.wikimedia.org/wiki/File:Musket_demonstration.jpg) (the real white
  cloud and the pan's puff);
- stylised FX: [Spider-Verse's hand-drawn explosion shapes](https://sidefx.com/community/spider-man-into-the-spider-verse),
  [Wild Robot's brushstroke volume treatment](https://cgworld.jp/article/202510-siggraph-roz.html),
  [2D FX on cards in Unreal (RIFT)](https://vfxvoice.com/?p=13136379),
  [Adrift Arena's opaque mesh smoke](https://quirkbit.itch.io/adrift-arena/devlog/122433/creating-stylised-explosions);
- games: [Napoleon: Total War](https://store.steampowered.com/app/34030/) (the realistic haze we avoid),
  [Ultimate General: Civil War](https://store.steampowered.com/app/502520/) and
  [Grand Tactician](https://store.steampowered.com/app/654890/) (puffs at an RTS camera), from their store pages.

## Open questions

- Do the banks linger (the Wagram master) or does the smoke clear within seconds (the north star)? A gameplay call as
  much as a look one: lingering banks need the clearance rule to work hard.
- Does the sim's smoke (sight to ≈ 45 m) show as smoke, or only as a cursor or overlay effect, when the drawn puffs
  are kept off the formations?
