---
status: accepted
last_reviewed: 2026-10-17
---

# Figure animation: assets, registry, and the timing contract with the simulation

Status: **accepted** by the owner on 2026-10-17 (asked the same day); the timing contract is decision 0037. How animated figures (soldiers, gun crews, riders)
are stored, registered and played so that what the player sees always matches what the simulation
decided: a man is seen to fire when, and only when, his company's volley happens. Builds on decision
0005 (the simulation never imports the renderer), decisions 0006 and 0013 (deterministic lockstep),
decision 0015 (era-generic engine), decision 0018 (battalions of 400) and `docs/proposals/engine-design.md` §7
(instanced figures with baked vertex animation).

## Summary: the recommendation

1. **The simulation owns every duration.** Reload, present, recoil, speeds come from the ruleset; no
   animation length ever decides when something happens in the game.
2. **The simulation announces phases ahead of time.** A unit commits to an action and the state says
   which phase it is in, when it started and when it ends (a volley is scheduled, not instant), so the
   renderer can start the wind-up before the shot.
3. **The renderer is a pure function of that state.** Which clip, and where in it, is computed from the
   phase, the time since it began and a **binding**: anchor a clip's event frame on the simulation's
   event, stretch within limits, fill with a hold loop.
4. **Bindings are checked at build time against the ruleset's ranges**, so a balance change that the
   animation cannot show fails a test instead of shipping a man who fires without firing.
5. **One home per fact:** timings in the ruleset, clip facts in a generated registry, the link in
   bindings; the pipeline is versioned code, heavy sources stay out of git, game data is generated.

This is the model of Warcraft III, StarCraft II, Dota 2 and 0 A.D. (below), adapted to a lockstep game
with 16,000 instanced figures.

## Context and goals / non-goals

The first figures exist outside the repository (output/soldier-animation/, not tracked): a French line
infantryman (51 clips), a light gun and a crew of four (Idle, Load, Ready, Fire), a heavy cavalryman
and his horse (gaits and fourteen sabre clips). Their clips have their own lengths (the musket's Reload 11.3 s, the gun's Load 10 s, its Fire 6.9 s), while
the ruleset's reloads (`src/rulesets/napoleonic.ts`) are more than twice as long. And the simulation fires a loaded company on the tick its
reload runs out (`src/sim/fire.ts`, which records `volleyTick`), so the renderer learns of a volley only
after it happened and cannot play "present arms" before it.

Goals:
- what is seen matches the simulation's events: the flash on the volley's tick, a man falls only when
  the simulation removed him, a gun recoils when it fired;
- balance stays pure numbers in the ruleset, tunable without touching animation files, and any value
  the animation cannot express is caught by a test;
- replays, saves, culled and far figures stay consistent: a figure's clip and time can be computed from
  the state at any moment, without having watched the battle;
- one place to find every figure, clip and event, generated so it never drifts;
- era-generic: the engine knows phases and bindings, not muskets (decision 0015).

Non-goals: per-figure simulation (the simulation keeps men per company, decision 0018); animation that
changes the outcome; blending between clips on the GPU (a later question, see Open questions).

## What shipped games do

- **Warcraft III and StarCraft II:** an attack is a **damage point** (wind-up until the hit or the
  projectile), a **backswing** (recovery) and a **cooldown**. A footman: 0.50 s damage point, 0.50 s
  backswing. Damage points were chosen to match the attack animations, and attack speed scales the
  cooldown and both animation values together, playing the animation faster. StarCraft II separates the
  catalogs that say *what happens* (units, weapons, effects) from **actors** that say *what it looks and
  sounds like*, driven by events (`AnimPlay Attack`).
- **Dota 2:** attack point (wind-up) and backswing, both scaled by attack speed; cancelling the wind-up
  cancels the attack, the backswing is cosmetic.
- **0 A.D.** (open source, deterministic lockstep, the closest to us): `PrepareTime` "should closely
  match the 'event' point in the actor's attack animation"; with `RepeatTime` "the attack animation will
  be stretched to match this time". Simulation numbers lead, the clip is stretched, its event lined up.
