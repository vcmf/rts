---
status: draft
last_reviewed: 2026-10-27
---

# Model: sectors, and what reads them

The math and code structure behind U1 (`docs/plans/active/u1-sectors.md`), from the unit model's § Facing and sectors
and decisions 0080, 0081 and 0082. The unit model says what a player sees; this document says how the sim computes it,
exactly enough that the code can be written from it and checked against it.

**How this document works.** Prose plans for U1 failed three rounds of review, each finding a case the words did not
pin down. Here every rule is:
- **a definition:** a function with its inputs, its output and its formula, in the frame it is computed in;
- **its properties:** what must hold for every input (P-1, P-2, …), stated so a test can check it;
- **its tests:** the test that proves each property, by name, on sampled inputs (seeded, so the same every run) and on
  the scenarios' cases.

The code follows the definitions; the tests check the properties, not the code's own answers. A review reads the
properties first: a property that does not say what the owner wants is a design bug, found before any code.

## 1. Frames and notation

- **A formation's frame:** origin at its anchor, `h` its heading as a unit vector, `r` its right (h turned −90°). A
  world point `p` has `x = (p − anchor)·r` (across, positive right) and `y = (p − anchor)·h` (along, positive ahead).
- **A block:** a company's placed rectangle, from the fire step's geometry (`FireGeo`: origin, rotation, half frontage,
  front and rear edges), as four world corners.
- **Arithmetic:** sums, products, quotients, comparisons and `sqrt` only (decision 0006). No `atan`, `tan`, `sin` or
  `cos` of a computed angle anywhere below; the few constants that come from angles are literal numbers, with the
  angle they stand for beside them.

## 2. The face

`faceOf(j)`, built once a tick for every formation in the fire step's geometry (`blockGeometry`, after the movement
step; stamped `fireGeoTick`), so every reader in the tick sees the faces after the move.

**Definition.** One of three kinds:
- **all:** a braced shape (`FormationDef.braced`, the square), formed. No geometry: every point is front.
- **one:** every other formed shape but a trail shape. From the blocks of its companies with men, corners projected on
  its frame: `L = min x`, `R = max x`, `F = max y` (the front edge), `B = min y` (the rear edge).
