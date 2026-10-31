---
status: active
last_reviewed: 2026-10-31
---

# Getting started

A browser real-time strategy game about Napoleonic battles, rendered as a living storybook
illustration: real 3D, but every frame looks painted. The same renderer will produce cinematic
history videos.

![North star](../design/refs/north-star.png)

## Status

The engine has started: the look page (`app/look.html`, code in `src/look/`) draws the painted demo map with
armies on it, and the sim page (`app/`) runs the simulation. The single-file prototypes below came first and still
open from `file://` in Chrome, with no build step.

## Run the demo

Everything the pages load (terrain, textures, buildings, trees, the soldiers' figure data) is committed: a fresh
clone needs no asset packs. You need Node ≥ 22.18 and Chrome (or another WebGL2 browser).

```sh
git clone https://github.com/vcmf/rts.git && cd rts
npm ci
npm run build
npx vite preview --port 4205
```

Then open:

| URL | What it shows |
|---|---|
| `http://localhost:4205/app/look.html` | The demo map, painted, no armies |
| `http://localhost:4205/app/look.html?armies=20` | 20 battalions a side (16,560 figures), scripted: march, deploy, fire |
| `http://localhost:4205/app/look.html?armies=40` | 40 a side (33,120 figures) |
| `http://localhost:4205/app/` | The simulation page |

The armies stand about 170 m east of the start view: pan with D or the right arrow (or drag), zoom with the wheel
or a pinch, turn with Q and E. Zoom all the way in (15 m) to see the full figures. `H` hides the panel.

- **Judge frame rates only on this production build** (`vite preview`). `npm run dev` serves the same pages with
  hot reload for working on the code, but its frame rates are not the real ones.
- Useful switches (add with `&`): `season=…` and `mood=…` (also in the panel), `unitshadow=0` (no figure
  shadows), `tinylod=0` (no tiny figures at wide zoom), `nearestpx=0` (no full figures up close), `flags=0`,
  `trample=0`. The full list, with what each one is for, is in [`docs/systems/look.md`](systems/look.md).
- For agents: AGENTS.md's Commands list the tests, checks and benches (`npm test`, the look checks, the Metal
  bench).

| Prototype | What it shows |
|---|---|
| `prototypes/painted-cinematic.html` | **Latest prototype.** Baked light map, painted water, valley mist, light shafts, golden backlight, cinematic grade, seasons, optional depth of field |
| `prototypes/staff-map.html` | **Feel prototype** of the far-zoom staff map and the zoom into the world |
| `prototypes/formation-map.html` | **Formation test** on a contour map: one battalion of 100 soldiers as circles, drill changes, wood, ford, casualties, 40 battalions benchmark |
| `prototypes/painted-hybrid.html` | Real sun shadows + SSAO under painterly shading (superseded) |
| `prototypes/painted-foliage.html` | Leaf-card trees from a stylized `.blend` pack (superseded) |
| `prototypes/painted-nature.html` | First painterly pass on the Quaternius pack (superseded) |
| `prototypes/painted-diorama.html` | The retired tin-soldier diorama direction |

## Docs

Start at [`docs/INDEX.md`](INDEX.md): vision, art bible, architecture, decisions, system docs,
proposals, plans and research, one line each. Agents start at [`AGENTS.md`](../AGENTS.md).

## Assets

Raw packs are not in git. To regenerate the model data:

- **Quaternius Ultimate Nature** (CC0): extract to `assets/nature-pack/` (with its `OBJ/` folder),
  then `node tools/obj-to-js.mjs`.
- **Stylized foliage `.blend` files** (`Trees.blend`, `FilesPlants.blend`): place in
  `assets/painted-foliage/`, then run `tools/blend-to-js.py` with Blender (see its header).

The generated `prototypes/*.data.js` files are committed, so the prototypes run without the packs.

## Credits

- Nature models: [Quaternius](https://quaternius.com) (CC0).
- Elevation data (later): AWS Terrain Tiles.
- Engine: [Babylon.js](https://www.babylonjs.com) 9.
