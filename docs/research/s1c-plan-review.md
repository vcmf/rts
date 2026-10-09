---
status: research
last_reviewed: 2026-10-09
---

# Adversarial review of the S1c plan (fire, cohesion, morale)

Review of `docs/plans/active/s1c-fire-morale.md` against `docs/proposals/sim-design.md` §8, §10, §12,
§13, §16, §19, the sim as built (`src/sim/formation.ts`, `rng.ts`, `tick.ts`,
`src/rulesets/napoleonic.ts`) and `docs/research/rts-engine-subsystems.md` §3.

## Verdict

The calibration targets can be reached, but only if morale is a loss-driven threshold model. They cannot
be reached if morale integrates a constant "under fire" pressure, and the plan does not say which model
it is. Three mechanisms in the plan, as written, will fail their own acceptance tests or have no effect:
- the mirrored-outcome test, with one sequential RNG and slot-order tie-breaks;
- the lean-flip fallback of the re-packing gate, for a line;
- the casualty term of cohesion, against the existing recovery rate.

The wavering Retire as specified also feeds a rear-fire spiral. Fix these in the plan before coding, and
take the re-packing gate out into its own PR.

## Arithmetic used below

- **Rounds.** A company of 25 men fills 9 files as 9/9/7 (`occupied`). In line (`closeAcross`), a half of
  50 men fills 17 files as 17/17/16. The front two ranks hold about 68–72 men. At 0.85 after misfire and
  2.4 volleys a minute (25 s reload), a full battalion fires about **140 rounds a minute**.
- **p at 100 m.** For a break after L losses at time T, p(100) ≈ L / (140 · T); the falling strength
  adds a few per cent. At T = 8 min:
  - L = 15: p ≈ 1.3% (1 in 75);
  - L = 25: p ≈ 2.2% (1 in 45).

  That is about 3× the Waterloo average of 1 in 162, which is plausible for 100 m and consistent with
  §8.
- **Per volley.** One company volley is about 15 rounds, so λ ≈ 0.2–0.35 at 100 m and still below 1 at
  50 m. `sampleCount` therefore takes its Bernoulli branch almost always: at most one casualty per company
  volley. Losses arrive as a Poisson-like stream of single men. Over 8 minutes that is about 77 company
  volleys, with a CV of losses of about 20–25%.
- **The curve the three ranges imply** (loss-driven morale):
  - 50 m under 5 min against a 6–10 min median at 100 m: p(50)/p(100) ≥ 1.6 for the median, and about
    2.0–2.5 if "under 5 minutes" means in most seeds;
  - 200 m with no break in 20 min in all 20 seeds: expected losses there are L · (20/8) · r, with
    r = p(200)/p(100). Keeping the worst of 40 battalion-runs below L needs r ≲ 0.25 (L = 20).

  So the curve is roughly 2.2 : 1 : ≤0.25 at 50 : 100 : 200 m. That is steep, but the same shape as the
  Prussian 1810 test (60/40/5% at 70/140/210 m). **The three targets are mutually consistent under
  loss-driven morale.**
- **Stronger breaks first in at most 3 of 20.** Time to reach L losses has a CV of about 1/√L. With
  L_weak = 15 and L_strong = 1.4 · L_weak = 21, the difference of log-times has an sd of about 0.34
  against a mean gap of ln 1.4 = 0.34. That gives z ≈ 1 and about 16% reversals, about 3.2 in 20: right
  on the limit. The quality gap must make the stronger line stand about **1.6× the weaker's losses**
  (z ≈ 1.4, about 8%) to pass with margin. This number belongs in the plan, because the scenario's
  "lower quality" is otherwise undefined.

## Severe

### S1. The morale model's form is unspecified, and one reading contradicts the acceptance criteria

**Problem.** "Pressure: … under fire; low cohesion …" reads as per-tick rates subtracted from morale, and
"recovery: when not under fire" means recovery stops in a firefight. With any constant under-fire rate,
morale only falls during a firefight, so every battalion under fire eventually breaks whatever its losses.
That contradicts two criteria:
- **at 200 m no break in 20 minutes:** both lines are under fire the whole time;
- **the negative run "p(range) at zero gives no break":** at p = 0 volleys still arrive, so the unit is
  still under fire.

