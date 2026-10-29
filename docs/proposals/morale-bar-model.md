---
status: draft
last_reviewed: 2026-10-29
---

# Model: the morale bar and experience

The math and code structure behind U2, from the unit model's § Experience and § Morale (`docs/proposals/unit-model.md`)
and its scenarios (`docs/proposals/unit-scenarios.md`: B-02, C-01, C-02, E-05, E-08, E-09, G-01, G-05, G-06, G-08,
H-01, H-04, H-05). The unit model says what a player sees; this document says how the sim computes it, exactly enough
that the code can be written from it and checked against it. It works as `docs/proposals/sectors-model.md` does: each
rule a definition, its properties (numbered on from that document's: P-28 to P-43) and the tests that prove them. A
review reads the properties first.

Where this document departs from the unit model, § 10 says so and why; those are the owner's to decide before any code.

## 1. Units and notation

- **Points:** the bar's unit. Level 2's bar holds 100. Today's morale is a number in 0..1 whose margin from the
  default quality (0.75) to the rout (0.4) is 0.35; that margin is level 2's 100 points, so **one unit of today's
  morale is k = 100 / 0.35 ≈ 285.7 points.** Every number below that has a value today is today's × k, rounded, so
  level 2 behaves as today's average battalion.
- **A formation i** has: its level `ℓ ∈ 1..6`; its points `pts`; its bar `B` (points, not clamped below); its maximum
  `Bmax`; the cost of its losses since the last write-off `cost`; whether it has gained a level this battle `up`; its
  spawn strength `start` and men now `men`, as today; and its state.
- **A level's row** `L[ℓ]` (ruleset data, § 8): its points to reach it, its bar, and its effects.
- **Arithmetic:** sums, products, quotients and comparisons only (decision 0006). Every step below runs once a tick,
  in the order given.

## 2. The bar's maximum

- **At spawn:** `Bmax = L[ℓ].bar`, or the scenario's own `bar` when it sets one (tests and calibrations set a bar apart
  from the level, as they set `quality` today). `B = Bmax`, `cost = 0`, `up = 0`, `pts = L[ℓ].points`, steady.
- **A rally** multiplies it by `1 − rally.cut` (§ 6). **A level up** multiplies it by `L[ℓ+1].bar / L[ℓ].bar` (§ 7), so
  a set bar and the cuts both carry over: after n rallies and any level ups, `Bmax = bar₀ × (1 − cut)ⁿ × L[ℓ].bar /
  L[ℓ₀].bar`.
- **Properties.**
  - **P-28:** a spawned formation has `B = Bmax = L[ℓ].bar` (or the set bar) and is steady; `Bmax` changes only at a
    rally or a level up, by the factors above.

## 3. What empties and fills the bar

The bar `B` is a stock: losses and shocks take points from it, recovery and level ups give them back.

