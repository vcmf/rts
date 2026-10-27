---
status: accepted
date: 2026-10-26
---

# 0069 A melee holds until one side breaks; a router the enemy reaches is cut down, never surrenders

## Context

C1's claim grid keeps formations apart. Its step 4 had to say what happens where two meet in melee. Two designs gave
ground: a continuous give way (the companies in contact bent back, then the whole stepped back; five reviews failed
it) and rounds (every 3 s the loser stepped back 2 m as a whole and its foe followed; it worked on the bench,
docs/plans/active/c1-claims.md). Judging them, the owner chose a simpler model, as Total War has it. A surrender for a
trapped router was built and reviewed three times; it needed a record of who held the router, which broke replays,
and the owner dropped the concept (Total War has none; Ultimate General has).

## Decision

- **A battalion in melee cannot step back or retreat;** nobody gives ground. The melee ends when one side breaks, or
  as before when a charger turns away from a square or the two fall out of contact.
- **A broken battalion runs as a block**, faced about, in the direction fixed at its break (its side's rear, else away
  from the nearest enemy, else straight back), and tries a fan of other directions when held
  (docs/systems/fire-morale.md). Wavering and shattered battalions keep their block.
- **No surrender.** Every enemy in the fight that reaches a broken battalion cuts it down, as a pursuit rides a router
  down, and it does not fight back; one with no direction left is cut down where it stands. With the claim grid on, a
  router held by others goes on trying its directions and runs once one clears. (Built with the claim grid, C1.)
- Owner decisions for later work, recorded here: every type but artillery has a firearm and a melee mode, a player
  toggle (skirmishers firearm only, some militia melee only), and a battalion an enemy reaches in melee fights in
  melee as a whole; a retreat out of a firefight within enemy range turns its back (no fire, struck as from the rear)
  and costs a one-off morale hit; a charge into the flank or rear of a battalion already in melee gives a one-off
  morale shock. A battalion in melee may be fired on where no friend of the shooter stands across the line of fire:
  that is the code already.

## Consequences

Good: no geometry for giving ground, the hardest part of the collision work; a melee reads as two blocks locked until
one breaks; a trapped router does not stand forever. Bad: no pushing back, which history had; the later items above
are design, not code yet (the unit model, U1), but for the fire into a melee.

## Alternatives considered

- Giving ground continuously, or in rounds: built, reviewed, dropped as too complex for the model.
- Surrender of a trapped router: dropped by the owner.
- A trapped router left standing: it stood for good (the X-18 bug the owner saw), losing men to no one.
