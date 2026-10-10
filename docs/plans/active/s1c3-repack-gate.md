---
status: active
last_reviewed: 2026-10-10
---

# Plan: S1c-3, the casualty re-packing gate

The third part of S1c (`docs/plans/active/s1c-fire-morale.md`, the split). It closes the known issue
"casualty re-packing moves men sideways without the footprint gate" (`docs/known-issues.md`, since S1a).

## The problem, measured

Which slots are filled follows from the men per company by one rule (`occupied`,
`docs/systems/formations.md`). When a man falls, the rule re-packs his company: files close toward the
colours or the centre, and the rear rank refills. **From five men up, a re-pack never widens a company's
block.** Every slot filled after a loss lies inside the block of files and ranks that was filled before.
Below five, the last men gather into one full-depth file and the block can deepen by a rank; real
companies never get that small. A man can still
step onto ground no other man stood on: the rear-rank slot of a file whose front ranks were filled, or
the slot beside where the fill re-centres.

A probe measured how often that slot is impassable, on the formation field along the stream (x 30–75 m,
z −160..160 every 40 m). The battalions were spawned dry, then lost men one at a time from each company
in turn, from 100 down to 40.

| Headings | Dry positions | Losses | Losses that put a man on impassable ground |
|---|---|---|---|
| 0, ±90°, 180° | 8,879 | 532,740 | **0** |
| ±45°, ±135°, 0.3, −1.2 rad | 24,544 | 1,470,252 | **41** (0.17% of positions) |

All 41 are columns (14) and march columns (27) at an angle to the bank. All happen at the same step: a
company of 25 losing its 25th man. It drops from 9 files to 8, and the fill re-centres sideways onto a
slot whose 1 m terrain cell is water. So the issue is real but rare. It needs a diagonal bank under a
diagonal block.

## Design

**One way to remove a man,** used by the casualty step and `debug-kill`: `removeMan(w, i, c)` in
`formation.ts`, beside `occupied` and `wetBins`.
1. Remove the man from company c. If no filled slot of the companies the re-pack can touch is newly on
   impassable ground (`wetSlots`: c's own, or c's half for a line), done. Far from impassable ground the
   check is skipped.
2. Otherwise put him back and try the battalion's other companies with men. Companies with hits still
   owed this tick come first, then the rest, each set nearest by index first. The first whose loss leaves
   no slot newly wet takes it.
3. If none does, the loss stands in company c (or the nearest company with men, if c has none), and the
   battalion's `pressed` count goes up. The count is not a status, so it never hides another (a router's
   `halted`).

**No random draws on a retry:** `debug-kill` still draws its company from the world stream, once per
man, then the gate decides. Casualties keep their keyed draws.

**What changes for the player:**
- the man who falls may belong to the next company, not the one the hit was aimed at. In the probe
  that was one loss in 62,000 over all headings (1 in 36,000 at diagonal headings only);
- the volley's company-level rule ("hits only on companies the shooter can see") can bend in that
  case. The plan accepts it; the alternative leaves a man standing in the water.

**Cost:** `wetBins` returns at once when the battalion is far from impassable ground (its distance
field). Near the stream it costs one footprint check per loss. Losses are a few men per tick.

## Acceptance

1. **The probe, as a test:**
   - the 41 positions found (fixtures from the probe) now show no man on impassable ground at any step;
   - a reduced sweep over the diagonal headings shows none either, and no `pressed` count on this field.
2. **The rule:** for every shape, every lean and every men count 5..27 per company, the slots filled
   after one loss lie inside the block filled before. A test of `occupied` alone, no terrain.
3. **The fallback** (`pressed`) is reached in a constructed case: a battalion every one of whose
   alternatives would wet a slot. It is built by painting impassable cells into a copy of the terrain.
4. **Determinism:**
   - the goldens move (the gate is a new rule) and replays and save round trips still reproduce;
   - the fire step's reversed-order test still passes.
5. **Negative runs:**
   - the gate removed: the fixture test fails;
   - the alternatives' order changed to random: not run. The sim's lint already bans random sources in
     `src/sim/`, and no golden scenario reaches an alternative, so the determinism tests could not see it.
