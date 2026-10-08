---
status: current
last_reviewed: 2026-10-08
---

# Asset Sources

Where to find 3D assets, textures and brushes for the RTS, and how to judge
whether an asset fits. Companion to `docs/art-bible.md`, the art bible (see §5 "the 3D
model contract" and §10 "asset generation pipeline").

> **Rule of thumb:** judge **shape language** first, colour last. Our painterly
> shader repaints every model with the palette in `docs/art-bible.md`, so a pack's
> colours don't matter. Its silhouettes, proportions and level of detail do.

---

## 1. What makes an asset a good fit

| ✅ Good fit | ❌ Bad fit |
|---|---|
| Crowns built from 3–8 big rounded clumps | Thousands of individual leaf cards |
| Soft, slightly irregular silhouettes | Hard faceted low-poly, or realistic scans |
| Flat colours, little or no baked shading | Strong baked shadows or ambient occlusion in the texture |
| Grass as clumps or tufts | Realistic single blades |
| Separate colour regions (crown / trunk, wall / roof) | One texture mixing everything |
| ~2–8k triangles for hero assets, fewer for scatter | 50k+ triangles per object |
| FBX, GLB/glTF or OBJ available | Engine-only formats (e.g. `.uasset` only) |
| Central European species (oak, lime, birch, willow, orchards) | Palms, cypress, cactus (unless the battle needs them) |

---

## 2. Marketplaces & libraries

| Source | Search terms | Licence | Notes |
|---|---|---|---|
| **Fab** (fab.com, Epic) | `stylized foliage`, `stylized nature`, `hand painted trees`, `painterly environment`, `Ghibli` | Fab Standard License, which allows use in any engine | Biggest stylized selection. Some packs ship only Unreal formats, so check for FBX/GLB. |
| **Sketchfab** (sketchfab.com) | `stylized tree`, `hand painted tree`, `painterly foliage`, `stylized grass`, `toon tree` | Varies per model (CC0, CC-BY, paid) | Filter by **Downloadable**. Best for browsing shape styles in 3D. |
| **Quaternius** (quaternius.com) | Nature packs, Ultimate Nature | **CC0** | Currently in use (`assets/nature-pack/`). Seasonal variants included. |
| **Kenney** (kenney.nl) | Nature Kit | **CC0** | Very simple shapes; good placeholders. |
| **KayKit** (kaylousberg.itch.io) | Forest / nature / medieval packs | Free and paid, permissive | Clean, consistent stylized look. |
| **ArtStation Marketplace** | `stylized foliage pack`, `stylized tree kit`, `hand painted foliage` | Per product | Pro environment artists; often includes Blender scenes. |
| **Superhive** (formerly Blender Market) | `stylized trees`, `stylized grass`, `painterly`, `NPR` | Per product | Blender assets and scattering tools. |
| **itch.io** | `stylized nature 3d`, `low poly painterly`, `hand painted foliage` | Per product | Cheap indie packs; quality varies a lot. |
| **Unity Asset Store** | `stylized nature`, `toon foliage`, `painterly` | Per product | ⚠️ Check the licence allows use **outside Unity**. |
| **Synty POLYGON** | Nature packs | Paid | Consistent low-poly; works as a base for repainting. |
| **Gumroad** | `stylized foliage`, `stylized tree tutorial` | Per product | Artists often sell packs with tutorials. |

---

## 3. Generating our own assets

| Tool | Use | Notes |
|---|---|---|
| **OpenAI image generation → Tripo** | Concept image, then 3D model | Prompts in `docs/art-bible.md` §12. The image must be **evenly lit with no cast shadows**, or the shading gets baked into the texture. |
| **Tripo API** | Multiview to 3D, low-poly P-series, `convert_model` (GLB/OBJ/FBX, `face_limit`), auto-rigging | Paid per credit. Rigging: biped and quadruped, Mixamo-compatible bones. |
| **TRELLIS.2** (Microsoft) | Image to 3D, open source | **MIT licence.** Needs a large NVIDIA GPU: use the Hugging Face Space or a rented GPU. Single image only, for now. |
| **Hunyuan3D 2.1** (Tencent) | Image to 3D, open weights | ⚠️ Licence excludes the **EU, UK and South Korea**. Avoid for published work there. |
| **Mixamo / AccuRIG / UniRig** | Rigging and animation for humanoids (UniRig handles any shape, MIT) | Mixamo is free but unmaintained and sometimes broken; AccuRIG is a desktop app. |

---

## 4. Brushes & painted textures (the brush library, `docs/art-bible.md` §7)

| Source | What | Licence |
|---|---|---|
| **Your own (Procreate / Krita)** | Fill textures and single strokes, painted in greys | Yours. Built-in brushes are fine for commercial use. |
| **Blender Studio: Brushstroke Tools** | Free add-on with brush textures, plus a course on stylized brushstroke rendering | Add-on GPL; check the included textures' terms before shipping |
| **rawpixel** | Brush-stroke images | Use the **CC0 / public domain** filter |
| **Vecteezy** | Transparent PNG strokes (oil, gouache, watercolour) | Free tier needs attribution |
| **Creative Market, Envato Elements, ArtStation** | `gouache texture pack`, `brush stroke alphas` | Paid, per product |
| ⚠️ Avoid **PNGAll, PNGFind** and similar "free PNG" sites | | Often non-commercial or of unclear origin |

---

## 5. Studying the style (references, not assets)

- **ArtStation:** search `stylized foliage`, `painterly environment`, and the
  *Puss in Boots: The Last Wish* artists (production designer Nate Wragg).
- **80.lv:** artist breakdowns of stylized trees, grass and water.
- **YouTube:** `stylized tree tutorial`, `stylized foliage normals`, `Ghibli grass Blender`, `stylized water shader`.
- **Games:** *Sable*, *Tiny Glade*, *Bad North*, *The Legend of Zelda: Breath of the Wild*, *Hi-Fi Rush*.

---

## 6. Licence checklist (web game)

A browser game ships its files to every player, who can extract them.

- [ ] **Commercial use** allowed?
- [ ] **Use outside the original engine** allowed (Unity / Unreal stores)?
- [ ] Any **"must protect from extraction"** clause? A web build can't fully
      comply, so prefer licences without one.
- [ ] **Attribution** required? If so, record it in a CREDITS.md file at the repo root (not created yet).
- [ ] **Regional restrictions** (e.g. Hunyuan3D)?
- [ ] Keep the original licence file next to the asset in `assets/<pack>/`.

**Safest:** CC0 (Quaternius, Kenney) and MIT tools (TRELLIS.2, UniRig).

---

## 7. Pipeline after download

1. Inspect: `gltf-transform inspect model.glb` (triangles, textures).
2. Simplify if needed: `gltf-transform optimize in.glb out.glb` (skip Draco/meshopt compression until the loader supports it).
3. `.blend` files: export with Blender headless (`tools/blend-to-js.py`); OBJ: `tools/obj-to-js.mjs`.
4. Map materials to shader **roles** (foliage, bark, rock, flower…). The painterly shader does the rest.
5. Check it under the default light preset against `design/refs/` before committing to a pack.