The plan also does not give:
- **the maximum range.** If the ruleset range is 150 m, the 200 m criterion passes vacuously because
  nobody fires;
- **a target for losses at break.** The tool prints it but nothing bounds it, so 6–10 minutes can be met
  with breaks at 5% losses (a timer) or 40% (attrition).

**Why it matters.** The tuning would end up as an arbitrary balance between a clock term and a loss term.
It would pass at 100 m and behave differently at every other range and in the S1e messy fights. This is
what the plan's own "morale with many weights" risk warns of.

**Change.** Write the model as relaxation toward a target. The target is
`m* = quality − f_loss(total share) − f_coh(1 − cohesion) − f_flank − c_fire · [under fire]`, each term
bounded, with `dm/dt = k · (m* − m)` plus shocks.
- Under fire then lowers the ceiling by a bounded amount instead of draining morale forever.
- Recovery is the same relaxation once m* rises.
- Hysteresis acts on m, which then has an equilibrium.

Add to the calibration:
- the losses at break at 100 m: **12–25% for the weaker, at least 1.5× that share for the stronger**;
- the maximum range in data (for example 250 m), so 200 m is a real test with p(200) > 0;
- that `c_fire` alone may take a battalion to shaken but never to wavering. This makes the p = 0
  negative run meaningful.

### S2. The mirrored test cannot pass with one sequential RNG and slot-order tie-breaks

**Problem.** The plan says volleys use post-movement positions and casualties are collected and applied
at step 11, "so no shooter's result depends on another's slot". The values do not, but the **RNG draws
do**. `w.rng` is one xoshiro stream advanced in slot order. Every reload jitter, Bernoulli casualty and
per-man allocation draw happens in slot order, so swapping the two battalions' slots gives each a
different draw sequence and a different battle.

Two other rules break mirror symmetry on purpose:
- targets are "re-chosen every 0.5 s (staggered by slot)";
- ties are "broken by slot index".