6. **Docs:**
   - the known issue is removed from `docs/known-issues.md`;
   - `docs/systems/formations.md` and `docs/systems/fire-morale.md` describe the gate;
   - the probe is kept as `tools/repack-probe.ts`.

## Non-goals

- Changing the fill rule itself.
- Any gate on movement (S1a's footprint gate already covers poses).

## Results (2026-10-10)

Built as planned:
- `removeMan` is in `src/sim/formation.ts`. The casualty step and `debug-kill` go through it.
- `tools/repack-probe.ts` runs in about 2 minutes.
- `test/repack.test.ts` has 5 tests.

**The probe:** all four shapes, ten headings, the stream bank from x 30 to 75 m every 0.25 m, z −160..160
every 40 m. That is 42,228 dry positions and 2,531,292 losses.

| | Positions where a loss put a man newly on impassable ground | `pressed` |
|---|---|---|
| without the gate | 41 (0.10%) | none |
| with the gate | **0** | **0** |

**The tests:**
- **The 41 cases:** they are fixtures. Each one wets a bin without the gate and none with it.
- **The rule:** "the block never widens" holds from 5 men per company up. The first draft claimed it for
  any count; the test found that 4 → 3 deepens a company into one full file (corrected above).
- **The fallback:** `pressed` is reached on painted terrain with no alternative company.
- **The negative run:** with the gate removed, the fixture and fallback tests fail.

**Determinism:** in the first build no golden moved: none of the golden scenarios reaches the gate, so
normal play is unchanged. Round 1 added the `pressed` column, which is hashed state, so both goldens were
regenerated then. `SIM_VERSION` is `s1c.2`, because the rule can change a replay near a bank.
`SAVE_FORMAT` is 5 (the new column).

**The known issue is closed:** removed from `docs/known-issues.md`.

**Review round 1 (#18).** One severe finding and eight others, all fixed:
- **The fallback no longer touches the status.** A `pressed` loss used to overwrite `halted`, so a router
  halted at the bank and hit in the same tick was taken for fled and stopped trying other directions. The
  fallback is now a per-battalion count. A test keeps `halted` through a pressed loss.
- **The gate judges men, not bins.** A man moving onto water inside a bin that already had a wet man used to
  pass. `wetSlots` compares slots of the companies the re-pack can touch. A test stands a company in water
  everywhere and still catches the newly wet men; judging by bin fails it.
- **The casualty step:** losses are fixed per company first, the remaining owed hits rank the
  alternatives, and a diverted loss can no longer vanish.
- **`removeMan`** refuses an empty company (it used to drive the count negative), returns −1 when the
  battalion has no men, and allocates nothing.
- **Tests:** the fixture test checks that a man fell. A reduced sweep along the bank is a test.
- **Small:** buffers sized from `MAX_BINS`, a ruleset check that a company fits a 32-bit slot mask, and the
  frequency figures agree.

The probe gives the same result with the redesigned gate: 41 cases without it, 0 with it, 0 pressed.

**Review round 2.** No severe findings, so this is the last round. The worthwhile ones are fixed:
- **The alternatives** rank by the hits the volleys put on each company this tick, not the hits left after
  processing.
- **Less repeated work:** the places context and the "near impassable ground" check are built once per
  battalion per step. For a line, one company per half is tried, since any company of a half gives the
  same fill.
- **`SAVE_FORMAT`** goes to 5.
- **The known issue** is struck through with #18, not deleted.
- **The sweep test** asserts that it holds cases needing the gate.

One finding was checked and found not to hold: "the rebalance after a formation change re-packs without the
gate". `changeWet` refuses a change unless every slot along it, filled or empty, is passable, and the
battalion does not move while changing. So the rebalanced counts can only fill slots already proven dry.
A comment says so. Not done: sharing one footprint walk between `wetSlots` and `wetBins` (light).

The cost tests failed in this round's full runs with the machine at a load average of about 100. Run back
to back, `main` failed the same test under the same load (6.4–8.3 ms per tick against 7.5–8.4 on the
branch). The cost is load, not the gate.
