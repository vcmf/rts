---
status: research
last_reviewed: 2026-10-14
---

# Procedural trees: the standard algorithms and how they fit our look

Research notes, October 2026. Question: is there an industry-standard way to **generate** the trees the
art bible asks for (trunk, branches, crown) instead of taking them from a pack or from Tripo? If there
is, which method fits a top-down painterly RTS? Written against `docs/art-bible.md` (§4b seasons, §5 the
model contract, §6c the river's banks, §11 composition), L7's foliage work (`docs/plans/done/l7a-canopy-cards.md`,
`docs/plans/done/l7b-crown-volume.md`) and `src/look/nature.ts`. The prototype that tests the answer is
`prototypes/tree-gen.html` (plan: `docs/plans/done/tree-generator.md`).

**Confidence tags** (the scheme of `docs/research/stylized-water.md`, plus [M])

| Tag | Meaning |
|---|---|
| **[V-doc]** | Verified in the paper, official doc or developer write-up (linked in §9) |
| **[M]** | Measured in `prototypes/tree-gen.html` on the dev Mac (Chrome, Metal), a proxy, not the min-spec laptop |
| **[E]** | My estimate, reasoning shown |
| **[U]** | Could not verify. A lead, not a fact |

---

## 1. Summary

- **Yes, there are standard methods.** Four families cover the literature: grammars (L-systems),
  per-species parameters (Weber and Penn), space colonization (Runions et al.), and growth simulation
  with competition for light (Palubicki et al.). The commercial tools are built on these ideas and add
  hand editing. SpeedTree mixes procedural rules with hand tools; The Grove simulates growth year by
  year. [V-doc]
- **For us: space colonization in a per-species crown envelope.** The crown's outline is the input, so
  the silhouette, which is what a top-down camera reads, is under direct control. Three numbers shape
  the branching (§3.3). Species become data, which is what decision 0015 asks of era content. [E]
- **Our crown is not leaves.** The art bible wants 3–6 crown clumps (§5). The generator clusters the
  branch tips into clumps and fits an ellipsoid to each. The clumps carry L7a's leaf cards and L7b's
  crown-volume shading. **The branch skeleton gives the bare winter trees L7 still owes for free.** [M]
- **Prototype result** [M]: all 12 species build in 1.5–8 ms per tree on average (the page's 100 trees in about 0.4 s),
  at 1.5–3.2k triangles each in leaf and 2.8–7.3k bare with twigs. That is inside the art bible's 2–8k
  budget. A seed gives the same geometry every time.

## 2. What we need to cover (from the docs on main)

| Species | Where the docs ask for it | Shape to generate | Notes |
|---|---|---|---|
| Oak | `docs/art-bible.md` §11, §12 (the Tripo prompt) | broad dome, short sturdy trunk, 4–6 clumps | the default broadleaf |
| Lime (linden) | §11 | tall egg, dense, pointed top | |
| Beech, **copper beech** | §4b: about 5% copper-beech purple all year | dome; the copper one is a colour, not a shape | the prototype keeps copper as its own preset to show it |
| Birch | §11; `nature.ts` places 22% birches | narrow, light, drooping tips, white bark with marks | bark is a role our palette paints |
| Willow, **alder** | §6c: willows and alders in a broken line along the banks | white willow: wide, loose, slight droop; alder: narrow, often several stems | pollarded willows (cut back to a knob) are a variant still to try |
| Orchard (apple) | §11 | low, wide, short trunk | planted in grids |
| Conifers (Scots pine, Norway spruce) | §4b: conifers stay green and only cool in winter | pine: tall bare trunk, flat pads up top; spruce: a cone of tiers | `nature.ts` has 5 pack pines |
| Hedgerow bush (hawthorn) | §11: hedgerows, copses | several stems from the ground, a low dome | today the pack's `Bush_*` |
| Lombardy poplar | not in the docs | a narrow column | **proposed**: the classic roadside tree of 19th-century Europe; an owner's call [U] |

Every deciduous species also needs **late autumn** (thinning crowns) and **winter** (bare branches with snow),
both from the same model (§4b: season is a per-map setting, not an asset set).

## 3. The algorithm families

### 3.1 L-systems (grammars)

Prusinkiewicz and Lindenmayer, *The Algorithmic Beauty of Plants* (1990). A string-rewriting grammar is
read by a turtle that draws the branches. They are botanically expressive, and they are the ancestor of
the field. **Fit: poor.** The crown's outline emerges from the rules and is hard to steer, and a top-down
game reads nothing but that outline. [E]

### 3.2 Per-species parameters (Weber and Penn 1995)

*Creation and Rendering of Realistic Trees* (SIGGRAPH '95, pp. 119–128). A tree is a few recursion
levels of stems, each set by a list of parameters (split counts and angles, curvature, taper, a crown shape
profile). The paper targets users with no botany, and also simplifies the geometry at range for large
forests. [V-doc] **Blender's bundled *Sapling Tree Gen* add-on implements it**, with species presets.
[V-doc] **Fit: good.** It gives direct, readable controls. It is weaker than space colonization at filling
a given crown shape, and branches can cross. [E]

### 3.3 Space colonization (Runions, Lane and Prusinkiewicz 2007)

*Modeling Trees with a Space Colonization Algorithm* (Eurographics Workshop on Natural Phenomena, pp.
63–70). [V-doc] The method:

1. An **envelope** of the crown (any shape with an inside test; the paper uses a surface of revolution)
   is seeded with **N attraction points** (usually hundreds or thousands).
2. Each iteration, every point influences the tree node closest to it, if that node is within the
   **radius of influence d_i**. Each influenced node grows a new node at distance **D**, along the
   normalized sum of the unit vectors toward its points. An optional vector **g** (tropism, branch weight)
   is added to that direction.
3. A point is removed once a node comes within the **kill distance d_k**.
4. Afterwards: optional decimation; moving each node halfway toward its parent (smaller branching angles);
   subdivision; **generalized cylinders** along the skeleton, with the radii from the **pipe model**
   (§4) and a parallel-transport frame against twist.

What the parameters do (the paper's figures 3–5): fewer points and a larger d_k give sparser crowns.
Few points give irregular branches, and a large d_k gives smoother curves. A small d_i (for example 8D)
makes branches wander and look gnarly. Narrow envelopes give a clear trunk (excurrent); wide ones give
many-limbed crowns (decurrent). [V-doc]

**Fit: the best.** The envelope is the art director's control, and the rest follows. The prototype uses
it for every species, the conifers included. [M]

### 3.4 Self-organizing trees (Palubicki et al. 2009)

*Self-Organizing Tree Models for Image Synthesis* (SIGGRAPH 2009, ACM TOG 28(3) 58). Buds and branches
compete for light or space, guided by internal signalling. The forms can be steered with procedural
brushes, sketching, pruning and bending. [V-doc] **Fit: later.** Its strength is woods, where neighbours
shape each other (the edge of a copse is lopsided toward the light). Space colonization gets part of this
by sharing one set of attraction points between neighbours. [E]

### 3.5 Commercial and open tools

| Tool | What it is | Fit |
|---|---|---|
| **SpeedTree** (Unity) | Procedural generation plus hand tools (Trim, Vertex Edit, Lua rules in v10); licensed for games since 2002, e.g. *The Witcher 3*; trees generated offline, not at runtime [V-doc] | The industry standard for realistic foliage; our look needs clumps, not leaves |
| **The Grove** (F12) | A commercial Blender and Houdini add-on that simulates growth year by year (apical dominance, tropism, pruning); since 2.0 its core is a standalone Rust engine [V-doc] | Very good branches; offline only |
| **Sapling Tree Gen** | Weber–Penn in Blender, bundled [V-doc] | Would fit `tools/blend-to-js.py` |
| **EZ-Tree** (Dan Greenheck) | A three.js generator and npm library, open source (MIT per its sources); 10–40k triangles per tree by its author's account [V-doc]; licence file not read [U] | The closest stack; too many triangles and leaf-card crowns |
| **proctree.js** (Paul Brunt, the SnappyTree demo) | A small JS generator; BSD-3 per a port's README [U] | Worth reading |

## 4. Branch thickness: the pipe model and Leonardo's rule

At a branching point, the parent's radius r and the children's r_i satisfy **r^n = Σ r_i^n**. The paper
gives n "usually between 2 and 3" [V-doc]. Leonardo's rule is the case n = 2 (area is conserved). Eloy
(2011) explains it by wind loads, and reports measured exponents of 1.8–2.3 across species [V-doc].
Computing it from the tips down (the tips share a radius r0) gives believable trunks with no tuning.

**For our look** the prototype thickens the limbs toward the trunk by up to 1.7× (`chunk`), because the
art bible wants "a short sturdy trunk" (§12). The twigs keep their radius, so bare winter crowns stay fine.
[M]

## 5. From skeleton to mesh

- **Generalized cylinders** (tubes) along chains of the skeleton. Each chain follows the thickest child;
  every other child starts its own chain at the branching node, inside the parent's tube, so the joint
  needs no welding. A **parallel-transport frame** stops the rings twisting. [V-doc] for the frame; the
  rest is the prototype's choice [M].
- **Fewer rings:** keep a ring only where the chain turns more than about 10°, thins by 30%, or has run
  6 segments. Sides by radius: 8 on the trunk, 3 on twigs. This keeps an oak's wood at 0.4–0.6k triangles
  and its twigs at 2.9–3.9k. [M]
- **Seamless junctions,** if a hero tree needs them: SQM, *Skeleton to Quad-dominant Mesh* (Bærentzen et
  al., 2012), puts a polyhedron at each branching node and bridges them with quads. [V-doc]

## 6. The crown for a painterly look

The standard realistic crown is thousands of leaf cards. The art bible rules it out: "a tree is 3–6
crown clumps, not leaves" (§5). The stylized practice, and the prototype:

1. **Cluster the tips.** k-means (k-means++ seeding from the tree's own random stream, 12 Lloyd steps, a
   metric squashed vertically so clumps come out wider than tall) on the thin nodes, k = 3–6 per species.
   Spruce and poplar use **tiers** instead: bands of height up the trunk. [M]
2. **One ellipsoid per clump,** fitted from the group's spread (padded by about a segment), with a
   per-species height-to-width ratio. A hidden **core** clump fills the middle, so gaps show foliage rather
   than lit branches. [M]
3. **Normals from the hull** (the "normal thief" or normal-transfer trick): the crown's normals are
   blended from the clump's ellipsoid and the whole crown's ellipsoid, so the crown shades as one mass.
   Artists copy normals from a sphere, dome or hull onto foliage cards, because per-card normals shade
   as noise. [V-doc] for the practice (forum write-ups, no canonical source).
4. **Leaf cards on each clump** (L7a's technique: camera-facing quads cut by a leaf-clump mask, with the
   crown's volume for shading as in L7b): about 30–60 cards per clump, over an opaque body shrunk to 0.86.
   Without the cards, the clump meshes' facets show at the near zoom and look like rocks. Cutting the facets'
   silhouettes with grain gives shards. The cards fix both. [M]

The generator's output is what `src/look/canopy.ts` already consumes: crown triangles plus an ellipsoid
per crown (`aEllC`, `aEllR`). The prototype's GLB export carries each clump's ellipsoid in the glTF
`extras`. [M]

5. **One volume per clump** (on the look page, `?trees=gen,cards`): giving each card its own clump's ellipsoid
   instead of the crown's turns L7b's one lit ball into 3–5 lit puffs per crown, each with its own top, core and edge.
   That is the read of Tiny Glade's crowns (`design/refs/tiny-glade-img-2.jpg`), from data the generator already has,
   with no shader change: the ellipsoid was already per card. [M] (screenshots; the cost not yet benched)

## 7. Seasons and bare winter trees

- **Autumn** is a palette per instance (§4b's mix). **Late autumn** discards the crown by a grain threshold
  that rises with the season, so the crowns thin into ragged patches and show the branches through them.
  **Winter** turns the crowns off and shows the twig mesh. Snow settles on upward faces. All from one
  model. [M]
- **On the look page** the cards drop one by one (by each card's own random draw, so the crown thins into tufts,
  not into screen-pixel noise) and the cards left shrink to half, in the cards drawn and in the shadow pass. A first
  try that left 6% of full-size cards still cast a crown-sized shadow in winter: about five 3 m cards per tree are
  most of a crown's footprint seen from the sun. 3% at half size cast small tufts' shadows. [M]
- **Bare trees** come straight from the skeleton. L7 asked for "thin branches clamped to at least 1 px
  with alpha-to-coverage, painted-opacity skirts for the twig mass"
  (`docs/plans/active/track-e-look.md` L7). The generator gives the branches. The 1 px clamp and the
  skirt are still L7's to do. At the far zoom the twigs alias (no MSAA in the prototype). [M]

## 8. At scale

A battlefield has thousands of trees. Options, from the literature:
- **Impostors**: octahedral impostors bake a tree from many directions into one atlas. Unreal and
  Houdini ship bakers; the technique comes from Ryan Brucks' work. [V-doc] Our camera's yaw is locked to
  ±45° (decision 0010), so far fewer views are needed than a free camera would need. [E]
- **Billboard clouds** (Décoret, Durand, Sillion and Dorsey 2003): a model approximated by a few textured
  planes chosen against a geometric error. Trees are a named case; forest follow-ups get to about 15–50
  polygons per tree. [V-doc]
- **Far woods as painted terrain colour** are already L7's plan. [V-doc] (the plan)

## 9. Sources

- Runions, Lane, Prusinkiewicz (2007): https://www.algorithmicbotany.org/papers/colonization.egwnp2007.html
- Weber, Penn (1995): https://history.siggraph.org/?p=118727 ; Sapling Tree Gen:
  https://docs.blender.org/manual/en/4.1/addons/add_curve/sapling.html
- Palubicki et al. (2009): https://www.algorithmicbotany.org/papers/selforg.sig2009.html
- Eloy (2011), Leonardo's rule: https://arxiv.org/abs/1105.2591
- Bærentzen et al. (2012), SQM: https://people.compute.dtu.dk/janba/Research_in_Graphics/SQM.html
- Décoret et al. (2003), billboard clouds: https://artis.inrialpes.fr/Publications/2003/DDSD03
- SpeedTree: https://docs.unity3d.com/speedtree-modeler/manual/modeling.html ;
  https://www.pcgamer.com/uk/from-the-elder-scrolls-to-the-us-secret-service-where-videogame-trees-come-from
- The Grove: https://digitalproduction.com/2026/03/02/the-grove-2-3/ ; https://renderu.com/en/news/post/24448
- EZ-Tree: https://github.com/dgreenheck/ez-tree ; https://www.cgchannel.com/2025/04/ez-tree-is-a-lightweight-free-open-source-tree-generator
- proctree.js port: https://github.com/BKS-ProceduralGeneration/proctree
- Normal transfer on foliage: https://polycount.com/discussion/comment/2676975 ;
  https://superhivemarket.com/products/foliage-normals
- Impostor Baker: https://dev.epicgames.com/documentation/en-us/unreal-engine/impostor-baker-plugin-in-unreal-engine

## 10. Open questions

- The owner's judgement of the prototype's shapes, species by species (the plan's acceptance).
- Pollarded willows along streams: a preset (a short trunk, a knob, a fan of straight shoots)?
- The Lombardy poplar: in or out (§2)?
- Woods: shared attraction points between neighbours, so a copse's edge leans out to the light (§3.4).
- The generator in the game: a seeded offline bake in `tools/` (GLB plus crown ellipsoids), wired into
  `canopy.ts`; then whether the pack crowns go.