A geometric mirror (x → −x, heading → π − h) is not bit-exact either. The ulp differences in distances
and arc tests flip Bernoulli outcomes and then diverge. As written, the test either fails or has to be
weakened until it tests nothing. The paired negative run ("removing the start-of-step snapshot makes the
mirrored test fail") targets the wrong thing. Fire has no snapshot hazard once casualties are deferred,
and a 1v1 mirror never exercises contagion, which is where the snapshot matters.

**Why it matters.** This is the determinism-contract test of the PR. As specified it will either be
flaky in design or quietly dropped.

**Change.**
- **Use a keyed (counter-based) draw for fire and morale.** Draw `u = hash32(seed, tick, slot, gen,
  company, purpose, k)`, for example splitmix32 over the mixed key. It is still deterministic and needs no
  extra saved state. It makes results independent of slot order, removes the "does a gate retry consume
  draws" question (S4), and makes order-independence testable.
- Keep `w.rng` for `debug-kill` and spawns.
- Define the order test as **"the same scenario spawned in reversed slot order gives the same per-handle
  outcome, bit for bit"**, not as a geometric mirror.
- Break ties by a key that does not depend on slot, such as handle generation and then side, or by
  squared distance with a stable secondary key.
- Stagger by `(handle hash + tick) mod 10`, not by slot.
- Move the snapshot negative run to a contagion case: three adjacent friendly battalions, one broken by
  scripted losses, spawned in both slot orders. Without the snapshot, the second order cascades in a
  different tick.

### S3. The wavering Retire feeds a rear-fire spiral and confounds the calibration

**Problem.** Retire is "face, march, dress, face" (`formations.md`). A wavering battalion therefore Faces
about under fire, and the enemy's fire now arrives in its **rear arc**. The plan lists "enemy fire from
the flank or rear arc" as pressure, so the Retire meant to save the unit pushes it to routing.

While retiring it also cannot fire (it is moving), so it takes fire without replying. The Retire also
changes the range mid-calibration. A 100 m run includes a phase at 100 + retire distance, so "time to
break at 100 m" measures an unknown mix. Neither the retire distance nor the timing of "once per
wavering" is given.

**Why it matters.**
- Game feel: every wavering will look like a rout two seconds later.
- Calibration: the result depends on an untuned Retire distance.

**Change.**
- Judge the flank and rear arcs against the battalion's **front of record** (its heading before any Face
  about issued by standing behaviour, or the shape's front), not its current heading.
- Give the Retire distance in data (for example 30 m), so the run moves from 100 m to 130 m, still in
  range.
- Report break times both with and without the fall-back in the sweep.
- Make the fall-back conditional on morale falling for a few seconds (dm/dt < 0), not on any
  wavering. Otherwise a unit that becomes wavering on a single shock and recovers at once still runs.

### S4. The re-packing gate's fallback does nothing for the case it exists for, and should be its own PR

**Problem.** The known issue is a **line** at a bank. The line shape is `closeAcross`, and `occupied`
ignores `lean` for `closeAcross` shapes (formation.ts, lines 40–46). So "failing that, the lean flips"
is a no-op for the line.

For other shapes, a lean flip outside Face about breaks an invariant the renderer relies on. The S1b page
relabels men from the lean bit and the `faces` counter (`sim-page.md`). A lean flip without a `faces`
increment makes partial files jump across the company on screen.

"Goes to another company in arc" changes the casualty distribution after the draw. With the plan's
allocation ("man by man", presumably drawn), a retry either re-draws, which changes the RNG count, or
moves the man deterministically; the plan does not say which.

"The known issue is closed only if that test passes; if not, the residual stays recorded" is not an
acceptance criterion: it pre-approves failure.

**Why it matters.** It adds a third interacting mechanism (fill, lean, renderer relabel) to an already
large PR. The one fallback named will not fix the reported case.

**Change.**
- Split the gate into its own PR, before or after S1c. It needs only `debug-kill` to test.
- In it, the fallback order for a line is: move the loss to the other half (the line's fill unit is the
  half, not the company), then to another company, then let it stand.
- No lean flips outside Face about.
- Reassignment is deterministic, with no draws: the nearest company in arc by index distance from the
  original.
- Acceptance is binary: the bank test passes and the known issue is struck through.
- If S1c keeps it, at least state that `pressed against impassable ground` is a flag, not a `STATUS`
  value. `STATUS` is a single field, and the flag would overwrite `halted`.

## Moderate

### M1. The casualty share of cohesion has no effect under the current recovery rate

`updateDisorder` recovers at `kRec · 3 = 0.03` per second when halted and dressed: **1.8 cohesion a
minute**. At about 2.5 losses a minute at 100 m, a casualty share below about 0.7 cohesion per man is
erased within the same minute. Cohesion then stays near 1 through the whole firefight, and both "low
cohesion" pressure and the cohesion fire modifier have no effect. A share large enough to matter (0.1
per man, with recovery off) collapses cohesion after 10 men.

**Change.** Either suspend disorder recovery while under fire, or keep casualty disorder as a separate
column with its own slow recovery (for example 0.002 per second, rising only when out of fire). Then set
the per-man share so that the losses at break take cohesion to about 0.6–0.7. State these numbers in the
plan.

### M2. Twenty fixed seeds make the statistical criteria a tuning target, and the Vitest check is undefined

At z ≈ 1 (see the arithmetic), whether 3 or 4 of 20 seeds reverse is luck of the seed set. With fixed
seeds, the tuner can stop at a parameter set that happens to pass. "Vitest runs a smaller sweep (5 seeds)
as the regression check" names no threshold. A median of 5 seeds against 6–10 min, or "at most 0 of 5
reversed", are very different tests.

**Change.**
- The tool runs 100 seeds; a 1v1 run is cheap, about 0.05 ms a tick, so 100 seeds × 3 ranges × up to
  24,000 ticks is under a minute. It reports the median, the 10th and 90th percentiles and the reversal
  rate with a confidence interval.
- Acceptance: the reversal rate is ≤ 15% with its upper bound below 25%.
- The Vitest check becomes a **golden of the 5-seed table**, exact break ticks per seed. It is a
  regression check against change, not a statistical test, and is updated deliberately when tuning moves.

### M3. Line-of-fire geometry contradicts itself and will flicker