- **trail:** a trail shape (march column, limbered guns), formed. Two frames, each a company's own box: the head
  company's (the first with men; origin its centre, heading its facing on the trail) for the front, the tail
  company's (the last with men) for the rear. Each box is its company's four block corners projected on that frame,
  whatever the block's own rotation (a column of route's blocks lie at a quarter turn), so the head's front edge is
  the column's head and its width the column's (measured: 2.6 m for the infantry's column of route).
- **none:** a formation changing shape, whatever it changes from and to (the unit model: a formation changing shape
  has no front). Its `L`, `R`, `F`, `B` as for **one**, from its placed blocks, but no point is front (§ 3). Being
  caught changing shape, forming square included, is struck and drained as in the flank, or the rear from behind.

**Properties.**
- **P-1:** a line's face spans its companies with men: `L` and `R` move in when end companies are lost, each side on
  its own.
- **P-2:** a face is read after the tick's movement: a formation moved this tick is read where it now stands.
- **P-3:** a march column's head segment is `wc` wide, across the head's facing, whatever the rotation of its blocks.
- **P-3b:** a formation changing shape is never front, for any point.

## 3. The weight of a point

`pointWeights(face, p) → (front, flank, rear)`.

**Definition, kind one.** In the face's frame:
- `o = max(L − x, x − R, 0)`: how far `p` lies beyond the face's nearer end (0 within its width);
- `a = y − F` (ahead of the front edge), `b = B − y` (behind the rear edge);
- **the angle measure** `t(d, o) = o / (max(d, 0) + o + c)`, with `c = sectors.corner` (1 m): 0 straight ahead within
  the width, near 1 straight to the side, 0.5 on the 45° line from the nearer end at range (`d = o ≫ c`). The `c` keeps
  it continuous at the face's corner (`d`, `o` → 0), where a pure ratio jumps; at range it changes nothing that
  matters (P-7);
- **the blend** `s(t) = clamp((T + H − t) / (2H), 0, 1)`, with `T = 0.5` (45°) and `H = 0.088` (the band from t =
  0.412 to 0.588, that is 35° to 55°: the proposal's about 10° either side);
- **the corner ramp** `g(d) = clamp(1 + d / c, 0, 1)`: 1 ahead of the edge, falling to 0 a corner's length behind it,
  so a point sliding past the face's end from ahead to beside changes smoothly;
- `front = s(t(a, o)) × g(a)`, `rear = s(t(b, o)) × g(b)`, rescaled to sum to 1 if together above 1 (a face less
  than `c` deep), `flank = 1 − front − rear`.

A point inside another body's footprint (two bodies overlapping) needs no rule of its own: within `c` of the front
edge it is partly front, of the rear edge partly rear, deeper flank, continuously.

**Kind all:** `(1, 0, 0)`. **Kind none:** `front = 0`, `rear` as for one, `flank = 1 − rear`. **Kind trail:** `front`
from the head's box (its frame, read for `a`), `rear` from the tail's box (its frame, read for `b`), rescaled as above
(a column doubled back on itself); `flank = 1 − front − rear`.

**Properties.**
- **P-4:** the weights are each in 0..1 and sum to 1, for every point and every kind.
- **P-5:** a point straight ahead of the face, within its width, is front 1 at any distance, contact included (`o = 0`,
  `a > 0`).
- **P-6:** on the 45° line from the nearer end front is 0.5 within 0.05 from 50 m, within 0.02 from 150 m (the
  corner's `c` leans it a little to the front up close: measured 0.540 at 50 m, 0.507 at 300 m); at 35° front is 1
  within the same; at 55°, 0 within the same (measured 0.046 at 50 m, 0.007 at 300 m).
- **P-7:** scale: from 150 m, moving a point out along its ray from the nearer end by up to 3 times changes its
  weights by less than 0.02.
- **P-8:** mirror (kinds one and none): a point and its mirror across the face's centre line have the same weights.
- **P-9:** monotone: walking round the face's end at a fixed distance, from straight ahead to straight to the side,
  front never rises and flank never falls; the same round the rear.
- **P-10:** continuity: away from the degenerate core, a point moved 0.1 m changes its weights by at most 0.2, at
  range and at the face's corner alike.
- **P-11:** a square is front from every side, corners included.
- **P-12:** A-04: a point 60° off the centre of a 93 m line, within 90 m of its centre, reads front 1 (it lies within
  35° of the nearer end); in general a point within 35° of the nearer end, at range, reads front 1.
- **P-13:** a march column is front only ahead of its head, within 35° of the head segment's ends (a wedge about 70° to
  90° wide at range); abreast of its body, on either side, it is flank; behind its tail, rear; turned 90° on a road,
  an enemy abreast of the body is flank and one behind the tail rear.

## 4. The weight of a threat

`threatWeights(face, Q) → (front, flank, rear)` for a threat that is a block `Q` (a charger's or a shooter's company).

**Definition.** `Q`'s corners projected on the face's frame give its span across, `[x0, x1]` (for a trail, the front
read on the head's frame and the rear on the tail's, each the mean over its own slices, then rescaled as in § 3). The
span is cut into `N = 8` equal slices; for each slice's centre `x`, the slice of `Q` at that `x` is an interval `[ymin, ymax]`, and its
**nearest point to the body** is `y = ymin` if `ymin > F`, `ymax` if `ymax < B`, else the point of the interval nearest
`(F + B) / 2`. The threat's weights are the mean of the eight points' weights (§ 3). A point threat (a centre) is one
slice.

**Properties.**
- **P-14:** a block straight ahead within the face's width is front 1; at contact, a block straddling the face's end
  reads front about in proportion to the share of its width that overlaps; at range, all of it within 35° of the
  nearer end reads front 1.
- **P-15:** a squadron striking a line's end at right angles (its span within the line's depth, beside its end) reads
  flank 1.
- **P-16:** stability: a block at least 8 m wide, not overlapping the formation, moved 0.1 m in any direction changes its
  weights by at most 0.05, at range and at contact (each slice by at most P-10's 0.2, and only a slice or two in the
  corner at once).
- **P-17:** the result is the same, within 1e-12, whatever the order of `Q`'s corners; a charger's companies are summed
  in company order, so the side struck is the same bit for bit however they are listed.

## 5. What reads the weights

Each reader is a formula over `(front, flank, rear)` and ruleset numbers.

- **Exposure (fire):** `exposure(j, k) = base(kind of j) × (front + flank × eF + rear × eR)`, with `w =
  threatWeights(face of j, block of shooting company k)`, `eF`, `eR` from `FormationDef.exposure` (each ≥ 1, refused
  when the ruleset compiles otherwise). It replaces `depthByKind` in a volley's λ and canister's.
  - **P-18:** front fire is today's (`eF`, `eR` unused when front is 1); fire from a flank or the rear is never less
    than from the front (A-07).
- **The side struck (charges):** `side(i, j) = Σ_k men_k × threatWeights(face of j, block of k) / Σ_k men_k` over the
  charger's companies in contact (the impact's `inContact` mask; all its companies at the test). The test's threat and
  the impact's shock read it as `byWeights(table, side)`.
  - **P-19:** lines meeting square on read front 1; X-19 (four squadrons, offset 20 m) reads front 0.84 within 0.03
    (the squadron overhanging the end reads mostly flank); offset 30 m, 0.78 within 0.03.
