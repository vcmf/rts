---
status: current
last_reviewed: 2026-10-08
---

# Glossary

## Drill and battle

- **Battalion:** the unit the player commands; about 100 soldiers in the game (historically a
  battalion was 500–800 men; ours has a company's footprint).
- **Company:** a sub-unit of a battalion. Whether game battalions have companies (for drill-like
  formation changes) is open (`docs/research/formation-movement-and-doc-systems.md` §4).
- **Brigade, division, corps, army:** the command levels above the battalion.
- **File:** a column of men one behind the other, front rank to rear rank. **Rank:** a row of men
  side by side. A 3-rank line of 100 men has about 33–34 files.
- **Frontage:** the width of a formation (about 0.56–0.7 m per file).
- **Line, column, square, skirmish (open order), march column:** the formations.
- **Wheel:** turning a line or company around a pivot flank. **Change front:** turning the facing in
  place. **Deploy / ploy:** column into line / line into column.
- **Guide:** the NCO who steers a company's direction and alignment. **File closers:** NCOs behind
  the rear rank who keep the files closed.
- **Dress the ranks:** re-align after a halt or an obstacle.
- **Cohesion:** order in the ranks (lost to terrain, interpenetration, melee). **Morale:** the will
  to stay. **Rout:** a formation running away. **Rally:** bringing it back. **Shattered:** can no
  longer rally.
- **Roundshot:** a solid cannonball that bounces (grazes) along the ground. **Canister:** a cone of
  small balls at short range. **Limber / unlimber:** hitching or unhitching a gun for movement.

## Engine

- **Tick:** one simulation step (50 ms of battle time). **Command:** the only input into the
  simulation. **Replay:** a command log played back to the same state hashes.
- **Restricted float64:** the simulation's number rules (decision 0006).
- **Heightfield:** the sampled ground height grid, the one authority for height.
- **Detail tile, far ring, apron:** the full-resolution terrain, the coarse backdrop beyond it, and
  the strip that stitches them.
- **Bake:** a world-space texture computed once per map (light map, shadow, AO, masks).
- **Anchor, slot:** a formation's virtual leader point, and a soldier's place relative to it.
- **`mapness`:** 0..1, how far the view has turned into the staff map.
- **Staff map:** the far-zoom drawn map (`docs/proposals/staff-map/design.md`).
