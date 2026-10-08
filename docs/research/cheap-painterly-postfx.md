---
status: research
last_reviewed: 2026-10-08
---

# Cheap painterly post-FX for a top-down Babylon.js RTS

Research notes, October 2026. Scope: which finishing effects give the most
"cinematic / painterly / golden-hour diorama" for the least GPU time on mid-range
laptop GPUs (Apple M1/M2 integrated, GTX 1650 class) at 1080p–1440p and 60 fps,
using Babylon.js 9.x on WebGL2 now and WebGPU later. Written against
`docs/art-bible.md` (the art bible) and `prototypes/painted-hybrid.html`.

**How to read the confidence tags**

| Tag | Meaning |
|---|---|
| **[V-src]** | Verified by reading the Babylon.js 9.29.0 package source (`@babylonjs/core@9.29.0`, the version the prototype loads) |
| **[V-doc]** | Verified in official docs, talks, papers or developer posts (linked) |
| **[E]** | My estimate, with the reasoning shown. No measured numbers exist for this scene yet |
| **[U]** | Could not verify. Treat as a lead, not a fact |

> **Two conflicts with the brief to flag up front.**
> 1. The brief asks for "tilt-shift-like depth of field". `docs/art-bible.md` (Oct 2026
>    revision) retires tilt-shift and says "**Never blur.**" Detail should fall
>    away from the focus through looser strokes and cooler colour instead (§3, §6).
>    Below, DoF is costed and specified, but recommended **only for the cinematic
>    export tier**, and only with art-director sign-off.
> 2. `docs/art-bible.md` §1.4: "The painterly look lives in the assets and materials,
>    not in a full-screen filter." That rules Kuwahara-style filters out of the
>    game tier. The ranking below follows the art bible.

---

## 1. Executive summary

### Top 8, ranked by (impact on our target look) ÷ (GPU cost)

| # | Technique | Where | Cost at 1080p, M1-class **[E]** | Why |
|---|---|---|---|---|
| 1 | **Bake the static light**: sun shadow, AO, valley-mist mask and canopy occlusion into one world-space "light map" for the terrain. Drop SSAO2 and the per-pixel 4-tap shadow map | Bake once at load + 1 fetch in material | **Saves** roughly 4–10 ms; costs ~0.1 ms | The landscape and sun are static. Baking lets you *paint* shadow edges at bake time (many taps, grain-broken), which per-frame PCF can't afford. It is also the biggest performance fix |
| 2 | **One fused finishing pass**: 3D-LUT grade (warm amber, split toning, white balance, contrast, all in one texture), hue-preserving highlight shoulder, cool vignette, static paper texture, blue-noise dither | 1 full-screen pass | 0.5–0.9 ms | The single biggest "cinematic" gain per millisecond. Fusing avoids paying 0.3–0.6 ms of bandwidth per separate pass |
| 3 | **In-material analytic height fog / valley mist**, coloured warm where the air is sunlit and cool where it is shadowed (using the baked light map) | Material (ALU + 1–2 fetches) | 0.2–0.5 ms | Gives "layered aerial depth" and "lit haze in valleys" with no depth buffer and no extra pass |
| 4 | **Golden backlight in the material**: strengthen the existing warm rim and add a foliage back-scatter term when the sun is behind the crowns | Material (ALU) | ≈0.1 ms | This is the Last Wish "graphic rim". It costs almost nothing in a forward renderer and is impossible to do well in post without a normals buffer |
| 5 | **Render scale**: cap the 3D render at DPR 1.0 and use Babylon's `FSR1RenderingPipeline` on HiDPI screens | Pipeline | **Saves** 30–55 % of shading; FSR costs ~0.4–0.8 ms | Low-frequency painted content upscales well. The prototype currently shades up to 2.25× the pixels of 1080p (DPR 1.5) |
| 6 | **Low-res dual-filter bloom** (Bjørge 2015), subtle, for glints, lit snow, rims and "light blooms" | 8 tiny passes from half res | 0.3–0.5 ms | Adds luminosity ("epic, luminous, not dark") for far less than Babylon's built-in Gaussian bloom |
| 7 | **Cheap light shafts without a sky**: march 2–4 samples of the baked sun-visibility map through the mist layer, plus hand-placed painted shaft cards for hero presets | Material / FX cards | 0.2–0.6 ms | Makes "golden backlight through haze" visible from above. Babylon 9's `FrameGraphVolumetricLightingTask` is the WebGPU-era upgrade |
| 8 | **Depth-in-alpha plus optional depth-only ink edges**, fading with distance (Sable-style) | Material writes depth; the uber pass reads it | 0 ms for depth, 0.15–0.3 ms for edges | Free depth for fog and DoF in the finishing pass, with no second scene render. Edges are a readability test, **not** a default |

**Not in the game tier:** screen-space AO (replaced by baking), depth of field or
tilt-shift (art bible), Kuwahara and other painterly image filters (art bible,
2–6 ms, temporal flicker), chromatic aberration and animated film grain (these
read as a camera, not as paint).

### Recommended pipeline (summary; details in §2)

**Game (60 fps) [E], 1080p, M1-class:**

1. Load-time bakes: terrain light map, terrain albedo field, instance light values (≈100–500 ms once).
2. Main forward pass into an RGBA16F target: materials do lighting ramp, grain, baked light, cloud shadows, rim and backlight, fog, mist and fake shafts, and write view depth into alpha. **4–7 ms**
3. Bloom: dual filter, 4 down + 4 up from half res. **0.3–0.5 ms**
4. Uber finishing pass straight to the back buffer. **0.5–0.9 ms**
5. Optional FSR1 upscale when the render scale is below 1. **0.4–0.8 ms**, but it saves far more in pass 2.

**Total ≈ 6–9 ms GPU**, leaving headroom for units, effects, UI and the browser
compositor inside 16.6 ms.

**Cinematic export (offline, cost no object):** the same materials at 2× supersampling,
temporal accumulation (8–32 jittered sub-frames per output frame), HQ bakes,
`FrameGraphVolumetricLightingTask` at full tessellation, optional painted-bokeh DoF,
masked anisotropic Kuwahara on the frame periphery, and the same LUT.

### Top fixes for the current prototype (details in §5)

1. **Remove SSAO2.** It is constructed with `forceGeometryBuffer = true`, which makes Babylon **re-render the whole scene** (≈2.3 M triangles, ≈6.7 k instances) into a G-buffer every frame. That G-buffer also ignores the painted crown `discard` **[V-src]**.
2. **Render at DPR 1.0**, not 1.5, and add FSR1 if HiDPI sharpness matters.
3. **Shrink and simplify the shadow map.** It is a 4096² **RGBA32F** target (≈256 MiB colour plus a depth buffer) read with 4 NEAREST taps plus 2 grain-jitter taps per pixel. Bake it instead (fix 1 in the table), or use a 2048² depth texture with hardware compare (`sampler2DShadow`, 1 fetch).
4. **Fix MSAA placement.** `antialias:true` plus `fin.samples=4` puts MSAA on the wrong targets. With AO on, the scene itself gets none **[V-src]**.
5. **Cut texture fetches per terrain pixel** from ≈20–25 to ≈6–8: bake the static albedo, compute `cloud()` once, and lower anisotropy on the low-frequency grain channels.
6. **Vegetation:** chunk the thin instances so frustum culling works; replace the 2,344 far bushes (≈740 k triangles of 2–6 px features) with a painted "woods" mask plus a few impostors; keep `discard` only on the near LOD and draw it after opaque geometry.

---

## 2. Recommended pipeline in detail

### 2.1 What moves where

| Effect | Bake once | In material (forward) | Post (uber pass) | Why there |
|---|---|---|---|---|
| Sun shadow (static landscape) | **Yes**: world-space light map, edges painted at bake | 1 fetch | | Static sun and terrain; bake time can afford 32+ taps and grain-shaped edges |
| Sun shadow on units (dynamic) | | Painted blob/elongated decal oriented by the sun, plus the baked map sampled at the unit's position | | Units are small at 45–260 m; a painted shape matches "shadows are painted shapes" (§4) |
| Ambient occlusion | **Yes**: heightfield horizon AO + canopy footprints + per-vertex crown AO | 0–1 fetch | | SSAO looks computed, not painted, and costs most in this scene |
| Cloud shadows | | Yes (already); compute once per pixel | | World-anchored; cheap |
| Hue-shifted ramp, grain, edge breakup | | Yes (already) | | The look lives here (§1.4) |
| Rim and backlight | | Yes | | Needs N, V and L, which are free in the material |
| Colour falloff from focus (aerial depth) | | Yes (already `atmos()`) | | World position is free in the material |
| Height fog / valley mist | Mist mask baked | Yes (analytic) | | No depth fetch needed; ALU only |
| Light shafts (fake) | Sun-visibility map (= the shadow channel) | 2–4 fetches in the mist band | | Consistent with baked shadows; no extra pass |
| Bloom | | | Separate small passes + composite in the uber pass | Needs blur; keep it at low res |
| Grade, tone shoulder, vignette, paper, dither | | | **Uber pass** | Global, cheap, one pass |
| Ink edges (optional) | | Depth written to alpha | In the uber pass | Needs neighbourhood access |
| DoF / tilt-shift | | Depth written to alpha | Cinematic tier only | Art bible says no blur |

### 2.2 Game tier, pass by pass **[E]**

| Pass | Resolution | Cost at 1080p, M1-class | Notes |
|---|---|---|---|
| Bakes (load) | 2048² world-space | ~0.1–0.5 s once | Terrain light map, albedo field, height texture, instance light values |
| Main forward | 1.0× (or 0.67–0.77× + FSR1) | 4–7 ms | Dominated by terrain fetches and vegetation overdraw. Target ≤8 texture fetches per terrain pixel |
| Bloom down ×4 | ½ → 1/16 | 0.2–0.3 ms | First downsample reads the full-res RGBA16F target once |
| Bloom up ×4 | 1/16 → ½ | 0.1–0.2 ms | Tiny targets |
| Uber finishing | 1.0×, writes back buffer | 0.5–0.9 ms | ~6–10 fetches, mostly cache-coherent |
| FSR1 (optional) | Upscale | 0.4–0.8 ms | EASU + RCAS |
| **Total** | | **≈6–9 ms** | Leaves ~7 ms for units, effects, UI |

### 2.3 Cinematic video export tier

The camera is scripted, frames are rendered one by one, and real-time is irrelevant.