- **Positions.** Friend blocking uses "each battalion's start-of-step rectangle", while volleys use
  "positions after movement (steps 5–6)". Positions do not change during step 8, so use post-movement
  positions for everything.
- **Shapes.** "Anchor, heading, half-width, depth" is not the footprint of a march column (a trail),
  of a battalion mid-change (companies wheeling), or of a pinwheel square. Use one box per company
  from `companyPlace`; that is 4 boxes, and the code exists.
- **Partial cover.** §8 says partial frontage overlap scales the rounds. The plan blocks a whole company
  on one centre-to-centre ray, so a friend's corner switches a whole company on and off as lines shift.
  Cast three rays per company (both flank files and the centre) and scale rounds by the share that is
  clear.
- **Woods sampling.** Woods measured at 7 m samples quantises the woods length to 0 / 7 / 14 m depending
  on alignment. A 10 m thicket then blocks or not as units move a metre. Walk the 1 m class grid along
  the ray (DDA). A 150 m ray is about 150 cells, still cheap. Sample the heightfield at 1.79 m.

### M4. The rout as written looks wrong and deviates from the design

§10 says routers run "to their side's rear". The plan says "straight away from the nearest enemy",
which causes three problems:
- with two enemies at similar distances, the direction flips as the nearest changes;
- on a flank, a router runs along the friendly line;
- with the enemy behind (a flank attack), it runs toward its own enemy's rear.

A router is still a formed line moving under the lag model at rout pace, so the sim moves a dressed line
backward at speed. Only the page loosens the men. Nothing says what happens at the map edge.
"Stops at impassable ground" plus "under fire" plus "routing too long" means a unit pinned at a river
always shatters by the timer. That is defensible, but should be intended and stated.

**Change.**
- Set the rout direction when the rout begins: the side's rear vector (scenario data) blended with the
  direction away from the weighted sources of fire that tick. Re-aim only every few seconds and only by
  a bounded angle.
- Clamp at the map edge. A router that reaches it is removed as shattered (state it, even if S1e
  revisits it).
- Routers use a `push` order preset, so the lag tolerances open up and the sim footprint loosens too,
  not only the drawn men.
- Specify squares: they do not Face about; they run in their current shape at reduced pace.

### M5. Definitions and state the plan needs but does not name

- **Under fire:** for example, "a volley targeted any company of this battalion within the last N s", set
  whether or not it hit. Put N in data.
- **Quality:** a stored column, the recovery ceiling, distinct from current morale. "Rallies, and then
  becomes steady again" needs it. Name the scenario's quality gap; see the arithmetic for what it must
  achieve.
- **Commands by state:**
  - routing: every order dropped with a reason;
  - wavering: orders accepted?
  - rallying: fires? takes orders?
  - shattered in S1c: does it keep running, stand, or get removed?

  Each needs a `Dropped` reason and a test.
- **Fire defaults:** the default mode at spawn (at will?) and the initial reload state. If every
  company starts loaded, the first tick is a full synchronised volley. At 50 m that may trip the
  "losses inside 10 s" shock at t = 0 on both sides. Draw initial reload progress, and set the shock
  threshold above the opening volley's expected losses at 50 m.
- **Target state as a handle, not a slot:** the volley target is hashed and drawn. If the target is
  reaped and its slot reused, a slot index points at a new unit.
- **Target stickiness:** "Kept while valid, re-chosen every 0.5 s" contradicts itself. Say: switch only
  when invalid, or when a new candidate is nearer by more than 20%. This prevents a company flicking
  between two equidistant targets.
- **Casualty allocation:** "weighted by their men", in integers. Use largest remainder with a
  slot-independent tie-break, or keyed draws per man. Say which, and that it never takes more men than a
  company has.
- **Recent losses "about 10 s":** exponential decay needs `exp`, which the lint bans. Use a ring of ten
  1 s bins per battalion (integers, exact, hashed), or a per-tick factor given as data, not computed.
- **Shooter-side morale modifier:** shaken and wavering fire worse, so whoever is shaken first by
  early Bernoulli luck loses more fire and falls further. Bound the penalty (for example 0.85 / 0.65) and
  report how often the first battalion to be shaken loses. If that is above about 85%, the fight is
  decided by the first minute.
