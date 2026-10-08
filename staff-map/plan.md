# Staff Map: Plan

Phases for the staff map. Design: `design.md`. Approach: `implementation.md`.
Every PR follows `../AGENTS.md` → Workflow (plan → implement → `/code-review high`).

## SM0: feel prototype (this PR)

Status: built. Open `prototypes/staff-map.html`. Measured numbers: `implementation.md` §7.

**Goal:** judge the *feel* of the map, the blocks, the orders and the zoom before committing to
any of it. Not the final rendering: the 3D side is a stand-in for `painted-cinematic.html`.

**Scope:** `prototypes/staff-map.html`, single file, Babylon 9 from the CDN, runs from `file://`.
- An Austerlitz-inspired field (approximate geography): a central plateau, a meandering stream
  with villages along it, ponds to the south, woods, roads.
- The baked map texture: paper, Lehmann hachures, woods stipple, water, roads, village blocks.
- Seasonal wash driven by a `season` slider (0–3), winter by default (Austerlitz, December).
- About 40 battalions on two sides, drawn as blocks: line, column and square shapes; cavalry and
  artillery symbols; losses and morale hatching; routing outlines; firing smoke curls.
- A minimal sim inside the page: movement along paths, formation changes, fire and morale.
  Not the real `sim/`.
- Orders: select a block, right-drag a path (superseded in SM0b by a command band and fading
  footprints). A short scripted opening so both sides move without input.
- The zoom transition in its six stages, continuous on the wheel, eased on the zoom buttons.
- Interface: cartouche, status bar, scale bar, neatline with ticks, *field notes* type.

**Acceptance criteria** (judged on screenshots and by hand):
- [ ] At the far zoom, the screenshot reads as a drawn map, not a render: no shadows, bevels or
      hillshade.
- [ ] Every season reads at a glance; winter paper reads as snow; Austrian blocks stay readable
      in winter.
- [ ] Line, column and square are distinguishable at the far zoom without a legend.
- [ ] An order reads as a command while it runs, then as footprints (SM0b).
- [ ] Zooming in shows the stages in order, with no frame where map and world simply cross-fade.
- [ ] The blocks and the soldiers occupy the same footprint during the transition.
- [ ] 60 fps at the far zoom on an M1-class Mac (measured in the page, labelled).

**Out of scope:** fog of war (see `design.md` §10), real terrain import, the painterly 3D
shading of `painted-cinematic.html`, the real sim.

## SM0b: readability pass (art director feedback, Oct 2026)

**Feedback:** blocks too small to read at the map zoom, and column/square look like smaller units
than a line; routing must blink army colour ↔ white; the order arrow should be a solid
translucent band with a filled head, separate from a thinner dotted footprint trail that fades.

**Scope:** symbol sizes with equal visual weight that shrink to the true footprint while zooming
in; routing blink; command band + filled head; fading dotted footprints; legend; docs §6, §7.

**Acceptance:** at the map zoom a column and a square read as the same unit size as a line; a
routing block blinks; a command reads as translucent and never hides the blocks under it;
footprints fade out over ~40 game minutes; in the painted world block = footprint.

## Later phases (draft, to refine after SM0)

| Phase | Scope |
|---|---|
| SM1 | Port the zoom transition into `painted-cinematic.html`: its terrain, light and river under the map texture |
| SM2 | Map bake in a worker; real heightmap and OSM features (shares the W6 importer in `../prototype-plan.md`) |
| SM3 | Unit symbols driven by the real `sim/` once it exists; overlap and layering rules |
| SM4 | Video export: directed map camera, trails as replay |

## SM0 review log

| Round | Findings | Severe | Notes |
|---|---|---|---|
| 1 | 10 | 3 | Allied initiative and cavalry charges never issued (path check before the centroid); order lines mirrored from behind the camera; orders to routing units never completed. All fixed. |
| 2 | 10 | 2 | Routing units skipped the destruction check; other overlay draws still projected from behind the camera. All fixed, plus roof normals, key panning, panel blur (gameplay invariant), order pruning. |
| 3 | 10 staff-map + W1b | 1 | `pow` on a negative base in the sprout and stand-up shaders; labels and neatline behind the camera; hachure occupancy grid. Fixed. W1b findings belong to the water branch. |

Stopped after round 3 (`../AGENTS.md`: more than 3 rounds means redesign). The round 3 fixes
were verified by screenshot at theatre, map and mid-zoom, not by a fourth review round. The
repeated finding class (projection behind the camera) points at one design fix for SM1: project
through a single clipped helper that every overlay draw uses.

## SM0b review log

| Round | Findings | Severe | Notes |
|---|---|---|---|
| 1 | 10 | 2 | Symbols wider than unit spacing hid neighbours; a routing block's white phase read as Austrian. Fixed (spacing, dashed edge kept on routing), plus footprint jumps, dash phase, frame-clock blink, depleted squares, stale docs. |
| 2 | 10 | 2 | Footprints built from a unit centroid jumped when battalions left or routed (second round in a row on this). **Redesigned:** a footprint is the order's own path up to the troops' reach. Also: symbols finish shrinking before soldiers stand; the sim no longer reads symbol sizes. |
| 3 | 10 | 2 | A comment swallowed the routing fill (routing invisible); re-ordering leaked the old order. Fixed and verified by a scripted test (no stale orders after three re-orders) and two blink frames. |

Stopped after round 3. Lesson: two inline-comment accidents in this file. Put comments on their
own line in minified-style code.