- **Age of Empires II**, the counter-example: the projectile leaves a **frame delay** of animation frames
  into the attack, so the animation is a hidden balance stat, and data mistakes become balance bugs (an
  Elite Janissary with frame delay 0 against 12 for the regular one).
- **Total War:** animation tables, fragments (slot → animation) and meta files carrying hit positions
  and effects; modders report weapon damage is applied when the attack animation finishes. Animation
  in the loop of combat, at the price of timing set by assets.

Lockstep settles our choice: figures that are culled, at a low LOD or on a slower machine must not
change the battle, so animation can never gate the simulation.

## Design

### 1. Phases in the simulation

Every timed action of a company, battery or squadron is a small state machine whose state the renderer
can read (hashed like the rest): `phase`, `phaseStart` (tick) and `phaseEnd` (tick, or open).

| Action | Phases (durations from the ruleset) | Event |
|---|---|---|
| Musketry | loaded → **presenting** (`present`) → volley at `phaseEnd` → reloading (the ruleset's reload ± jitter) → loaded | `volley` at the end of presenting |
| Artillery | loading (the ruleset's reload ± jitter, × crew) → **laid** (open: waits for a target) → **firing** (`fireLead`: the linstock to the vent) → shot at `phaseEnd` → running up → loading | `shot` at the end of firing |
| Charge and melee | approach (walk, trot, gallop at the ruleset's paces) → contact → melee (open) | losses on ticks |
| Movement | the battalion's speed and heading each tick | — |
| Loss | a man removed on a tick | `fell` |

The change to today's simulation: **every visible event is scheduled.** When a company is loaded and has
a target it commits; the volley resolves `present` seconds later. A laid gun with a target commits and
fires `fireLead` later. **The lead rule:** every event the renderer anchors is announced at least the
clip's anchor lead ahead (the frames before the clip's event), so a phase with an open end (laid, holding
fire) always ends through a fixed final phase of at least that length. The present time is new ruleset
data by the battalion's drill quality: today the ruleset has only a drill-time factor, which every
battalion starts at 1 (`src/sim/commands.ts`), so the quality behind it is to be added. While presenting,
the target is held; a volley is called off when the target is out of reach or the company is ordered to
move or charge, keeps its load, and **cannot be called off in its last anchor lead** (the men are already
firing). The phase is a field of its own, not read from the reload countdown, which today doubles as a
0.5 s retry timer (the known ask in `docs/plans/active/track-e-look.md`, which this contract answers). This
belongs to the logic track (`docs/proposals/sim-design.md`, `docs/systems/fire-morale.md`).

### 2. Bindings: from a phase to clips

A binding maps one phase of one figure kind to clips with a fitting rule. Bindings are presentation
data, next to the ruleset but never read by the simulation (decision 0005).

| Rule | Meaning | Example |
|---|---|---|
| `anchor` | a clip's event frame lands on the simulation's event tick; the clip starts that many frames early | the musket's Fire event `fire` (frame 3) on the volley tick |
| `stretch` | the clip is played at a rate within limits (say 0.8–1.25×) to fill the phase | Present over `present`; Reload over `reload` |
| `fill` | a looping clip holds whatever the stretch cannot cover | Aim after Present; Ready after Load; OrderArms after Reload |
| `rate` | playback rate = speed ÷ the clip's root speed, within limits; outside them the next gait | the cavalry's walk, trot and gallop at the ruleset's paces |
| `cosmetic` | free timing; the simulation does not count it | individual men up to 0.3 s **after** a company volley's tick, never before (the ripple); idle variation |

For the musket: presenting → Present (stretch) + Aim (fill); the volley → Fire (anchor); reloading →
Reload (stretch) + OrderArms (fill). For the gun: loading → Load (stretch) + Ready (fill); laid → Ready;
firing → Fire (anchored on its `shot`, the recoil and run-up inside it). With the fill capped at half a
phase, the clips as built would not pass the check: the musket's Reload and the gun's Load are too short
for the ruleset's reloads, and need slower variants (more of the drill, not more standing) before the
bindings land. The clips built so far were made in this shape (Present,
Aim, Fire for the musket; Load, Ready, Fire for the gun), as the owner asked when the firing was split.

Rules for losses and melee: a man the simulation removed falls on that tick (a fall clip, then the
corpse); in a melee the blows are cosmetic but a man falls only after a visible `hit` near him, so the
renderer may delay a fall by up to a blow's length. The flash, the smoke and the sound follow the
anchored event, not the simulation tick directly, so they always coincide with the clip.

### 3. The renderer is a function of the state

For each figure: `(clip, clip time) = f(phase, now − phaseStart, binding, figure seed)`. No animation
state is carried from frame to frame, so a replay jump, a save, a figure entering the view or changing
LOD shows the right pose at once. This is what the instanced figures already take: a clip range and a
start time per instance, the clock in a uniform (built for the crowd benchmark of
`docs/plans/active/track-e-look.md` L1, on a branch not merged at the time of writing). Stepping at 12 fps (`docs/art-bible.md`) quantises an anchor to
1/12 s, under the 0.25 s that is still read as "on the shot".

### 4. The build-time contract

A test reads the ruleset, the bindings and the clip registry and checks, for every binding:
- the clips exist and their events exist (`fire`, `shot`, `hit`, `cartridge_in`…; one name per kind of
  event once the figures are in the registry: today the musket says `fire` and the gun `shot`);
- the phase's whole range can be shown: for Reload, the ruleset's `reload × (1 ± jitter)` is at least the
  clip's length × the lowest rate, and at most its length × the highest rate plus a **capped fill** (a hold
  loop may fill at most a set share of the phase, half to start with: beyond it a man would idle while the
  simulation says he is busy, and a new or slower clip is needed);
- every anchored event's lead is no longer than the phase that announces it (the lead rule above);
- clips that a binding chains join exactly (the pipeline already checks joins frame by frame);
- root speeds and gait thresholds cover the ruleset's paces.

A balance change the animation cannot express fails here, and the fix is chosen deliberately: widen a
limit, add a fill loop or make a new clip. The simulation never reads clip lengths at runtime.

### 5. Files

```
assets/                git-ignored (as today): the Tripo sources by figure, with sources.json (hashes)
tools/
  unitpipe/            the pipeline, versioned and reviewed: prep, combine, pose and timeline toolkits,
                       the horse, validate, publish; one module per figure's clips
data/
  figures/
    <figure>.unitdata  game-ready, generated: meshes per LOD and baked animation
    index.json         the registry, generated: figures, LODs, bones, clips (frames, fps, loop, events,
                       root speed, joins), each source's hash and the pipeline version
src/rulesets/
  <era>.ts             simulation numbers only (durations, paces), as today
  <era>.figures.ts     presentation: unit type -> figure, phase -> binding (never imported by the sim)
docs/systems/
  figures              the system doc once built, with a catalogue generated from the registry
output/                git-ignored: previews, videos, reports
```

- **One owner per fact:** a duration lives in the ruleset, a clip's facts in the registry, their link
  in the bindings. Nothing is copied by hand; the catalogue page and the registry are generated.
- **Heavy binaries stay out of git** (Tripo FBX, textures, renders) and are named by hash; the small
  generated game data is committed, as `data/*.simdata` and `data/*.lookdata` are, and checked by a
  `--check` rebuild in CI.
- **Names:** figures by army and kind (`fr-line-infantry`, `fr-foot-artillery`, `fr-cuirassier`); clips
  as verbs in PascalCase (`Present`, `SabreCutRight`); events in lower case (`shot`, `hit`, `parry`).
- The **ruleset names a figure, not a mesh** (era-generic: the engine knows figure kinds `foot`,
  `mounted`, `crewed`, as the ruleset already says in `figure`).

## Alternatives considered

- **Animation-driven timing** (the simulation waits for the hit frame, as Age of Empires II's frame
  delay and Total War's weapon tables do). Rejected: not deterministic across LOD, culling and frame
  rate, makes art changes balance changes, and hides balance in assets.
- **Clip lengths copied into the ruleset by hand.** Rejected: two homes for one fact; the test in §4
  gives the same safety without coupling.
- **Stretching every clip to fit any duration.** Rejected alone: beyond about ±25% a drill looks wrong;
  hold loops absorb the rest.
- **One registry file written by hand.** Rejected: it drifts; the pipeline writes it.

## Drawbacks

- A change to the simulation (a scheduled volley with a present phase) and to its state, and the logic
  track's time.
- More data to keep: bindings per figure kind. The build-time test makes it fail loudly, not silently.
- Anchoring starts a clip a few frames before its event, so a decision must be visible those frames
  early: the scheduled phases provide that, an instant event would not.

## Open questions (resolved with the owner, 2026-10-17)

1. **The present time and calling a volley off** (logic track): `present` comes from drill quality, roughly
   2 s for elite troops, 3 s for the line, 4–5 s for raw troops, with a little keyed jitter so a battalion's
   companies do not fire together (values to tune, in the ruleset). The target is held while presenting; a
   volley is called off when the target is out of reach or the company is ordered to move or charge, and it
   keeps its load (no reload penalty). Holding fire ("fire at 100 m") is presenting with an open end. Decision
   0037.
2. **Blending between clips on the GPU:** not now. Authored joins (checked frame by frame), gait changes at
   a cycle boundary, short transition clips and the 12 fps stepping carry the switches. A blend is measured as
   an arm of the crowd bench when the bindings are built, and adopted only if pops show in review.
3. **Moving the pipeline:** one PR that moves it as it is: the scripts to `tools/`, the Tripo sources kept out
   of git and listed by hash, the registry generated and committed, renders and work files in a git-ignored
   folder. The generalised bake (gun crews, horses) and the infantryman on the new toolkit follow, each in
   its own PR.
4. **Decision records:** decision 0037 (the timing contract) now; the file layout's record with the PR that
   builds it, as layouts move during implementation.

## Review

One round (`/code-review high`, decision 0025), on the PR. Changed: artillery gets a scheduled firing
phase and every open-ended phase ends through a fixed lead (an anchored clip needs its event announced);
the ripple is late-only and a volley cannot be called off in its last lead (no flash on a volley that
never happens); the build-time check caps the hold loop; the phase is its own field, not the reload
countdown; ruleset values linked, not copied; drill quality named as new data.

## Sources

- Warcraft III attack timings: [Hive Workshop, damage point](https://www.hiveworkshop.com/threads/dps-and-attack-animation-damage-point.247190),
  [Hive Workshop, attack speed](https://www.hiveworkshop.com/threads/increase-attack-speed.246885).
- StarCraft II: [TL.net, damage point](https://tl.net/forum/starcraft-2/481523-the-effects-of-damage-point-on-unit-interaction),
  [editor guide, actors](https://s2editor-guides.readthedocs.io/Classic_Tutorials/03_Data_module/4/).
- Dota 2: [Liquipedia, attack animation](https://liquipedia.net/dota2/Attack_backswing).
- 0 A.D.: [entity documentation, Attack](https://docs.wildfiregames.com/entity-docs/a26.html).
- Age of Empires II: [aoezone, frame delay](https://aoezone.net/goto/post?id=642555),
  [the Janissary report](https://forums.ageofempires.com/t/major-bug-balancing-elite-janissary-frame-delay-not-matching-non-elites-janissary/286823).
- Total War: [modding wiki, animation](https://tw-modding.com/wiki/Tutorial:Animation_and_You),
  [weapon tables (modder comment)](https://steamcommunity.com/sharedfiles/filedetails/comments/1165183189).
- Most game details come from modding wikis and forums, not official documentation; the 0 A.D. quotes
  are from its official entity documentation.