1. **Supersample**: render at 2× (e.g. 3840×2160 for a 1080p master) and downsample with a good filter. This gives clean grain and edges.
2. **Temporal accumulation**: per output frame, render N = 8–32 sub-frames with sub-pixel camera jitter (and optionally a jittered sun direction for softer bake-free shadows), then average. This removes all shimmer from grain, discard edges and thin foliage.
3. **Higher-quality versions of the same passes**: 4096² light map bake, 8-step shaft march, bloom from full res.
4. **Volumetric light**: `FrameGraphVolumetricLightingTask` with `tesselation` 1024 and `frequency` 1 (see §3.7).
5. **Optional, art-director call**: subtle tilt-shift DoF with painted-dab bokeh, and anisotropic Kuwahara restricted by a mask to the frame periphery. This mirrors the film's "looser, more impressionistic toward the frame edges" (AWN interview, below).
6. **Same LUT**, so the trailer matches the game.
7. Capture: step the render loop manually and encode with WebCodecs `VideoEncoder` or a PNG sequence. Turn `preserveDrawingBuffer` on **only** in export mode.

---

## 3. Technique by technique

Each section covers what it does for our look, its cost, a Babylon implementation
sketch, and pitfalls.

### Cost model used for the estimates **[E]**

- M1 8-core GPU: about **2.6 TFLOPS FP32** and **68.25 GB/s** shared LPDDR4X; GTX 1650 (desktop): about **3.0 TFLOPS** and **128 GB/s** ([gpu-monkey M1](https://www.gpu-monkey.com/en/gpu_group-apple_m1_8_gpu), [getdeploying GTX 1650](https://getdeploying.com/gpus/nvidia-gtx-1650)). Laptop 1650 variants (Max-Q) are slower.
- One full-screen pass at 1080p touches 2.07 M pixels. Reading and writing RGBA8 moves ≈16.6 MB; reading RGBA16F and writing RGBA8 moves ≈25 MB. At an effective 45–60 GB/s that is **≈0.3–0.55 ms per trivial pass on M1**, plus fixed overhead. Each extra *separate* pass therefore costs about 0.3–0.6 ms even when its maths is trivial. That is the core argument for fusing passes.
- ALU budget: roughly 400–800 simple ops per pixel per millisecond at 1080p on M1 (2.6 TFLOPS at 30–60 % utilisation). Most finishing maths is far below that; **fetches and bandwidth dominate**.
- 1440p is 1.78× the pixels of 1080p. DPR 1.5 on a 1440×900 logical laptop window is 2160×1350 = 2.9 MP, or 1.41× 1080p.

---

### 3.1 Colour grading with a 3D LUT (plus split toning)

**For our look.** This is the cheapest way to get the reference's "warm amber grade,
muted greens" as one global, art-directable decision. Everything goes into one
texture: white balance toward amber, split toning (warm highlights, teal-blue
shadows), green desaturation, gentle S-curve contrast. Per-season and time-of-day
presets ("golden morning", "winter", "dusk", §4) become separate LUTs blended in
the shader.

**Cost.** One 3D-texture fetch (WebGL2 `sampler3D`, trilinear), or two 2D fetches
with Babylon's strip polyfill. **≈0.02–0.05 ms** inside an existing pass **[E]**.
Blending two LUTs adds one more fetch.

**Babylon.**
- Built in **[V-src]**: `ImageProcessingConfiguration.colorGradingTexture` (`ColorGradingTexture` loads `.3dl`; PNG strips also work), `colorGradingWithGreenDepth`, `colorCurvesEnabled` and `ColorCurves` (global, highlights, midtones and shadows hue, density, saturation and exposure). In the shader, the order is: white balance → exposure → vignette → tone map → gamma → contrast → LUT → curves → dither (from `Shaders/ShadersInclude/imageProcessingFunctions.js`).
- **Pitfall [V-src]:** image processing reaches our pixels only through a post-process (`DefaultRenderingPipeline` with `hdr=true`, or `ImageProcessingPostProcess`). The prototype's `ShaderMaterial`s never call `applyImageProcessing`. When the pipeline is non-HDR, Babylon sets `applyByPostProcess=false` and expects *materials* to apply it, which custom shaders don't.
- Recommended: put the LUT in **our own uber pass** (§3.10). Babylon's `ColorCurves` are a nice tuning UI, but each curve set is just a few uniforms, and a LUT authored in Photoshop, Affinity or Resolve covers more.

**LUT workflow.**
1. Generate an identity 32³ LUT as a 1024×32 PNG strip (snippet below).
2. Paste it into a game screenshot, grade the screenshot in any editor, crop the strip back out.
3. Load it as `RawTexture3D` (WebGL2) or sample the strip with two bilinear fetches.

```js
// identity 32^3 LUT strip: 32 slices of 32x32 side by side (x = r + 32*b, y = g)
const N=32,c=document.createElement('canvas');c.width=N*N;c.height=N;const g=c.getContext('2d'),im=g.createImageData(N*N,N);
for(let b=0;b<N;b++)for(let y=0;y<N;y++)for(let r=0;r<N;r++){const i=(y*N*N+b*N+r)*4;
  im.data[i]=r*255/(N-1);im.data[i+1]=y*255/(N-1);im.data[i+2]=b*255/(N-1);im.data[i+3]=255;}
g.putImageData(im,0,0);
```

**Pitfalls.**
- Grade in the **same encoding** the LUT will see. The prototype's materials output display-referred values directly, so grade display-referred.
- **Protect army saturation** (pillar "Readable"): armies must stay the most saturated objects. A global LUT that mutes greens may also mute the Russian `#2F6B3C`. Mark army pixels (sign trick in §3.10) and blend their grade at ~30 %.
- An 8-bit LUT plus smooth haze gradients produces banding. Always dither after grading (§3.13).

### 3.2 Tone mapping: ACES vs AgX vs PBR Neutral vs none

**What exists in Babylon 9.29 [V-src].** `ImageProcessingConfiguration.TONEMAPPING_STANDARD` (0), `TONEMAPPING_ACES` (1, the Hill "ACES fitted" approximation) and `TONEMAPPING_KHR_PBR_NEUTRAL` (2). There is **no AgX** in the 9.29 source.

**What each does for a painted, warm, chosen-colour look.**

| Operator | Character | For us |
|---|---|---|
| **ACES (fitted)** | Strong filmic S-curve; hue skews in bright saturated colours (toward yellow, blue toward magenta) and loses access to high saturation ([ACES Central thread](https://community.acescentral.com/t/aces-2-0-seeing-a-few-issues/5812/53), [Blender devtalk](https://devtalk.blender.org/t/blender-support-for-aces-academy-color-encoding-system/13972?page=2)) **[V-doc]** | **Avoid.** It would re-colour the hand-chosen ramp colours and army uniforms |
| **AgX** (Sobotka; Blender 4.0 default; three.js `AgXToneMapping` via Filament) | Graceful path-to-white, natural desaturation of over-exposed colour; the default look is lower in contrast ([three.js source](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js), [darktable AgX docs](https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/agx/)) **[V-doc]** | Good for *physically lit HDR*. Our values are display-referred chosen colours, so AgX's log encoding and sigmoid would flatten them. It needs a "punchy" look plus a LUT to recover, and it is not built in |
| **Khronos PBR Neutral** | No hue shifts; reproduces base colours exactly in 0.08–0.8 per channel; desaturating compression above 0.8 ([Khronos README](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md)) **[V-doc]** | **Best built-in choice** if we ever move to linear-light HDR materials |
| **None + hue-preserving soft shoulder** (custom) | Leaves everything ≤ the knee untouched; compresses only highlights (glints, bloom, lit snow) by scaling RGB by a function of the max channel | **Recommended now.** Our materials already decide the colours, so the tone mapper should only catch overflow |

```glsl
// hue-preserving soft shoulder on display-referred colour (knee 0.8, asymptote 1.0)
vec3 shoulder(vec3 c){
  float m = max(c.r, max(c.g, c.b));
  if (m <= 0.8) return c;
  float k = 0.8, mm = k + (1.0-k) * (1.0 - exp(-(m-k)/(1.0-k)));   // smooth roll-off to 1.0
  return c * (mm / m);
}
```

**Cost.** ALU only, ≈0 ms when fused.

**Pitfall.** Pick one encoding and stick with it. If the materials move to
linear-light HDR later, switch to PBR Neutral (Babylon's GLSL can be copied from
`imageProcessingFunctions.js`) and re-author the LUT.

### 3.3 Depth of field / tilt-shift

**For our look.** In real tilt-shift photos the blur grows top and bottom of frame,
which reads as "miniature". At our 40–55° pitch the view depth already grows from
bottom to top of the screen, so a **depth-based CoC naturally gives a tilt-shift
gradient**. A screen-space gradient (blur by `|uv.y - focusY|`) is cheaper but
blurs tall objects (spires, trees) that cross the band, which looks wrong. Tiny
Glade, a diorama-like builder, ships a "tilt-shift DoF" (GPC 2024 talk abstract,
[archive](https://graphicsprogrammingconference.com/archive/2024/)) **[V-doc]**.
The Last Wish used "stylized depth of field bokeh elements"
([SIGGRAPH blog](https://blog.siggraph.org/?p=17519)) **[V-doc]**.

**Art-bible verdict.** Not in the game tier ("Never blur"; tilt-shift retired).
The equivalent depth cue in-game is the existing colour falloff from the focus
plus **stroke loosening**: scale the grain and brush stamps up and lower band
contrast with distance from `uFocus`. Both are ALU-level changes in `paint()`.

**Cost.**
- Babylon `DefaultRenderingPipeline.depthOfField` **[V-src]**: enabling it calls `scene.enableDepthRenderer()`, a **second full scene render** to get depth (for this scene, estimated at several ms **[E]**). It then runs a circle-of-confusion pass at full res, then blur passes (`Low`: 1 Y + 1 X with kernel 15; `Medium`: 2× each with kernel 31; `High`: 3× each with kernel 51; first Y blur at ratio 1.0, then 0.75 / 2^i), then a merge. Also, the depth renderer re-renders with its own material and **ignores our procedural `discard`** (it only handles textured alpha test) **[V-src]**, so tree crown depth won't match the painted silhouettes.
- Custom, using depth written into alpha (§3.10): half-res separable 2×9 taps plus composite in the uber pass. **≈0.4–0.7 ms [E]**.

```glsl
// half-res separable tilt-shift blur (run once with dir=(1,0), once with dir=(0,1))
// scene.a = viewDepth/far (written by our materials). CoC from depth distance to focus.
uniform sampler2D textureSampler; uniform vec2 uTexel, uDir; uniform float uFocus, uRange, uMaxPx;
varying vec2 vUV;
float coc(float d){ return clamp(abs(d - uFocus) / uRange, 0.0, 1.0); }
void main(){
  vec4 c0 = texture2D(textureSampler, vUV); float r = coc(abs(c0.a)) * uMaxPx;
  vec3 acc = c0.rgb; float w = 1.0;
  for (int i = 1; i <= 4; i++) {
    float o = float(i) / 4.0 * r;
    for (int s = -1; s <= 1; s += 2) {
      vec4 t = texture2D(textureSampler, vUV + uDir * uTexel * o * float(s));
      float wt = coc(abs(t.a));                 // sharp samples don't bleed into blurred areas
      acc += t.rgb * wt; w += wt;
    }
  }
  gl_FragColor = vec4(acc / w, c0.a);
}
```

**Pitfalls.**
- Halos: a sharp near object bleeding into the blur. Weighting by sample CoC (above) handles most cases in a top-down view.
- Blurred grain changes the painted character. Blur **before** the paper and grain overlay, never after.
- Spider-Verse replaced some blur with colour misregistration ("ChromaShifter ... originally created for handling the color offsetting effect we used for depth of field", [Foundry](https://www.foundry.com/insights/film-tv/graphic-look-in-comp-spiderman)) **[V-doc]**. That is a stylised, blur-free alternative for the trailer.
- Painted bokeh (cinematic only): replace the Gaussian with a scatter-as-gather using a brush-dab kernel shape (sample offsets taken from a dab mask).

### 3.4 Height fog and valley mist

**For our look.** This is the main source of "layered aerial depth" and "soft lit
haze in valleys" from above. The art bible wants no horizon haze, valley mist only
for presets, and atmosphere from the ground (§6). Fog fits that if it is **low and
local**.

**Approach: analytic, in the material.** Inigo Quilez's fog article gives the
exponential height-fog integral, `density(y) = a·e^(−b·y)`, solved analytically
with "one division", and a sun-direction tint ([iquilezles.org/articles/fog](https://iquilezles.org/articles/fog/)) **[V-doc]**.
Unreal's Exponential Height Fog exposes the same parameters (density, height
falloff, inscattering colour) ([UE docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/exponential-height-fog-in-unreal-engine)) **[V-doc]**.

For a surface point `p` seen from camera `ro`, with Δy = `ro.y − p.y` > 0 and ray length `t`:

```glsl
// optical depth of exp height fog between surface p and camera ro (camera above p)
uniform float uFogA, uFogB, uFogBase;     // density, falloff (1/m), base height
float fogOD(vec3 p, vec3 ro){
  float t = length(ro - p), dy = max(ro.y - p.y, 1e-3);
  return uFogA * t / (uFogB * dy) * exp(-uFogB * (p.y - uFogBase)) * (1.0 - exp(-uFogB * dy));
}
// valley mist: same formula, density scaled by a baked valley mask (light map B channel),
// colour = warm where the air above p is sunlit, cool where it is shadowed (see 3.7)
vec3 applyMist(vec3 col, vec3 p, vec3 ro, float valleyMask, float airSun){
  float T = exp(-fogOD(p, ro) * valleyMask);
  vec3 mistCol = mix(uMistCool, uMistWarm, airSun);
  return mix(mistCol, col, T);
}
```

**Cost.** ≈10–20 ALU ops plus the baked-mask fetch (shared with the light map).
**≈0.1–0.3 ms [E]** at 1080p, including overdraw on vegetation.

**Alternatives compared.**

| Option | Cost **[E]** | Verdict |
|---|---|---|
| Analytic in material (above) | 0.1–0.3 ms | **Use.** No depth buffer, works with MSAA, no extra pass |
| Screen-space fog in post from depth | 0.1 ms fused (needs depth in alpha) | Equivalent result. Use it only if materials can't be changed (e.g. third-party shaders) |
| Geometry layers (alpha mist cards, soft particles) | Fill-rate: each full-screen layer ≈0.3–0.6 ms; blended, no HSR on Apple GPUs | **Only for hand-placed hero accents.** The film's "scalloping" graphic edges suit cards ([befores & afters](https://beforesandafters.com/2023/01/11/heres-how-dreamworks-lent-a-whole-new-brand-of-stylized-look-and-feel-to-puss-in-boots-the-last-wish)) |
| Froxel volumetric fog | 1–3 ms+ | Overkill for a fixed top-down camera |

**Baking the valley mask.** Mask = `smoothstep(0, 4 m, blurredHeight(64 m) − height)`,
times a per-preset strength. It goes in the light map's B channel (§3.11).

**Pitfalls.**
- Fog must not hide formations (§9 "never hide a formation"). Cap mist opacity (e.g. T ≥ 0.45) and lower it on unit pixels.
- Sable's lesson: "distant fog" was "really, really key" to readability at mid-to-long distance, alongside lighting and lines ([Game Developer](https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability)) **[V-doc]**.

### 3.5 Bloom at low resolution

**For our look.** Subtle "light blooms" (the film used them, [AWN](https://www.awn.com/animationworld/puss-boots-last-wish-returns-its-fairy-tale-illustration-roots) **[V-doc]**) on water glints, lit snow, rims and musket flashes. This is what "luminous" needs.

**Options.**

| Method | Passes | Cost at 1080p **[E]** | Notes |
|---|---|---|---|
| Babylon `DefaultRenderingPipeline` bloom **[V-src]** | Extract highlights (at `bloomScale` 0.5) → separable Gaussian X → Y (`bloomKernel` default 64, linear-sampling optimised) → merge | 0.8–1.5 ms | Simple to enable; large kernel at half res |
| **Dual filter (Bjørge, ARM, SIGGRAPH 2015)** | 4 downsamples (5 taps) + 4 upsamples (8 taps) | **0.3–0.5 ms** | In Bjørge's Mali tests it was the fastest filter, needed "7% of the total bandwidth compared to the linear sampling filter, and less than half compared to the kawase filter" ([course notes](https://developer.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_notes.pdf)) **[V-doc]** |
| CoD:AW mip-chain (Jimenez 2014) | 13-tap downsample + tent upsample | 0.4–0.7 ms | Most temporally stable; designed against fireflies ([iryoku](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/)) **[V-doc]** |

**Dual filter shaders** (from the Bjørge notes, lightly fixed):

```glsl
// downsample: tex = previous level, halfpixel = 0.5 / sourceSize
vec4 down(sampler2D tex, vec2 uv, vec2 hp){
  vec4 s = texture2D(tex, uv) * 4.0;
  s += texture2D(tex, uv - hp);                 s += texture2D(tex, uv + hp);
  s += texture2D(tex, uv + vec2(hp.x, -hp.y));  s += texture2D(tex, uv - vec2(hp.x, -hp.y));
  return s / 8.0;
}
// upsample: halfpixel = 0.5 / sourceSize (the smaller level)
vec4 up(sampler2D tex, vec2 uv, vec2 hp){
  vec4 s = texture2D(tex, uv + vec2(-hp.x * 2.0, 0.0));
  s += texture2D(tex, uv + vec2(-hp.x, hp.y)) * 2.0;  s += texture2D(tex, uv + vec2(0.0, hp.y * 2.0));
  s += texture2D(tex, uv + vec2( hp.x, hp.y)) * 2.0;  s += texture2D(tex, uv + vec2(hp.x * 2.0, 0.0));
  s += texture2D(tex, uv + vec2( hp.x,-hp.y)) * 2.0;  s += texture2D(tex, uv + vec2(0.0,-hp.y * 2.0));
  s += texture2D(tex, uv + vec2(-hp.x,-hp.y)) * 2.0;
  return s / 12.0;
}
```

**Babylon wiring (classic post-process chain).** Each `PostProcess` owns its
*input* texture, and its `options` ratio sets that size **[V-src]**.

1. First PP = `down1` (ratio 1.0, `TEXTURETYPE_HALF_FLOAT`, `samples = 4`). The scene renders into its input, so this is also where MSAA goes.
2. Chain: `down1` writes ½ → `down2` writes ¼ → `down3` writes ⅛ → `down4` writes 1/16 → `up` ×3.
3. The last PP is the **uber pass**. It reads the original scene through `effect.setTextureFromPostProcess("sceneSampler", down1)` (that call binds a post-process's *input*) and the bloom through `setTextureFromPostProcessOutput` **[V-src, `postProcess.types.d.ts`]**.

In a Frame Graph (§4.3) the same thing is explicit and avoids the guesswork.

**Pitfalls.**
- Use a soft threshold (knee) on luminance > ~0.85 so the paint itself doesn't glow.
- Bloom on grain shimmers. Downsample with the 5-tap filter (not point sampling), and keep the first level at half res, not quarter.

### 3.6 Rim light and backlight: material vs post

**Verdict: material.** The prototype already has a grain-broken warm rim
(`smoothstep(0.58,0.64,fres+grain)`). In a forward renderer N, V and L are free
in the material, while a post rim needs a normal buffer (MRT or a G-buffer pass).
DreamWorks used rim "liberally" for "a graphic edge" and "cheated rim lights with
bold color choices to enhance readability"
([befores & afters](https://beforesandafters.com/2023/01/11/heres-how-dreamworks-lent-a-whole-new-brand-of-stylized-look-and-feel-to-puss-in-boots-the-last-wish),
[SIGGRAPH blog](https://blog.siggraph.org/?p=17519)) **[V-doc]**.

Add a **foliage back-scatter ("golden backlight")** term for crowns when the sun
is behind them relative to the camera. The sun is side-back by design (§4):

```glsl
// in paint(), foliage only: warm glow on the camera-facing edges of back-lit crowns
float back = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 4.0);          // sun behind the crown
float edge = smoothstep(0.35, 0.75, fres + (g.r - 0.5) * 0.25);      // grain-broken, painterly
c += uSunCol * vec3(1.0, 0.78, 0.45) * back * edge * uBackAmt * (1.0 - sh);
```

**Cost.** ≈10 ALU ops, ≈0.05 ms **[E]**.

### 3.7 Light shafts / god rays without a sky or a visible sun

The classic screen-space method (radial blur toward the projected sun, GPU Gems 3
ch. 13, [NVIDIA](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process))
assumes the light source is on or near the screen. Babylon's
`VolumetricLightScatteringPostProcess` needs a **light-source mesh**, renders an
extra internal pass, and defaults to **100 samples** ([Babylon docs](https://doc.babylonjs.com/features/featuresDeepDive/lights/volumetricLightScattering)) **[V-doc]**.
Neither suits a top-down view with no sky. What does work:

| Option | How | Cost at 1080p **[E]** | Verdict |
|---|---|---|---|
| **A. Baked sun-visibility march in the mist band** | Shafts are "air in sun vs air in shadow". For each pixel, sample the **baked shadow channel** at 2–4 points along the view ray inside the mist layer (heights h₁..h₄ above `p`). Each air point is projected to the ground along the sun direction: `uv = (q.xz − sunDir.xz/sunDir.y · (q.y − ground)) → light-map UV`. Average them → `airSun` (used by `applyMist` in §3.4) | 0.15–0.4 ms (2–4 fetches of a cache-friendly 2D map) | **Use.** Consistent with the baked shadows, world-anchored (no swimming), zero extra passes |
| **B. Painted shaft cards** | Hand-placed additive ribbons or cards with painted light-shaft textures and depth fade, for presets (Austerlitz dawn) | Fill-rate of the cards only | **Use for hero shots.** Matches "illustrated effects" (§9) and the film's graphic FX |
| **C. Directional screen-space streaks** | Blur a "lit haze" mask along the projected sun direction (the vanishing point is off-screen, so streaks are nearly parallel); 16–32 taps at ½ res | 0.4–0.8 ms | Possible, but streaks slide with the camera. Second choice |
| **D. Babylon 9 `FrameGraphVolumetricLightingTask`** **[V-doc]** | Extruded light volumes generated from a directional light's shadow map (`FrameGraphLightingVolumeTask`), rendered additively against scene depth, with `phaseG`, `extinction` and `lightPower`. Frame graph only. On WebGL the shadow map is read back and the volume updated on the CPU; the docs suggest `frequency = 4` and `tesselation = 256` on WebGL vs 1 and 1024 on WebGPU ([docs](https://doc.babylonjs.com/features/featuresDeepDive/lights/volumetricLightScattering#the-volumetric-lighting-task), based on GPU Zen 1 and [NVIDIA's GDC slides](https://d29g4g2dyqv443.cloudfront.net/sites/default/files/akamai/gameworks/downloads/papers/NVVL/Fast_Flexible_Physically-Based_Volumetric_Light_Scattering.pdf)) | 0.5–1.5 ms (rasterising front and back faces of a screen-covering volume) | **Cinematic tier now; game tier on WebGPU.** For a static sun the volume can be built once, so the WebGL readback cost is paid once |

```glsl
// option A: average sun visibility of the air column between surface and mist top
float airSun(vec3 p, vec3 ro){
  float s = 0.0;
  for (int i = 0; i < 3; i++) {                     // 3 heights inside the mist band
    float h = (float(i) + 0.5) / 3.0 * uMistTop;
    vec3 q = mix(p, ro, h / max(ro.y - p.y, 1.0));  // point on the view ray at height ~h
    vec2 g = q.xz - uSunDir.xz / uSunDir.y * (q.y - p.y);   // where the sun ray through q hits the ground
    s += texture2D(uLightMap, worldToLM(g)).r;      // baked visibility (1 = lit)
  }
  return s / 3.0;
}
```

**Pitfall.** Shafts must stay subtle and never hide units. Clamp
`mist × (1 − airSun)` contrast.

### 3.8 Painterly image filters: Kuwahara and cheaper alternatives

**What they are.**
- **Classic / generalized Kuwahara**: per pixel, compute mean and variance in *n* sectors and output the mean of the least-variance sector. It flattens regions into "dabs" and keeps edges.
- **Anisotropic Kuwahara** (Kyprianidis, Kang, Döllner 2009): sectors follow the **smoothed structure tensor**, giving "a painting-like flattening effect along the local feature directions while preserving shape boundaries". The GPU version "processes video in real-time", and the authors report temporally coherent results without extra processing ([EG digital library](https://diglib.eg.org/handle/10.2312/CGF.v28i7pp1955-1963)) **[V-doc]**.
- **Polynomial weighting** (Kyprianidis, Semmo, Kang, Döllner 2010): replaces the convolution-based (texture-sampled) sector weights with polynomial ones "computed directly during the filtering in real-time" at similar quality ([EG](https://diglib.eg.org/items/9865e5fe-3d23-470e-8cf6-e571bebafb9b)) **[V-doc]**.

**Cost [E].** Generalized Kuwahara with 8 sectors and radius r: about (2r+1)²
fetches per pixel, so r = 4 means 81 fetches and ~1,000+ ALU ops.

| Variant | Passes | Cost at 1080p, M1-class |
|---|---|---|
| Generalized Kuwahara, r = 4 | 1 | 2–4 ms |
| Anisotropic Kuwahara | 3–4 (structure tensor with Sobel, 2× tensor blur, then the filter) | 3–6 ms |
| Anisotropic at ½ res + upsample | | 1–2 ms, but it smears our world-space grain |

I found no published WebGL timings for comparable hardware; these are fetch-count
estimates.

**Why not in the game tier.**
1. The art bible says the look must not come from a full-screen filter.
2. **Temporal flicker**: sector selection is a hard minimum, so a pixel's winning sector flips as grain or geometry moves sub-pixel. Panning shimmers unless you add soft-min weighting, temporal AA or both.
3. **Shower-door effect**: screen-space strokes don't move with the world when the camera pans. Meier's 1996 painterly animation paper named this problem ([Meier 1996](https://course.khoury.northeastern.edu/cs5310sp13/resources/readings/meier-painterly.pdf)) **[V-doc]**.
4. It erases the brush library work: world-space grain, stamps, edge breakup.

**Cheaper alternatives, best first.**

| Alternative | Cost **[E]** | Notes |
|---|---|---|
| **World-space brush stamps in the material** (docs/art-bible.md §7), scaled up with distance from focus | Fetches already paid | The film's "stamp maps" and periphery treatment ("objects further on the peripheral sides of the frame ... more impressionistic") ([AWN](https://www.awn.com/animationworld/puss-boots-last-wish-returns-its-fairy-tale-illustration-roots)) **[V-doc]**. No temporal issues |
| Edge-aware 5×5 bilateral on far / out-of-focus regions only (masked by depth or `uFocus` distance) | 0.4–0.8 ms | Softens detail without a filter look; cinematic tier |
| Posterize in luma (quantise L, keep chroma) | ≈0 ms fused | Reads as a Photoshop filter; avoid |
| Structure-tensor flow + line-integral-convolution strokes / XDoG (Winnemöller, Kyprianidis, Olsen 2012, [PDF](https://users.cs.northwestern.edu/~sco590/winnemoeller-cag2012.pdf)) | 2–5 ms, 3–5 passes | Cinematic tier at most |
| Paper / canvas texture overlay | ≈0.02 ms fused | Keep amplitude low (≤3–5 %) because of shower door; see §3.13 |

**Cinematic tier recipe.** Anisotropic Kuwahara, r ≈ 3–5, with polynomial
weights, **masked to the frame periphery and far depth**, applied before the paper
overlay, with temporal accumulation (§2.3) hiding sector flicker.

### 3.9 Edges and outlines ("graphic ink")

**Options** (Ameye's survey: rim / fresnel, vertex extrusion, blurred buffer,
jump flood, edge detection; Roberts cross is 4 samples, Sobel 9; edge detection
needs depth-scaled thresholds and grazing-angle masks;
[ameye.dev](https://ameye.dev/notes/rendering-outlines/)) **[V-doc]**:

| Method | Cost **[E]** | Fit |
|---|---|---|
| **Depth-only Roberts cross in the uber pass** (depth from alpha), fading with distance | 0.15–0.3 ms | Silhouettes of crowns, roofs and units against the ground. Sable's outlines "gradually fade out as they become more distant" ([Game Developer](https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability)) **[V-doc]** |
| Depth + normal Sobel | +MRT normal target (bandwidth), 0.3–0.6 ms | Inner creases. Too "comic" for the Last Wish look |
| **Inverted hull for units only** (vertex extrusion) | Vertex cost only | Readability of formations; Guilty Gear Xrd's approach ([GDC 2015](https://gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The), [slides](https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf)) **[V-doc]** |
| Babylon 9 `SelectionOutlineLayer` **[V-doc]** | Depth/ID mask + merge pass | Built for selection feedback ([docs](https://doc.babylonjs.com/features/featuresDeepDive/mesh/selectionOutlineLayer)). Use it for **selected units**, not for style |

**Recommendation.** The Last Wish's edge treatment is *edge breakup* and *graphic
rims*, not ink lines (SIGGRAPH 2023 production session,
[history.siggraph.org](https://history.siggraph.org/?p=131616)) **[V-doc]**. Keep
ink edges **off** by default. Test depth-only edges at low opacity in the
cool shadow colour (not black), mainly for readability at max zoom-out.

```glsl
// depth-only Roberts cross on alpha-encoded view depth; returns 0..1 edge
float edgeDepth(vec2 uv){
  vec2 t = uTexel;
  float a = abs(texture2D(textureSampler, uv).a),           b = abs(texture2D(textureSampler, uv + t).a);
  float c = abs(texture2D(textureSampler, uv + vec2(t.x, 0.)).a), d = abs(texture2D(textureSampler, uv + vec2(0., t.y)).a);
  float e = abs(a - b) + abs(c - d);
  return smoothstep(0.004, 0.012, e / max(a, 1e-4)) * (1.0 - smoothstep(0.25, 0.6, a));   // relative threshold, fades far away
}
```

**Pitfall.** Discard-edged crowns produce noisy depth edges. Threshold relative
to depth (above) and blur-free; test against the grain.

### 3.10 The uber finishing pass (fusing everything into one)

**Why.** In Babylon's `DefaultRenderingPipeline`, each enabled effect is its own
full-screen pass in this order: DoF passes, bloom passes, image processing,
sharpen, grain, chromatic aberration, FXAA **[V-src, `_buildPipeline`]**. With
grain + CA + sharpen + FXAA on top of image processing, that is 5 full-res passes,
**≈1.5–3 ms of mostly bandwidth on M1 [E]**. One custom pass does it all for
≈0.5–0.9 ms.

**Depth for free: write view depth into alpha.** Every surface uses our
`ShaderMaterial`s and the scene is opaque, so alpha is unused. Render into an
**RGBA16F** target and write `viewDepth / far` into alpha. **Army pixels write
the negative value** so the finishing pass can protect their saturation. There is
no depth renderer and no second scene pass.

```glsl
// vertex: varying float vDepth;  ... gl_Position = viewProjection * w; vDepth = gl_Position.w;
// fragment (terrain/vegetation):  gl_FragColor = vec4(c, vDepth / uFar);
// fragment (army units):          gl_FragColor = vec4(c, -vDepth / uFar);
// and set scene.clearColor.a = 1.0 (far)
```

**The pass** (WebGL2; Babylon converts GLSL ES 1-style `texture2D` code for
WebGL2 automatically; the `sampler3D` line needs GLSL 3.0 semantics, so verify it
compiles in your Babylon build or fall back to the 2D-strip LUT **[U]**):

```glsl
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;   // the uber PP's input (blur/bloom chain output) – see wiring
uniform sampler2D sceneSampler;     // original scene: rgb colour, a = ±viewDepth/far
uniform sampler2D bloomSampler;     // dual-filter result (1/2 res)
uniform highp sampler3D uLutA, uLutB;
uniform sampler2D uBlueNoise, uPaper;
uniform vec2 uRes, uTexel; uniform float uLutMix, uBloom, uVig, uPaperAmt, uEdgeAmt;
uniform vec3 uVigCol, uEdgeCol;

vec3 shoulder(vec3 c){ float m=max(c.r,max(c.g,c.b)); if(m<=0.8) return c;
  float mm=0.8+0.2*(1.0-exp(-(m-0.8)/0.2)); return c*(mm/m); }
vec3 lut(highp sampler3D L, vec3 c){ return texture(L, c*(31.0/32.0)+0.5/32.0).rgb; }

void main(){
  vec4 s = texture2D(sceneSampler, vUV);
  bool army = s.a < 0.0;  float d = abs(s.a);
  vec3 c = s.rgb + texture2D(bloomSampler, vUV).rgb * uBloom;
  // optional graphic edge (3.9), tinted with the cool shadow colour, never black
  // c = mix(c, uEdgeCol, edgeDepth(vUV) * uEdgeAmt);
  c = shoulder(c);
  vec3 g = mix(lut(uLutA, c), lut(uLutB, c), uLutMix);   // season / time-of-day blend
  c = army ? mix(c, g, 0.35) : g;                        // armies keep their saturation
  vec2 q = (vUV - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  c = mix(c, c * uVigCol, smoothstep(0.35, 0.95, length(q)) * uVig);   // cool vignette
  float paper = texture2D(uPaper, gl_FragCoord.xy / 512.0).r - 0.5;   // static, low amplitude
  c *= 1.0 + paper * uPaperAmt;
  vec2 bn = texture2D(uBlueNoise, gl_FragCoord.xy / 64.0).rg;          // triangular blue-noise dither
  c += (bn.x + bn.y - 1.0) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
```

**Babylon wiring (classic API).**

```js
const T=BABYLON.Constants;
// the scene renders into the INPUT of the first post-process: make it HDR + MSAA there
// 3-argument form (name, fragmentUrl, PostProcessOptions): `size` is the ratio of this PP's INPUT texture [V-src]
const down1=new BABYLON.PostProcess('down1','dualDown',{uniforms:['hp'],size:1.0,textureType:T.TEXTURETYPE_HALF_FLOAT,camera});
down1.samples=4;                                   // MSAA where the scene is actually drawn
// ...down2..down4, up3..up1 as PostProcess objects with size ratios 0.5, 0.25, 0.125, ...
const uber=new BABYLON.PostProcess('uber','uber',{camera,size:1.0,
  uniforms:['uRes','uTexel','uLutMix','uBloom','uVig','uPaperAmt','uEdgeAmt','uVigCol','uEdgeCol'],
  samplers:['sceneSampler','bloomSampler','uLutA','uLutB','uBlueNoise','uPaper']});
uber.onApply=e=>{e.setTextureFromPostProcess('sceneSampler',down1);    // = scene colour+depth (down1's input)
  e.setTextureFromPostProcessOutput('bloomSampler',up1);               // bloom result
  /* set LUTs, noise, uniforms */};
```

**Frame Graph version (preferred long-term, §4.3).**
`FrameGraphObjectRendererTask` (main pass, RGBA16F target + depth) →
`FrameGraphCustomPostProcessTask` ×N (bloom) → custom uber task whose
**target is the back buffer**. The FAQ notes this avoids the final texture copy
and allocation ([Frame Graph FAQ](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphFAQ)) **[V-doc]**.
The object renderer also exposes `outputDepthTexture`, a real depth attachment
you can sample, if you'd rather not use the alpha trick **[V-doc]**.

### 3.11 Ambient occlusion: cheaper than SSAO2, and more painterly

**Why replace SSAO2 here.**
1. Cost: see §5.1. As configured it forces a G-buffer re-render of the whole scene **[V-src]**.
2. Mismatch: the G-buffer pass uses its own shader and handles alpha test only through a material's *alpha-test texture* (`needAlphaTestingForMesh && getAlphaTestTexture()`) **[V-src, `geometryBufferRenderer.pure.js`]**. Our procedural crown `discard` is ignored, so AO is computed from un-broken silhouettes.
3. Look: SSAO is a computed, view-dependent darkening. The art bible wants *painted* shadow shapes in a cool hue (§4).

**Alternatives, cheapest first.**

| Method | Bake / runtime | Cost **[E]** | Use for |
|---|---|---|---|
| **Per-vertex AO for vegetation** (already: `vOcc` from crown centre) | Runtime, vertex | ~0 | Crown interiors, grass bases |
| **Heightfield horizon AO, baked** into the light map G channel: per texel, 8 azimuths × 8–16 steps over a height texture | Bake once (GPU pass over a 2048² target ≈ tens of ms) | 0 at runtime (shares the light-map fetch) | Valleys, stream banks, hill feet. Timonen's line-sweep reduces horizon-map generation to O(1) per receiver if a larger map is needed ([Line-Sweep Ambient Obscurance](https://diglib.eg.org/items/15b59d27-b234-4406-a50a-f4031d335895), [thesis](https://www.doria.fi/handle/10024/95729)) **[V-doc]** |
| **Canopy / object footprints**: render tree crowns and houses top-down into the AO channel, blurred, then paint them in | Bake once | 0 | Woods darken the ground around them; "contact" under trees and houses |
| Unit contact: soft painted blob under each unit (decal) or per-instance AO from the light map at the unit's position | Runtime, vertex / decal | ~0 | Units (dynamic) |
| Screen-space AO at quarter res from depth-in-alpha (no G-buffer) | Runtime | 0.5–1 ms | Only if player-built structures need dynamic contact AO |
| Screen-space contact shadows (Bend Studio; open code; complement shadow maps with small detail) ([Bend blog](https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/)) **[V-doc]** | Runtime | 0.5–1.5 ms | Not needed at 45–260 m camera distance |

**The terrain light map (one RGBA8 texture, world XZ).**
- R = sun visibility, painted edges
- G = AO (horizon + canopy)
- B = valley-mist mask
- A = free (e.g. wetness or cliff mask)

At 2048² over the 520 m detailed area that is ≈25 cm per texel, plus a 512²
version for the far ring.

```js
// bake sketch: orthographic top-down camera over the play area, render terrain once with a bake shader
const lmCam=new BABYLON.FreeCamera('lm',new BABYLON.Vector3(0,400,0),scene);lmCam.setTarget(new BABYLON.Vector3(0,0,0.001));
lmCam.mode=BABYLON.Camera.ORTHOGRAPHIC_CAMERA;Object.assign(lmCam,{orthoLeft:-260,orthoRight:260,orthoTop:260,orthoBottom:-260,minZ:1,maxZ:800});
const lm=new BABYLON.RenderTargetTexture('lightmap',2048,scene,true);         // RGBA8 + mips
lm.activeCamera=lmCam;lm.renderList=[nearTerrain];lm.setMaterialForRendering(nearTerrain,bakeMat);
lm.refreshRate=BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;scene.customRenderTargets.push(lm);
// bakeMat fragment: 32-tap grain-jittered PCF against the existing sun depth map -> R,
// 8x12 horizon steps on a height texture + canopy footprint texture -> G, valley mask -> B.
// After the first frame: dispose the 4096^2 sun depth map if units don't need it.
```

**Pitfall.** Re-bake when the sun preset or season changes (seconds at most).
Destructible or player-built structures need a small dynamic layer (decals) on top.

### 3.12 Shadows: the per-pixel cost today, and cheaper forms

- **Baked** (above): one fetch, painted edges. **Best for the static world.**
- **Hardware PCF**: if a runtime shadow map is still needed (dynamic sun later), use a **depth texture with compare mode**. In WebGL2 a `sampler2DShadow` lookup returns 2×2 bilinear-filtered PCF in **one fetch**. Babylon: `RenderTargetTexture.createDepthStencilTexture(comparisonFunction, bilinearFiltering, …)` **[V-src]**. A 2048² depth texture is 16 MB, versus ≈256 MiB for today's 4096² RGBA32F colour target.
- Hi-Fi Rush (60 fps, native resolution) combined a **static shadow map** for the environment with dynamic maps (GDC 2024 "3D Toon Rendering in Hi-Fi RUSH", [GDC Vault](https://gdcvault.com/play/1034330/3D-Toon-Rendering-in-Hi), [80.lv](https://80.lv/articles/the-making-of-hi-fi-rush-s-3d-toon-rendering-style)) **[V-doc]**. The same static/dynamic split applies here.
- Ori and the Will of the Wisps' artists hand-painted light direction maps per asset (≈30,000), to avoid a "plasticky look" ([TheGamer, interview-based](https://www.thegamer.com/ori-and-the-will-of-the-wisps-artists-hand-painted-30000-light-maps/); talk: [GDC Vault](https://gdcvault.com/play/1027035/The-Art-of-Ori-and)) **[V-doc, secondary]**. That is precedent for authored, baked painterly light over computed light.

### 3.13 Dithering, grain and paper (and how not to shimmer)

**Dithering.** Smooth haze, mist and vignette gradients in 8-bit output band
visibly, exactly where our look lives.
- INSIDE showed how artwork "can be saved from drowning in color-banding by properly using dithering" ([GDC 2016](https://gdcvault.com/play/1023002/Low-Complexity-High-Fidelity-INSIDE)) **[V-doc]**.
- Use **blue-noise, triangular-PDF dither of ±1 LSB** as the very last operation ([Wronski series](https://bartwronski.com/2016/10/30/dithering-in-games-mini-series/), [Peters' free blue-noise textures](https://momentsingraphics.de/BlueNoise.html)) **[V-doc]**. Cost: one fetch of a 64² texture, ≈0.01 ms **[E]**.
- Babylon has `imageProcessingConfiguration.ditheringEnabled` / `ditheringIntensity` (white noise via `getRand`) **[V-src]**; only useful if you use Babylon's image-processing pass.

**Grain.**
- Keep the **paint grain in world space in the materials** (already done). It moves with the world, so there is no shower door.
- Shimmer risk: at 45–260 m the 512² grain tiles every 5.5 m and gets heavily minified. Mipmaps are on (trilinear plus anisotropic 8). Also fade the finest grain layer's amplitude with distance (or with `fwidth(wp.xz)`), so far pixels don't alias, and **skip** those fetches beyond a distance (saves time too).
- Screen-space paper: **static** (not animated), ≤3–5 % amplitude. Babylon's `GrainPostProcess` (`animated` option) is film noise; it reads as a camera, not paint. Leave it off.
- Okami's "paper filter" overlay is the famous precedent; a full-strength overlay is too heavy for our "light finishing pass" rule **[U]**: secondary sources only.

### 3.14 Chromatic aberration, sharpen, FXAA

- **Chromatic aberration**: the film used "camera lensing and a chromatic aberration effect" only for specific emotional moments ([SIGGRAPH blog](https://blog.siggraph.org/?p=17519)) **[V-doc]**. Skip it in the game; maybe for trailer beats.
- **Sharpen**: unnecessary at native resolution. With FSR1, RCAS already sharpens (`sharpnessStops`).
- **FXAA**: use MSAA on the main pass instead (Apple GPUs resolve MSAA on-tile, and the scene is geometry-edge dominated). If MSAA is too costly on a GTX-class laptop at 1440p, an FXAA-style edge filter can be **fused** into the uber pass rather than run as a separate one.

---

## 4. Babylon.js 9.x specifics

### 4.1 Built-ins: cheap vs expensive here

| Feature | Verdict | Why |
|---|---|---|
| `DefaultRenderingPipeline.imageProcessing` (curves, LUT, contrast, exposure, vignette, dither) | **OK, but prefer our uber pass** | One pass, but `ShaderMaterial`s need the HDR / post-process path **[V-src]** |
| `DefaultRenderingPipeline` bloom | Medium | Extract + 2 separable Gaussian passes (kernel 64) + merge **[V-src]**; dual filter is cheaper |
| `DefaultRenderingPipeline` DoF | **Expensive here** | Enables the depth renderer (a second scene render), and ignores our `discard` **[V-src]** |
| Grain, chromatic aberration, sharpen, FXAA | Each is a separate full-res pass | ≈0.3–0.6 ms each on M1 **[E]**; fuse instead |
| `SSAO2RenderingPipeline` | **Expensive here** | Prepass renderer (needs MRT outputs from materials; our `ShaderMaterial`s write only `gl_FragColor`) or forced geometry buffer (whole-scene re-render) **[V-src]** + colour copy + SSAO + 2 blurs + combine |
| `VolumetricLightScatteringPostProcess` | Not suitable | Needs a light-source mesh on screen, an extra internal pass, 100 samples default **[V-doc]** |
| `FrameGraphVolumetricLightingTask` (9.0) | Cinematic now, game on WebGPU | Frame-graph-only; WebGL path reads back the shadow map on the CPU **[V-doc]** |
| `FSR1RenderingPipeline` | **Recommended** | Spatial upscaler; presets `SCALE_ULTRA_QUALITY` 1.3, `SCALE_QUALITY` 1.5, `SCALE_BALANCED` 1.7, `SCALE_PERFORMANCE` 2; WebGL2 + WebGPU ([docs](https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/fsr1RenderingPipeline)) **[V-doc, V-src]** |
| `TAARenderingPipeline` | Cinematic tier helper | Temporal AA exists **[V-src]**; for exports, explicit sub-frame accumulation is simpler and exact |
| Thin instances | **Good**, but chunk them | Culling uses **one bounding box for all instances** of a mesh ([docs](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances)) **[V-doc]** |
| KTX2 (Basis Universal: ETC1S / UASTC) | **Use for the brush library** | GPU-compressed textures save memory and give "better performance by reducing cache misses" ([docs](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/ktx2Compression)) **[V-doc]**. Use **UASTC** for grain data (ETC1S "does not work as well on data that are not true color data") |
| `EngineInstrumentation.captureGPUFrameTime` / `gpuFrameTimeCounter` | **Use to measure** | **[V-src]**; needs `EXT_disjoint_timer_query_webgl2`, which some browsers or platforms don't expose. Fall back to A/B toggles and Spector.js captures |
| Clustered lighting (9.0) | Not relevant now | Many lights; we have one sun ([docs](https://doc.babylonjs.com/features/featuresDeepDive/lights/clusteredLighting)) |
| Physically Based Atmosphere addon (9.0) | Not suitable | Sky and aerial perspective, physically based ([docs](https://doc.babylonjs.com/addons/atmosphere)); we have no sky and want painted falloff |

### 4.2 New in 9.0 that matters

From the official announcement ([Windows Developer Blog, 26 Mar 2026](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/))
and the 9.0.0 changelog in the docs repo ([BabylonJS/Documentation `whats-new.md`](https://github.com/BabylonJS/Documentation/blob/master/content/whats-new.md)) **[V-doc]**:

- **Frame Graph v1**: a DAG of render tasks with automatic texture allocation and reuse ("GPU memory savings ... 40% or more in some cases"), plus the **Node Render Graph Editor** for building it visually.
- **Volumetric Lighting** task (above).
- **Outline Renderer** (`SelectionOutlineLayer`) for selection feedback.
- Clustered lighting, textured area lights, Node Particle Editor, particle flow maps and attractors, Gaussian splat improvements, Physically Based Atmosphere, Inspector v2.
- In `@babylonjs/core` 9.29 the frame graph task list includes `FrameGraphCustomPostProcessTask`, `FrameGraphBloomTask`, `FrameGraphDepthOfFieldTask`, `FrameGraphImageProcessingTask`, `FrameGraphTonemapTask`, `FrameGraphSSAO2RenderingPipelineTask`, `FrameGraphTAATask`, `FrameGraphGeometryRendererTask`, `FrameGraphShadowGeneratorTask`, `FrameGraphLightingVolumeTask` and `FrameGraphVolumetricLightingTask` ([task list](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList)) **[V-src, V-doc]**.

### 4.3 Frame Graph for this project

- **Why**: explicit passes, so bloom, uber and FSR are separate tasks wired by texture handles, not by the implicit "each post-process owns its input" rule. Texture aliasing saves VRAM (useful on 8 GB unified-memory Macs). The last post-process writes straight to the back buffer (no copy). The same graph carries over to WebGPU.
- **Main pass**: `FrameGraphObjectRendererTask` with an RGBA16F `targetTexture` and a `depthTexture`; set `isMainObjectRenderer = true` (FAQ).
- **Bloom and uber**: `FrameGraphCustomPostProcessTask`s, with `onApplyObservable` to set uniforms ([docs](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList)).
- **Pitfalls (FAQ)**: set `scene.frameGraph` before `buildAsync()`; `record()` may be called again on resize, so clean up observers; set sampling modes in `additionalExecute`, not `additionalBindings` ([FAQ](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphFAQ)) **[V-doc]**.
- **Migration advice**: keep the classic chain for prototypes. Move to a Frame Graph once the pass list stabilises.

### 4.4 Could not verify

- **[U]** Whether `sampler3D` and `texture()` in a classic `PostProcess` fragment compile without extra directives in every Babylon 9 WebGL2 path. Babylon's own image processing uses `texture(txColorTransform, …)` under `COLORGRADING3D`, so it should, but test it. Fallback: 2D-strip LUT with two fetches.
- **[U]** Real GPU timings for any of this on M1 or GTX 1650. All ms figures are estimates; measure with `gpuFrameTimeCounter` where available.
- **[U]** No AgX in Babylon 9.29 **[V-src]**; whether one is planned is unknown.

---

## 5. Performance fixes for `painted-hybrid.html` (prioritised)

Scene size, counted by running the prototype's own scatter code in Node: **6,749
instances, ≈2.05 M triangles of vegetation and rocks**. Breakdown:
- 2,831 `Grass_Short` × 192 tris
- 2,344 far `Bush_1`/`Bush_2` (≈740 k tris for features 200–640 m away)
- 568 `Wheat` × 408
- 351 `Flowers` × 408
- 492 `Plant_1` × 296

Plus terrain ≈ 240 k triangles. Everything is drawn every frame
(`alwaysSelectAsActiveMesh = true`, one instance buffer per model).

### 5.1 Remove SSAO2 (biggest single win) **[V-src]**

```js
new B.SSAO2RenderingPipeline('ssao',scene,{ssaoRatio:0.5,blurRatio:0.5},[camera],true)
//                                                                              ^ forceGeometryBuffer
```

The 5th constructor argument is `forceGeometryBuffer`, which calls
`scene.enableGeometryBufferRenderer()`. That **re-renders every mesh and thin
instance** into a depth+normal MRT every frame, on top of the main pass.

Then, per frame:
1. A full-res colour copy (`SSAOOriginalSceneColor`)
2. The SSAO pass (8 samples) into a half-res target (`ssaoRatio` sizes the blur's input)
3. Two bilateral blurs at half res
4. A combine pass

Estimated total: **≈4–10 ms on M1 [E]**, mostly the geometry re-render of
≈2.3 M small triangles. The G-buffer also ignores the crown `discard`, so AO
doesn't match the painted silhouettes. Replace it with the baked AO and per-vertex
occlusion (§3.11).

(Without `forceGeometryBuffer`, SSAO2 uses the prepass renderer, which expects
materials to write MRT outputs (`glFragData`); our `ShaderMaterial`s don't.)

### 5.2 Fix render resolution

`engine.setHardwareScalingLevel(1/Math.min(devicePixelRatio,1.5))` shades up to
**2.25×** the pixels of DPR 1. Options:
- `setHardwareScalingLevel(1)`: CSS-pixel rendering.
- Or add `FSR1RenderingPipeline` with `SCALE_ULTRA_QUALITY` (1.3) on Retina screens.

Also consider a dynamic render scale driven by frame time.

### 5.3 Shadow map: size, format, fetches

- The `RenderTargetTexture('shadowRT',4096,scene,false,true,TEXTURETYPE_FLOAT)` uses the default RGBA format: **4096² × 16 B ≈ 256 MiB** of colour, plus its depth buffer, to store one depth value. Use `TEXTUREFORMAT_R` (R32F or R16F) at 2048², or better a depth texture with compare (§3.12), or bake (§3.11) and dispose it.
- Per pixel today: 2 grain-jitter fetches plus 4 NEAREST taps. Reuse the grain value already fetched in `paint()` for the jitter, or switch to one `sampler2DShadow` fetch.
- 520 m / 2048 ≈ 25 cm per texel is plenty for a 45–260 m camera.

### 5.4 Put MSAA where the scene is drawn **[V-src]**

- The engine is created with `antialias:true`, which only affects the default framebuffer, where nothing but the final full-screen quad is drawn.
- `fin.samples=4` sets MSAA on the finishing pass's *input*, which with AO on is written by SSAO's combine pass (a full-screen quad, nothing to antialias).
- With AO on, the scene renders into the SSAO colour-copy pass input, which has `samples = 1`, so **the scene has no MSAA**.

Fix: `antialias:false`; set `samples = 4` on the **first** post-process in the
chain; drop `preserveDrawingBuffer:true` except in export mode.

### 5.5 Cut terrain texture fetches from ≈20–25 to ≈6–8 per pixel

Count today (terrain):
- `albedo()` ≈10 fetches
- `paint()`: 2 grain fetches + `cloud()` (3 fetches) called twice; compilers usually CSE it, but don't rely on that
- `shadowAt()` 6 fetches
- `snowAt()` 1 more in winter
- `finish` pass: 2 more

Fixes:
1. **Bake the static terrain albedo** (meadow / dry-gold / hollow masks, flower patches, roads, field IDs, streak strength) into a world-space RGBA texture at load, with the season mixing staying ALU on top of the masks. That turns ~10 fetches into 1–2.
2. Call `cloud()` once and pass the value around. Optionally compute the low-frequency cloud field per vertex (1.7 m terrain spacing is fine for 100 m-scale shapes) and keep only the grain-broken edge per pixel.
3. Shadow and AO: 1 light-map fetch (§3.11).
4. Split the grain texture. Keep the fine R channel with anisotropic 4 (8 is overkill at 40–55° pitch). Move the low-frequency blotch and streak channels to a smaller texture with **no anisotropy** (anisotropic filtering can multiply the taps per fetch at grazing angles).
5. Distance LOD: skip the finest grain fetch and flower flecks beyond ~150 m (branch on distance; it is coherent across screen regions).

### 5.6 Vegetation overdraw, `discard` and culling

- **TBDR and `discard`.** Apple's guidance for its tile-based deferred GPUs is to "draw as much of the frame with opaque content as possible and minimize use of blending, alpha testing, and the discard instruction". Hidden-surface removal can't skip fragments for draws that discard ([Apple, OpenGL ES platform notes](https://developer.apple.com/library/content/documentation/OpenGLES/Conceptual/OpenGLESHardwarePlatformGuide_iOS/OpenGLESPlatforms/OpenGLESPlatforms.html)) **[V-doc]**. Fixes:
  - Draw all discard materials **after** opaque ones (`renderingGroupId = 1` and `scene.setRenderingAutoClearDepthStencil(1, false)`).
  - Use the discard path only on the near LOD; far crowns use an opaque variant whose edge breakup is painted in colour, not cut.
- **Far bushes.** 2,344 instances × ≈316 tris, each 2–6 px on screen: micro-triangles shade 2×2 quads wastefully. Replace them with a painted "woods" mask in the terrain albedo (dark rounded dab texture) plus sparse impostor billboards, or merge clusters into a few low-poly "wood mass" meshes.
- **Grass tufts at zoom-out.** Fade `Grass_Short` and `Flowers` out beyond ~90–120 m (the terrain's own streak and fleck strokes carry the read), or swap to cheap cross-quads.
- **Chunk the thin instances** into spatial tiles (e.g. 64 m), with one mesh per model per tile, and remove `alwaysSelectAsActiveMesh`. Off-screen tiles then cull, because thin-instance culling is per mesh, not per instance **[V-doc]**.
- **Far terrain ring.** It is sunk 25 m under the detailed terrain inside the inner area but still rasterised there. Cut a hole in its index buffer to avoid hidden fragments if it ever draws first.

### 5.7 Smaller items

- `scene.skipPointerMovePicking = true` (camera-only controls).
- `scene.freezeActiveMeshes()` after load (static world).
- Batch the per-frame uniform updates (8 materials × 9 setters) into a shared UBO later; that is CPU-side and minor.
- The finishing pass reads the grain texture at `vUV*uRes/512`. Fold it into the uber pass's paper fetch.

### 5.8 Measure before and after

- Enable `new BABYLON.EngineInstrumentation(engine).captureGPUFrameTime = true` and log `gpuFrameTimeCounter.lastSecAverage` (where the timer extension exists).
- A/B each toggle at a fixed camera, at 1080p and 1440p, DPR 1.
- Capture one frame in Spector.js to confirm the pass list: expected after fixes = main pass, bloom ×8 tiny, uber, (FSR).

---

## 6. What shipped stylised work does, and what translates

| Work | What's documented | Real-time translation for us | Source quality |
|---|---|---|---|
| **Puss in Boots: The Last Wish** (DreamWorks, 2022) | SIGGRAPH 2023 production session: "edge breakup, graphic rims, textured FX, sharpened cloth folds". Edge breakup via a tool that broke "standard CG model edges with looser rendered points to approximate the imperfections of paintbrushes". "Cheated rim lights with bold color choices". "Stylized depth of field bokeh elements". Stamp maps plugged into individual shading components. Atmosphere as "a 3D version of paint strokes ... rendered as a separate pass and then composited in". Periphery "more impressionistic". Chromatic aberration only for specific moments. Mostly on 1s, stepped in action | All material-side: world-space grain thresholds at grazing angles (done), graphic rim (done), stamp textures, looser strokes away from focus, painted mist cards; stepped 12 fps units. Post: only grade, bloom and paper | [SIGGRAPH history](https://history.siggraph.org/?p=131616), [SIGGRAPH blog](https://blog.siggraph.org/?p=17519), [befores & afters](https://beforesandafters.com/2023/01/11/heres-how-dreamworks-lent-a-whole-new-brand-of-stylized-look-and-feel-to-puss-in-boots-the-last-wish), [AWN](https://www.awn.com/animationworld/puss-boots-last-wish-returns-its-fairy-tale-illustration-roots) **[V-doc]** |
| **Spider-Verse** (Sony Imageworks) | Look "created almost entirely in comp" (Nuke); Hatcher and Thresher for halftone and hatching; 25+ tools (ink lines, offset colour); ChromaShifter colour offset used for DoF | Halftone and hatching are not our look. Colour-offset-instead-of-blur is a cheap stylised DoF for trailers. Lesson: stylisation tools are many *small, art-directable* passes, and real time should fuse them | [Foundry](https://www.foundry.com/insights/film-tv/graphic-look-in-comp-spiderman) **[V-doc]** |
| **Tiny Glade** (Pounce Light) | GPC 2024: custom engine; "real-time global illumination to tilt-shift DoF and stable shadows with continuous time of day"; heavy ray marching; runs on ~10-year-old GPUs | Proof that tilt-shift sells a diorama, but their GI and ray-marching budget isn't ours. We bake instead | [GPC archive](https://graphicsprogrammingconference.com/archive/2024/), [talk video](https://www.youtube.com/watch?v=jusWW2pPnA0) **[V-doc]** |
| **Sable** (Shedworks) | Flat shading + lighting/shadows + distant fog + lines; outlines fade with distance | Distance-faded depth edges (§3.9); fog as a readability tool (§3.4) | [Game Developer, GDC 2022 coverage](https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability) **[V-doc]** |
| **Hi-Fi Rush** (Tango) | Deferred toon renderer in custom UE4 at 60 fps, native res; static shadow map + dynamic shadow strategies; light-probe GI; comic shader | Static/dynamic shadow split, i.e. bake the world, paint the units (§3.12) | [GDC Vault](https://gdcvault.com/play/1034330/3D-Toon-Rendering-in-Hi), [80.lv](https://80.lv/articles/the-making-of-hi-fi-rush-s-3d-toon-rendering-style) **[V-doc]** |
| **Breath of the Wild** | GDC 2017 "Change and Constant" (Fujibayashi, Takizawa, Dohta): art direction influenced by Wind Waker; painterly look chosen for readability at distance | Readability-first painterly simplification at distance. Our "looser away from focus" rule | [Zelda Universe](https://zeldauniverse.net/2017/03/14/takizawa-explains-how-the-wind-waker-hd-inspired-the-visual-style-for-breath-of-the-wild/), [Thumbsticks](https://www.thumbsticks.com/gdc17-designing-zelda-breath-of-the-wild/) **[V-doc, secondary]**. No primary rendering breakdown found **[U]** |
| **Ori and the Will of the Wisps** | Hand-painted light direction maps per asset (≈30 k), artists painting light and shadow over asset groups | Authored, baked light beats computed light for a painted look. Supports baking with painted edges | [GDC Vault](https://gdcvault.com/play/1027035/The-Art-of-Ori-and), [TheGamer](https://www.thegamer.com/ori-and-the-will-of-the-wisps-artists-hand-painted-30000-light-maps/) **[V-doc, secondary]** |
| **Guilty Gear Xrd** (Arc System Works) | Inverted-hull outlines; artist-controlled shadow thresholds via vertex data | Per-vertex "chosen" shading controls; inverted hull for units if they need outlines | [GDC Vault](https://gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The), [slides](https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf) **[V-doc]** |
| **INSIDE** (Playdead) | Dithering against banding; local shadowed volumetrics | Blue-noise dither as the last op (§3.13) | [GDC Vault](https://gdcvault.com/play/1023002/Low-Complexity-High-Fidelity-INSIDE) **[V-doc]** |
| **Townscaper / Bad North** (Oskar Stålberg) | A lighting experiment using SDFs, 3D textures and depth-map shadows to get light bounce | A small 3D texture of baked light is a cheap world-space lighting store; it informs the "baked sun-visibility" idea | [80.lv](https://80.lv/articles/a-custom-lighting-solution-set-up-in-unity/) **[V-doc]**. No primary breakdown of the shipped games' AO, fog or post found **[U]** |
| **Okami** | "Paper filter" texture overlay; ink outlines | Static paper texture at low amplitude | Secondary sources only **[U]** |
| **Dorfromantik, Manor Lords, Against the Storm, Spiritfarer** | No primary rendering talk or breakdown found | n/a | **[U]** |

**Further viewing** (GPC 2024, stylised and atmospheric):
- "Pondering Orbs: The Rendering and Art Tools of COCOON" ([video](https://www.youtube.com/watch?v=8kS17jt38XQ))
- "Volumetric Fog in Enshrouded" ([video](https://www.youtube.com/watch?v=OR8HbFnQdlk))
- "NPR Light Rendering in Unreal Engine" ([video](https://www.youtube.com/watch?v=VoUJB5Cf31A))

All three are listed on the [GPC 2024 archive](https://graphicsprogrammingconference.com/archive/2024/).

---

## 7. Performance budget per technique (summary)

All values are **[E]** for 1080p on an Apple M1 8-core GPU, unless marked. The
GTX 1650 desktop has about 1.9× the bandwidth, so bandwidth-bound passes run
roughly 1.3–1.8× faster there **[E]**. Multiply by ≈1.8 for 1440p.

| Technique | Cost (ms) | Basis |
|---|---|---|
| Any extra separate full-screen pass (trivial maths) | 0.3–0.55 | Bandwidth model above |
| Uber pass (LUT, shoulder, vignette, paper, dither, bloom composite) | 0.5–0.9 | 1 pass, ~6–10 fetches |
| + depth-only edges in the uber pass | +0.15–0.3 | 4 more fetches (cached) |
| 3D LUT (in an existing pass) | 0.02–0.05 | 1–2 fetches |
| Dual-filter bloom from ½ res | 0.3–0.5 | 8 tiny passes; first read dominates |
| Babylon default bloom (kernel 64, scale 0.5) | 0.8–1.5 | Extract + 2 large separable blurs + merge **[V-src structure]** |
| Analytic height fog / mist in material | 0.1–0.3 | ALU |
| Fake shafts (3-step baked visibility march) | 0.15–0.4 | 3 cache-friendly fetches |
| `FrameGraphVolumetricLightingTask` | 0.5–1.5 | Volume raster; WebGL CPU readback once if static |
| Custom tilt-shift DoF (½ res, separable, depth in alpha) | 0.4–0.7 | Cinematic tier |
| Babylon DoF (Low) | 1.5–3 + a full depth re-render | **[V-src structure]** |
| Generalized Kuwahara r = 4 (full res) | 2–4 | ~81 fetches/px |
| Anisotropic Kuwahara | 3–6 | Tensor + 2 blurs + filter |
| SSAO2 as configured (forced G-buffer) | 4–10 | Scene re-render + 5 passes |
| SSAO from depth-in-alpha at ¼ res | 0.5–1 | No G-buffer |
| Baked AO / shadow / mist (runtime) | ≈0.05 | 1 fetch shared |
| Rim + backlight in material | ≈0.05 | ALU |
| FSR1 upscale | 0.4–0.8 | EASU + RCAS; saves 30–55 % of main-pass shading at 0.77–0.67 scale |
| Main forward pass, prototype as-is (DPR 1.5) | 8–15 | ≈20–25 fetches/px terrain, vegetation overdraw, discard |
| Main forward pass after §5 fixes (DPR 1.0) | 4–7 | ≈6–8 fetches/px, culled / LOD vegetation |

**Game-tier total after fixes: ≈6–9 ms** (main 4–7 + bloom 0.3–0.5 + uber
0.5–0.9 + optional FSR). Validate it with the measurement plan in §5.8 before
trusting any of these numbers.

---

## 8. Sources

**Babylon.js (official)**
- Babylon.js 9.0 announcement: https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/
- Docs source repository (all pages below are rendered from it): https://github.com/BabylonJS/Documentation
- Default Rendering Pipeline: https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/defaultRenderingPipeline
- SSAO rendering pipeline: https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/SSAORenderPipeline
- Volumetric light scattering + Volumetric Lighting Task: https://doc.babylonjs.com/features/featuresDeepDive/lights/volumetricLightScattering
- Frame Graph task list: https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList
- Frame Graph FAQ / best practices: https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphFAQ
- Frame Graph volumetric lighting example: https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphExamples/frameGraphExampleVolumetricLighting
- FSR 1 rendering pipeline: https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/fsr1RenderingPipeline
- KTX2 compressed textures: https://doc.babylonjs.com/features/featuresDeepDive/materials/using/ktx2Compression
- Thin instances: https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances
- Selection outline layer: https://doc.babylonjs.com/features/featuresDeepDive/mesh/selectionOutlineLayer
- Clustered lighting: https://doc.babylonjs.com/features/featuresDeepDive/lights/clusteredLighting
- Atmosphere addon: https://doc.babylonjs.com/addons/atmosphere
- `@babylonjs/core` 9.29.0 package, read directly (npm: https://www.npmjs.com/package/@babylonjs/core). Files cited:
  - `Shaders/ShadersInclude/imageProcessingFunctions.js`
  - `Materials/imageProcessingConfiguration.pure.d.ts`
  - `PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.pure.js`
  - `PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.pure.js`
  - `PostProcesses/thinDepthOfFieldEffect.js`, `PostProcesses/bloomEffect.js`, `PostProcesses/thinBloomEffect.js`
  - `Rendering/geometryBufferRenderer.pure.js`, `Rendering/depthRenderer.pure.js`
  - `Materials/Textures/renderTargetTexture.pure.d.ts`, `PostProcesses/postProcess.types.d.ts`
  - `Instrumentation/engineInstrumentation.d.ts`, `PostProcesses/RenderPipeline/Pipelines/fsr1RenderingPipeline.d.ts`
  - Browsable at https://unpkg.com/browse/@babylonjs/core@9.29.0/

**Films**
- "Visual Style of Puss In Boots: The Last Wish", SIGGRAPH 2023 production session: https://history.siggraph.org/?p=131616
- SIGGRAPH blog, "Crafting the Enchanted Universe of Puss in Boots: The Last Wish": https://blog.siggraph.org/?p=17519
- befores & afters, DreamWorks stylized look: https://beforesandafters.com/2023/01/11/heres-how-dreamworks-lent-a-whole-new-brand-of-stylized-look-and-feel-to-puss-in-boots-the-last-wish
- AWN, Last Wish returns to its fairy-tale illustration roots: https://www.awn.com/animationworld/puss-boots-last-wish-returns-its-fairy-tale-illustration-roots
- Foundry, Spider-Verse graphic look in comp: https://www.foundry.com/insights/film-tv/graphic-look-in-comp-spiderman

**Games, talks, breakdowns**
- Graphics Programming Conference 2024 archive (Tiny Glade, COCOON, Enshrouded fog, NPR light): https://graphicsprogrammingconference.com/archive/2024/
- Tiny Glade talk video: https://www.youtube.com/watch?v=jusWW2pPnA0
- Hi-Fi Rush, GDC 2024: https://gdcvault.com/play/1034330/3D-Toon-Rendering-in-Hi and https://80.lv/articles/the-making-of-hi-fi-rush-s-3d-toon-rendering-style
- Sable, GDC 2022 coverage: https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability
- Breath of the Wild, GDC 2017 coverage: https://zeldauniverse.net/2017/03/14/takizawa-explains-how-the-wind-waker-hd-inspired-the-visual-style-for-breath-of-the-wild/ and https://www.thumbsticks.com/gdc17-designing-zelda-breath-of-the-wild/
- Ori and the Will of the Wisps: https://gdcvault.com/play/1027035/The-Art-of-Ori-and and https://www.thegamer.com/ori-and-the-will-of-the-wisps-artists-hand-painted-30000-light-maps/
- Guilty Gear Xrd, GDC 2015: https://gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The and https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf
- INSIDE, GDC 2016: https://gdcvault.com/play/1023002/Low-Complexity-High-Fidelity-INSIDE
- Oskar Stålberg lighting experiment: https://80.lv/articles/a-custom-lighting-solution-set-up-in-unity/

**Techniques, papers**
- Bjørge, "Bandwidth-Efficient Rendering", SIGGRAPH 2015 Moving Mobile Graphics, notes: https://developer.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_notes.pdf
- Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare", SIGGRAPH 2014: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/
- Quilez, fog: https://iquilezles.org/articles/fog/
- Unreal Engine, Exponential Height Fog: https://dev.epicgames.com/documentation/en-us/unreal-engine/exponential-height-fog-in-unreal-engine
- Mitchell, GPU Gems 3 ch. 13: https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process
- NVIDIA, Fast, Flexible, Physically-Based Volumetric Light Scattering (GDC): https://d29g4g2dyqv443.cloudfront.net/sites/default/files/akamai/gameworks/downloads/papers/NVVL/Fast_Flexible_Physically-Based_Volumetric_Light_Scattering.pdf
- Kyprianidis, Kang, Döllner 2009, anisotropic Kuwahara: https://diglib.eg.org/handle/10.2312/CGF.v28i7pp1955-1963
- Kyprianidis, Semmo, Kang, Döllner 2010, polynomial weighting: https://diglib.eg.org/items/9865e5fe-3d23-470e-8cf6-e571bebafb9b
- Kyprianidis dissertation, Structure Adaptive Stylization: https://publishup.uni-potsdam.de/files/6174/kyprianidis_diss.pdf
- Winnemöller, Kyprianidis, Olsen 2012, XDoG: https://users.cs.northwestern.edu/~sco590/winnemoeller-cag2012.pdf
- Meier 1996, painterly rendering for animation (shower-door problem): https://course.khoury.northeastern.edu/cs5310sp13/resources/readings/meier-painterly.pdf
- Ameye, rendering outlines: https://ameye.dev/notes/rendering-outlines/
- Timonen, Line-Sweep Ambient Obscurance: https://diglib.eg.org/items/15b59d27-b234-4406-a50a-f4031d335895 ; thesis: https://www.doria.fi/handle/10024/95729
- Bend Studio screen-space shadows: https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/
- Wronski, dithering in games: https://bartwronski.com/2016/10/30/dithering-in-games-mini-series/
- Peters, free blue noise textures: https://momentsingraphics.de/BlueNoise.html
- Khronos PBR Neutral: https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md
- AgX in three.js (from Filament, from Blender): https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js ; Filament PR: https://github.com/google/filament/pull/7236
- darktable AgX module docs: https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/agx/
- ACES hue-skew discussions: https://community.acescentral.com/t/aces-2-0-seeing-a-few-issues/5812/53 and https://devtalk.blender.org/t/blender-support-for-aces-academy-color-encoding-system/13972?page=2
- Apple, TBDR guidance on discard and alpha test: https://developer.apple.com/library/content/documentation/OpenGLES/Conceptual/OpenGLESHardwarePlatformGuide_iOS/OpenGLESPlatforms/OpenGLESPlatforms.html ; WWDC20 session 10632 (Apple-silicon GPU performance): https://developer.apple.com/videos/play/wwdc2020/10632
- Tilt-shift references: luma.gl tilt-shift pass: https://luma.gl/docs/api-reference/shadertools/shader-passes/tilt-shift ; depth-based tilt-shift (Godot): https://godotshaders.com/shader/depth-based-tilt-shift/

**Hardware**
- Apple M1 8-core GPU (FP32, bandwidth): https://www.gpu-monkey.com/en/gpu_group-apple_m1_8_gpu
- NVIDIA GTX 1650 (FP32, bandwidth): https://getdeploying.com/gpus/nvidia-gtx-1650