- **Losses:** each man lost costs `morale.loss / start` points, `morale.loss` (≈ 357) being what the whole spawn
  strength costs. `B −= lost × loss / start` and `cost += lost × loss / start`, in step 12 with the tick's casualties:
  at once (the owner's choice, § 10: the bar works as hit points). The calibration anchor: today's average line breaks at a loss of 0.35 / 1.25 = 28% of its men, so `loss = 100 /
  0.28 ≈ 357`.
- **Shocks** take their points from `B`: a friend's break nearby (contagion), a charge's threat at the test, a charge's
  impact, a second enemy (all of today's, × k: § 8). A shock does not add to `cost`.
- **Recovery:** while the formation is steady, shaken or wavering, `B` rises by `morale.regen × dt` up to its ceiling
  `C = Bmax − scar × cost`, and never above it, under fire too (today's relax let a shock wear off under fire, and a
  charge's melee depends on it). Shocks are recovered in full; losses only by `1 − scar` of their cost (`scar = 1`:
  losses are never recovered, as today).
- **Properties.**
  - **P-29:** a man lost costs exactly `loss / start` points whenever he falls; the whole spawn strength costs `loss`.
  - **P-30:** a level 2 battalion with no support or shocks routs on the tick its losses pass 28% of its men (to
    one man); one set to a bar of 71 at 20% (C-01's weaker line, G-01).
  - **P-31:** a shock of `s` points lowers `B` by exactly `s`; the same shock is `s / Bmax` of a bar, so a smaller share
    of a bigger one (G-05).
  - **P-32:** no recovery while routing or rallying; otherwise `B` rises at `regen` a second to `C` and stops there; a
    formation that has lost men never recovers above `Bmax − scar × cost`.

## 4. What the states read: the bar's effective level

Two things act on the states without being part of the stock, each while its cause stands, as today:

- **support** `S = support.bonus × (secured flanks)`, points (today's bonus on the target × k);
- **the back exposed** (decision 0081): the drain `D` (`threatPass`, U1, in points), down to the wavering threshold at
  most.

```
E0 = B + S
E  = E0 − min(D, max(0, E0 − wavering.enter × Bmax))
```

- **Properties.**
  - **P-33:** the effective bar is exactly `B + S` less the capped drain; neither support nor the drain changes `B`.
  - **P-34:** each secured flank adds exactly `support.bonus` to `E` (G-03: a supported line routs later, by
    `support.bonus / loss` of its men per flank).
  - **P-35:** the drain never takes `E` below `wavering.enter × Bmax`; on a formation already below it, it does nothing;
    the drain alone never routs (decision 0081).

## 5. The states

The share `s = E / Bmax`. With hysteresis, as today:
- **down:** below `wavering.enter` wavering; else below `shaken.enter` shaken (never up a step on the way down);
- **up:** one step at a time: wavering to shaken at `wavering.back` or more, shaken to steady at `shaken.back` or more;
- **the rout:** at `E ≤ 0` it routs, as today at the rout threshold. `B` is not clamped at 0, so support decides
  the tick of the rout as it decides it today.
- A wavering formation keeps fighting (decision 0082); what else wavering changes is U3's.

- **Properties.**
  - **P-36:** the states are a function of `s` and the state before, with the hysteresis above; a formation never goes
    from wavering to steady in one tick; it routs on the first tick with `E ≤ 0`, and not before.

## 6. Rally and shattering

A router rallies as today (its run over, no enemy within `rally.safe`, no loss for `rally.calm`). Then:
- `Bmax ×= 1 − rally.cut` (brittle for the battle); `B = rally.share × Bmax`; `cost = 0` (what its losses
  cost is written off, as today's rally writes off its losses); rallying for `rally.time`, then its state from `s`.
- It shatters, as today, when it routs more than `rally.max` times or below `shatter` of its spawn strength. Today's
  further condition (quality less the rally's cost still above wavering) goes: the cut and `rally.max` bound it.

- **Properties.**
  - **P-37:** a rally leaves `Bmax` cut by `rally.cut`, `B = rally.share × Bmax`, `cost = 0`; the state after
    `rally.time` is never wavering (the guard, § 9); a third rout shatters (G-08).

## 7. Experience: points and the level up

- **Points come from fighting,** to a formation in the fight (not routing, rallying or shattered), in step 12:
  - **men struck:** the expected men its fire (musketry, canister, roundshot) or its melee and impact take from the
    enemy, after the target's toughness, × `points.man`; credited where the hits are owed, from the same expected
    number (no draw of its own);
  - **under fire:** `points.fire` a second while it has lost a man in the last `points.window` seconds (10);
  - **a charge turned away:** `points.repulse` when a charger recoils from it;
  - **an enemy broken in front of it:** `points.broke` when an enemy routs that stands in its front (front weight at
    least ½, `pointWeights`, U1) within its fire range (`reachOf`).
- **A level up:** on the tick `pts ≥ L[ℓ+1].points`, if `ℓ < 6` and `up = 0`: `ℓ += 1`, `up = 1`, `Bmax ×= L[ℓ].bar /
  L[ℓ−1].bar`, `B = Bmax`, `cost = 0`; the level's other effects (§ 8) apply from the next tick. A formation gains at
  most one level a battle (H-05); its points go on counting, and the next level waits for the next battle. Levels 5
  and 6 are reached only this way: a scenario may set them, the army builder (later) may not buy them.
- **The level never falls,** and points never decrease.

- **Properties.**
  - **P-38:** a formation's points are the sum of its credits, each exactly as defined; none to a formation out of the
    fight; the expected men credited are those owed to the target.
  - **P-39:** a level up happens on the tick the threshold is reached and changes `ℓ`, `Bmax`, `B` and `cost` exactly as
    defined; at most one a battle; none past level 6; the level never falls (H-01, H-05).

## 8. Numbers (first guesses; ruleset data)

**The levels** (`levels`, one row each; names are the era's, decision 0015):

| | 1 Recruits | 2 Line | 3 Veterans | 4 Young Guard | 5 Middle Guard | 6 Old Guard |
|---|---|---|---|---|---|---|
| `points` to reach it | 0 | 100 | 300 | 700 | 1500 | 3100 |
| `bar` | 70 | 100 | 120 | 140 | 160 | 180 |
| `toughness` (owed men ÷) | 0.9 | 1 | 1.1 | 1.2 | 1.3 | 1.4 |
| `reload` (× `fire.reload`, `artillery.reload`) | 1.12 | 1 | 0.92 | 0.88 | 0.84 | 0.8 |
| `precision` (× hit chance; canister's hits ×, roundshot's `spread` and `short` ÷) | 0.85 | 1 | 1.1 | 1.15 | 1.2 | 1.25 |
| `drill` (× change times, Face about's, and the longest dressing) | 1.3 | 1 | 0.85 | 0.8 | 0.75 | 0.7 |
| `react` (× `melee.refuge.react`) | 2.5 | 1 | 1 | 0.5 | 0.5 | 0.5 |
| `pursue` (× `charge.pursue`) | 2 | 1 | 0.8 | 0.7 | 0.7 | 0.7 |

The unit model's fire discipline row (C-04) is U3's; replenishment between battles is later.

**The morale numbers,** today's × k where there is one:

| Name | Today | Points | |
|---|---|---|---|
| `morale.loss` | `losses` 1.25 | 357 | the whole spawn strength |
| `morale.support.bonus` | 0.04 | 11 | a secured flank |
| `morale.contagion.shock` | 0.15 | 43 | |
| `morale.drain` | 0.1, 0.2 | 29, 57 | flank, rear |
| `melee.threat` | 0.12, 0.25, 0.3 | 34, 71, 86 | front, flank, rear |
| `melee.impact.shock` | 0.2, 0.35, 0.4 | 57, 100, 114 | |
| `melee.impact.kill` | 0.12 | 0.06 | halved: the men lost at the impact now land at once with its shock (§ 10) |
| `melee.second` | 0.15, 0.2 | 43, 57 | |
| `morale.shaken` | 0.6, 0.65 | share 0.6, 0.7 | enter, back (today's 0.57, 0.71 of the margin, rounded) |
| `morale.wavering` | 0.5, 0.55 | share 0.3, 0.45 | (today's 0.29, 0.43) |
| `morale.regen` | relax over 20 s | 2 a second | today's relax recovers a 43-point shock at about 2 a second at first |
| `morale.scar` | | 1 | losses never recovered, as today |
| `rally.cut`, `rally.share` | `cost` 0.1 | 0.25; 0.5 | today's cost is 0.29 of the margin; G-08's half bar |
| `points.man`, `fire`, `repulse`, `broke` | | 0.5; 0.05 a second; 15; 25 | |

The points are set so a recruit line that wins a firefight like the calibration's (about 80 men struck, 9 minutes
under fire, one enemy broken) gains about 100: level 2 in a battle or two (H-01). `quality`, `losses`, `recent`,
`recentTime`, `relaxTime` and `rout` go from the ruleset, and so does each formation's count of recent losses.

**The test scale:** a test or calibration that sets today's quality `q` sets the bar `100 × (q − 0.4) / 0.35` instead:
C-01's 0.8 and 0.65 become 114 and 71; the S1e battle's veterans (0.85) become level 3 (bar 120; 129 by the formula).
The bench's melee cases (X-15 to X-20) give their raw regiment a bar of 145 (X-17's 130): it takes the impact's shock
and its men lost at once, and a smaller bar breaks on contact, with no melee to hold.

## 9. Guards (the ruleset is refused)

- any single shock (contagion, the charge's threat or impact, the second enemy) above 0.6 of level 2's bar, as today
  (0.6 of the margin);
- `rally.share` at or below `wavering.back`, so a rallied formation is never wavering at once;
- `levels` not six rows, points not increasing from 0, a bar not above 0 or not increasing, a factor not above 0;
- `wavering.enter < wavering.back ≤ shaken.enter < shaken.back ≤ 1`; `scar` outside 0..1; `regen` below 0.

- **Properties.**
  - **P-40:** each guard refuses a ruleset that breaks it and accepts the Napoleonic one.

## 10. Where this departs from the unit model (for the owner)

1. **The drains stay a pressure, not a per-second emptying.** The unit model's § Morale lists drains among what empties
   the bar "per second while their cause stands"; decision 0081 made the back exposed a pressure while it lasts, down
   to wavering at most, and U1 built it so. It stays that, in points (§ 4). G-09's fire without reply and D-04's guns
   (U4) can be drains of the same kind.
2. **Support adds to the effective bar, as today,** not to the recovery rate. A faster recovery would not hold a line
   that is losing men faster than it recovers, so G-03 ("both flanks covered: holds longer than alone") would no longer hold. H-03's
   commander (S2) is the one that raises the recovery rate.
3. **Losses land at once, and there is no burst** (the owner, 2026-10-29: the bar is hit points). Today's morale moved
   toward its target over about 20 s, so a heavy loss, and today's extra term for recent losses, reached it slowly;
   the bar takes each man lost on the tick he falls, and the extra term goes. A charge's impact then cost its losses and
   its shock together, and broke a level 2 regiment on contact: `melee.impact.kill` is halved (0.06), which keeps every
   charge calibration target, and shocks wear off under fire as they did (§ 3).
4. **The guard is today's** (one shock against level 2's bar), not "one contagion shock and a minute of every drain
   against level 1's bar": the drains cannot empty a bar (point 1), and 43 + 57 points would refuse today's numbers
   against a recruit's 70.
5. **The rally** cuts the maximum by a share and refills half of it (G-08), in place of today's quality cost.
6. **A wavering formation does not fall back** (decision 0082); the unit model's § Morale still says it does, and is
   corrected with U2.

## 11. Risks

- **Losses at once** (§ 10, point 3) make every sudden loss harder than today: a charge's impact above all, which is
  why `impact.kill` is halved. Measured at step 2: C-01's 100 m firefight breaks in 9.1 minutes (8.5 before), at 20%
  losses; the 3v3 brigade's first break at 10.1 (9.7); every charge target holds.
- **The S1e battle's balance** moves with the veterans' level 3 (their reload, precision and toughness are new) and is
  retuned, as U1's was.

## 12. Code structure

| Module | What |
|---|---|
| `src/sim/morale.ts` | the bar: losses, shocks, recovery, the effective level, the states, rout and rally (§§ 3–6); `moraleShare(w, i)` for the page |
| `src/sim/experience.ts` (new) | points and their credits, the level up (§ 7); `levelOf(w, i)`, the row's factors for the readers |
| `src/sim/ruleset.ts`, `src/rulesets/napoleonic.ts` | `levels`, `points`, the morale numbers in points, the guards (§§ 8–9) |
| `src/sim/fire.ts`, `src/sim/artillery.ts`, `src/sim/melee.ts` | toughness where men are owed (`oweByMen`: volleys, guns, charges, melee), reload, precision, the credits; `react` and `pursue` |
| `src/sim/formation.ts`, `src/sim/morale.ts` | `drill` from the level (set at the spawn), scaling the longest dressing too |
| `src/sim/commands.ts` | `debug-spawn` takes `level` (default 2) and `bar` in place of `quality`; `debug-morale` sets `B` |
| `src/sim/world.ts`, `src/sim/serialize.ts` | `level`, `pts`, `B`, `Bmax`, `cost`, `up` in place of `quality`, `morale`, `baseMen`; the save format moves |
| `src/app/main.ts` | the panel: level, its name, the bar and how near the next level is |

## 13. Tests

- `test/morale.test.ts`: P-28 to P-37 on scripted battalions (the existing morale tests move onto the bar: the scale
  in § 8), and the reversed visiting order on the bar's state.
- `test/experience.test.ts` (new): P-38 and P-39; each level's factors against level 2's (B-02 on a change's and
  a Face about's time, exactly; C-02's reload on each new reload, within its jitter; precision and toughness on a
  line's and a battery's canister losses over the same seeds, within 0.05 of the ratio; E-05's reaction and E-08 and
  E-09's pursuit, exactly); P-40 in `test/ruleset.test.ts`.
- **Calibrations:** C-01 (`tools/calibrate-fire.ts`, bars 114 and 71: the weaker breaks in 6–10 minutes); C-02 (level 3
  against level 1 at 100 m: the veteran wins clearly with about half the losses); H-04 (level 5 against two level 2
  battalions: holds a while, then loses); G-06 (level 6 stands about 2.5 times the fire of level 2). New cases in
  `tools/calibrate-fire.ts`.

## 14. Order of work

1. This document reviewed, its properties first.
2. **The bar at level 2:** the morale machine on the bar, every number converted (§ 8), levels without effects but
   their bars; tests moved to the bar scale; C-01 and the 3v3 calibration compared with today's.
3. **The levels' effects:** toughness, reload, precision, drill, react, pursue, each with its test.
4. **Points and the level up**, with the panel.
5. **The scenarios:** the S1e battle's veterans become level 3 and the battle is retuned; C-02, H-04 and G-06 measured;
   the docs (`docs/systems/fire-morale.md`, the unit model's § Morale), the goldens once, `/code-review high`, the PR.