- **The second enemy (E-16, decision 0080):** an impact on a battalion that was in melee with another when the step
  began (`S.inMelee0`, its own copy of the melee pairs taken before the charges move; `S.foe0`, taken after them for
  the melee pairs' strikes, stays as it is) adds `second = flank × sF + rear × sR` to its shock,
  once, not scaled by momentum. The ruleset refuses `sF` or `sR` over 0.6 of the gap from the default quality to the
  rout, as it refuses a contagion shock.
  - **P-20:** the second shock is the same in the reversed visiting order, including when the battalion's own charge
    makes contact in the same tick; it is never alone a rout of a battalion at the default quality.
- **The drain (decision 0081):** for battalion j, `Δ = max over its threats e of (flank_e × dF + rear_e × dR)`, the
  weights from `threatWeights(face of j, e's nearest company)` (§ 6). Its morale target `τ` becomes
  `τ − min(Δ, max(0, τ − W))`, with `W = morale.wavering[0]`: the drain lowers the target at most to the wavering
  threshold, and never touches a target already below it. With the numbers of § 8, a steady line (target 0.75) with
  an enemy on its flank settles at 0.65, still steady; with one behind it, 0.55: shaken.
  - **P-21:** two threats on one flank drain no more than the worse of them.
  - **P-22:** the drain never routs a battalion by itself, and never raises a target.
  - **P-23:** a threat in front drains nothing; a square is never drained.
- **No wavering fall-back** (decision 0082): a wavering battalion keeps fighting, with the penalties it already has,
  until it recovers or routs, as in Total War. The automatic 15 m Retire (`fallBack`), its fields `falling` and
  `fellBack` and the ruleset's `morale.fallback` go. So nothing reads the morale's fall, and the drain needs no
  exception.
  - **P-24:** a wavering battalion with no orders, losing men with an enemy in front, stands and fires; it never Retires
    by itself.

## 6. Who can hurt a battalion

`drainBy(w, G, e, j)`, for the drain: e's `Δ` on j if e can hurt j, else 0. **The nearest pair:** of e's companies with men and j's, the pair whose centres are
nearest, ties to the lower company indices: `ke` and `kj`; `dist` their centres' distance. True if enemy `e` is in the
fight, not in melee and not changing shape, `dist <= sectors.reach` (300 m), the weights `threatWeights(face of j, ke)`
have flank or rear above 0 (else nothing to test: it costs no rays), and either:
- **by fire:** `e` fires in its shape (an infantry type that fires; a battery in a shape its artillery fires from,
  `artillery.from`), whatever its fire mode and whether or not it moves (a line holding its fire, or advancing, could
  fire in a moment); `kj` within `ke`'s range and arc (`inArc`); a clear sight line over the ground (fire's cached
  `sees(w, G, ke, kj)`); and **unscreened:** of the three rays from e's company to j's nearest company, at
  least one for musketry, all three for a battery, cross no block of j's side but j's own (`screenShare(w, G, k, m,
  side, centre)`, fire's ray test with the side and the target given; `clearShare` stays as it is);
- **by a charge:** `e` can charge now (its type charges, its shape is in `charge.shapes`, not blown), `dist <=
  melee.refuge.alert` (200 m), and unscreened: the centre ray from `ke` to `kj` crosses no block of j's side but j's
  own.

**Read once, before anything changes:** `threatPass(w)` runs in `tick.ts` before the morale loop (step 12), every
battalion's `Δ` from the state as steps 5 to 11 left it (positions, shapes, changes; the melee pairs as step 10 left
them), into a scratch array; each battalion's `moraleStep` then reads its own `Δ`. Nothing a battalion's morale step
changes (a rout, a cut change) reaches another's `Δ`.

**Properties.**
- **P-25:** a march across an enemy line's front within its range drains; behind a friendly line that blocks every
  ray, nothing; beyond its range or 300 m, nothing; an enemy facing away (out of its arc), nothing; behind a crest or a
  dense wood, nothing.
- **P-26:** a battery with one ray of three screened is no threat; a limbered battery is none; enemy cavalry in a shape
  it charges from within 200 m is, blown or in march column it is not, and behind a screen of friends it is not.
- **P-27:** order independence: the reversed visiting order gives the same state, including when a battery routs in
  the middle of a change of shape in the same tick.

## 7. Code structure