- **New hashed columns:** list them in the plan; the save round-trip test only catches a missing one if
  it saves mid-fight. They are:
  - reload timers per company;
  - target and last-volley tick per company;
  - fire mode and preferred target;
  - morale, state, quality;
  - the recent-loss bins;
  - the under-fire and rout timers;
  - the wavering-retired flag;
  - the rout heading.

  Make the save test save during a ripple, with companies part-reloaded and one battalion routing.

### M6. Scope: about three PRs in one

The plan bundles:
- a new command;
- targeting with line of fire;
- musketry;
- deferred casualties;
- the footprint gate on re-packing;
- cohesion;
- a six-state morale machine with shocks, contagion, support and hysteresis;
- two standing behaviours (fall-back and rout movement);
- the page (flashes, bars, loosening, buttons, readout, a new scenario);
- a calibration tool;
- the version bumps.

Each of fire, morale and the gate has its own determinism hazards. A reviewer cannot hold all of them in
one diff, and a calibration failure late in the PR blocks everything.

**Change.**
- **S1c-1, fire:**
  - the command, targeting, line of fire, musketry and casualties;
  - minimal morale (steady → shaken → routing on a loss-based target, no rally);
  - the calibration tool and the 100/50/200 m criteria;
  - page flashes and the readout.
- **S1c-2, the full machine:**
  - wavering and fall-back, rallying, shattered;
  - contagion and support;
  - the remaining page work (morale bars, rout loosening).
- **The re-packing gate** (S4): separate, small, and can land first.

## Light

### L1. The cost criterion measures the wrong thing

"Sim plus soldier layer per frame at 1× within 4 ms" relaxes §16's target of ≤ 2 ms per tick of sim, so
that 8× fits. Keep both:
- sim ≤ 2 ms per tick for 40 battalions firing (the formation layer already takes about 1.2 ms);
- the page check at 4 ms per frame.

Line of fire is cheap. About 16 companies re-target each tick, each with roughly 10 candidates in range,
at about 80 samples per ray: some 13k samples, plus validity checks of 160 current targets per tick. The
real risk is checking validity every tick with three rays each (M3); re-check validity at 2 Hz as well.

### L2. Contagion travels one tick per link

With start-of-step state, a rout in tick t shocks a neighbour in t + 1, so a chain of 10 battalions can
cascade in half a second. That is order-independent, but bound it: a single contagion shock must be
smaller than the gap from steady to routing (for example ≤ 0.6 of it), so it takes a shaken unit to
break, not a steady one.

### L3. A discontinuity in `sampleCount` at λ = 1

The variance is λ(1 − λ), approaching 0, just below λ = 1, and jumps to λ just above. Clipping the normal
branch at 0 also biases the mean upward by about 0.04 at λ = 1. This does not matter at 100 m (λ ≈ 0.3).
Calibration at 50 m, or a 40-battalion massed volley, crosses it. Either note it, or sample λ < 4 as a
sum of Bernoulli trials over rounds in chunks.

### L4. Negative runs that would teach more

- p = 0 giving no break only proves the test is not vacuous.
- Add:
  - hysteresis off, so a scripted borderline case flips state more than N times and fails;
  - casualties applied immediately instead of at step 11, so the slot-order test fails;
  - contagion from current state, so the contagion order test fails (S2);
  - flank arc from the current heading, so the fall-back test routs (S3).

### L5. Feel of the static fight

"Only halted battalions fire" with automatic return fire makes the defender's advantage absolute while
an attacker closes. From 200 m to 100 m at 0.9 m/s is about 110 s, about 4–5 company volleys taken
without reply. That is historical and acceptable, but it makes the 1v1 the only fight S1c can tune. Add a
calibration row for "one battalion advances from 200 m to 100 m, halts and fires" and record the
attacker's handicap at the break, so S1e starts with a number.

### L6. "Every state transition happens in a scripted case" needs a lever

Scripting rally, shattered and contagion requires setting morale and losses at chosen ticks.
`debug-kill` exists. Add `debug-morale` (set morale and state), logged like any external command, so the
cases do not depend on tuned weights and survive retuning.