| Module | What | Signatures |
|---|---|---|
| `src/sim/sectors.ts` (new) | faces, point and threat weights, `byWeights` | `buildFaces(w, G)`; `pointWeights(w, j, x, z, out)`; `threatWeights(w, G, j, i, k, out)` (k a company of formation i); `byWeights(t, w)` |
| `src/sim/fire.ts` | the faces built with the geometry; exposure; the screen test | `blockGeometry` calls `buildFaces`; `exposure(w, G, k, j)`; `screenShare(w, G, k, m, side)`; `inArc` and `sees` exported for `drainBy` |
| `src/sim/artillery.ts` | canister's exposure | the cone's λ takes `exposure` for the aimed target |
| `src/sim/melee.ts` | the side struck; the second enemy | `sideOf(w, G, i, j, mask, out)` replaces `quarter` (`sideStruck(w, i, j)` exported for the tests); `S.inMelee0` copied before the charges; the geometry it builds is stamped `fireGeoTick` |
| `src/sim/morale.ts` | the threats, the drain; the fall-back removed | `threatPass(w)` into `scratch.drain` (the geometry reused or built); `drainBy(w, G, e, j)`; the target's drain in `moraleStep`; `fallBack` and `enemyAhead` removed |
| `src/sim/tick.ts` | the threat pass before the morale loop | `threatPass` called once, after casualties, before the battalions' morale |
| `src/sim/ruleset.ts`, `src/rulesets/napoleonic.ts` | the numbers and their guards | `FormationDef.exposure`, `sectors`, `morale.drain`, `melee.second`; `morale.fallback` removed |

**Style:** `docs/conventions.md` § Code: every function in the table gets a doc comment (`/** */`) with its parameters'
units (metres, the weights' order front, flank, rear); small functions, one job each; Prettier and the determinism lint
(decision 0006) in `src/sim/`.

**Scratch, not state:** the faces (in `FireGeo`, rebuilt each tick from positions) and `scratch.drain`. **State:** no
field added; `falling` and `fellBack` removed. The geometry is built at most once a tick: by the fire step when anyone may
fire, else by the first of the melee or morale steps that needs it, which stamps `fireGeoTick` so the next reuses it.

**The tick:** step 5 moves; step 8 (fire) builds the geometry and faces and reads exposure; step 10 (melee) reads the
side struck and the second enemy; before step 12's loop, `tick.ts` runs the threat pass; then each battalion's morale
with its drain.

## 8. Numbers (first guesses; in `src/sim/sectors.ts` until step 3 moves them into `src/rulesets/napoleonic.ts`)

| Number | Value | Stands for |
|---|---|---|
| `sectors.blend` | `T` 0.5, `H` 0.088 | 45°, and 35° to 55° |
| `sectors.corner` | `c` 1 m | the corner's length: continuity at contact |
| `sectors.slices` | 8 | the threat's slices (§ 4) |
| `sectors.reach` | 300 m | the canister range: no threat farther off |
| `exposure` (flank, rear) | line 1.8, 1.2; column of attack 1.2, 1.1; march column 1.5, 1.0; cavalry 1.2, 1.1; guns 1.5, 1.0 | the unit model's table |
| `morale.drain` | flank 0.1, rear 0.2 | an enemy on its flank presses a steady line (0.75 → 0.65); one behind it makes it shaken (0.55) |
| `melee.second` | flank 0.15, rear 0.2 | under the guard (0.6 × 0.35 = 0.21) |

## 9. Tests

**Proved (step 2):** `test/sectors.test.ts`, P-1 to P-17 and P-3b, 18 tests, on the shipped ruleset's line, column of
attack, column of route, square, cavalry line and battery, limbered and unlimbered.


`test/sectors.test.ts` (new) proves P-1 to P-17 on sampled inputs: faces and points drawn from a keyed stream
(`keyedStream`, a fixed seed), a few thousand per property, for each kind of face (a line, a column of attack, a march
column straight and turned, a square, a battery), plus the named cases (A-04, the line's end, the turned column).
`test/fire.test.ts`, `test/charge.test.ts` and `test/morale.test.ts` prove P-18 to P-27 on the scenarios (A-01 to
A-07, A-09, A-10, B-08, C-06, G-04, E-16) and the reversed visiting order. A property that fails is a design question
first: this document changes before the code does.

## 10. Order of work

1. This document reviewed, its properties first.
2. `sectors.ts` and `test/sectors.test.ts` alone: P-1 to P-17 proved, nothing else in the sim changed, no golden
   moved; the bench's Sectors layer to judge the wedges by eye.
3. The readers (§ 5, § 6) one at a time, each with its properties' tests, then the goldens regenerated once.
