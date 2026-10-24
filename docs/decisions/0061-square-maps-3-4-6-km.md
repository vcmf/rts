---
status: accepted
date: 2026-10-24
---

# 0061 Square maps of 3, 4 or 6 km a side, at true scale, sized to the armies

## Context

Decision 0011 targets a play area of 1–1.5 km. The owner wants more than the battle itself: room to approach, to
manoeuvre and to guess where the enemy is (fog of war on units, the terrain known), on square maps like a normal RTS.
Every soldier is a figure. The typical match is 4,000–5,000 soldiers in all, and the extreme is 32,000 (decision 0050's
target).

Two research notes size the maps.

**History** (`docs/research/map-size-battle-density.md`):
- a 600-man battalion in line is about 120 m wide (sourced);
- small battles of 10–35,000 men held about 3 km of front, inside 6–10 km of manoeuvre ground;
- armies stood 2–8 km apart on the morning of battle;
- formations show at 1.2–1.5 km.

**Games** (`docs/research/map-size-rts-map-sizes.md`):
- Total War puts 5–10,000 men on 1–2 km with no room to approach, and its players ask for more;
- Scourge of War's real-scale maps are about 8 km;
- maps of 40–80 km are avoided, for lag and long marches;
- about 250–500 soldiers per km² gives room to manoeuvre without losing the armies.

Their recommendations:
- 4–5k soldiers: 4–6 km (history) and 4 km (games);
- 32k soldiers: 10–12 km (history), 8–10 km (games), with 6–10 km the manoeuvre ground of the small battles above.

Most whole-battle fronts and all densities are the researchers' estimates. The formation widths are sourced. Neither
note's sources were re-checked one by one.

## Decision

- **Maps are square:** 3, 4 or 6 km a side (9, 16 or 36 km²), chosen per scenario.
  - **4 km** is the default, for the typical match of 4–5,000 soldiers: about 250–300 per km², with 1.5–3 km to
    approach and room to flank and to hide.
  - **3 km** is for small actions.
  - **6 km** is for the extreme of 32,000, at about 890 per km². It sits at the low end of the small battles'
    manoeuvre ground and below both notes' recommendations (8–12 km). Its front of about 3 km leaves about 1.5 km of
    flank a side, so there is less room for wide manoeuvre (the owner's choice).
- **True scale:** distances, slopes, ranges and sight are real; nothing is squeezed. Compressing distance would steepen
  slopes and crowd real-size soldiers, ranges and sight onto less ground.
- **Match length stays decision 0009's** 30–45 minutes for a whole battle, with its speed controls. On a 4 km map the
  approach alone is about 25–60 minutes at a real marching pace (0.85–0.95 m/s over 1.5–3 km), so 0009's tuning must
  absorb it. How is open: a faster clock while no unit is in contact, or march speeds tuned as 0009 allows. It is
  decided with the sim's calibration.
- **A historical battle** is a real-scale crop of its field at one of these sizes, fought by a representative army.
  Austerlitz: a 6 km crop around the Pratzen and the Goldbach, with 32,000 soldiers.
- **Budgets:**
  - **Hardware:** the minimum target is unchanged from decision 0011: a gaming laptop with an RTX 3060 (6 GB of video
    memory) at 1080p and 60 fps.
  - **The 3D world streams in tiles around the camera.** 0011's bake budget (at most 600 MB resident) applies to the
    tiles resident at once, not to the map. Static light is still baked once per map (the invariant), tile by tile, at
    build time, and loaded as the camera approaches.
  - **The sim's data must use a compact format.** In today's format (a float64 heightfield, 1 m class grids) a
    2 × 2 km map is about 22 MB (`docs/proposals/map-format.md`), so a 6 km map would be about 200 MB: too large to
    hold, and over GitHub's 100 MB file limit. The map engine's compact 2 m grids (u16 heights, u16 attribute indexes;
    the map engine proposal §5) total about 5–6 MB per 1.5 km square, about 90 MB at 6 km (an estimate). So the 2 m
    grids are tiled or compressed, and the built sim data for the large maps is not committed raw.
  - **The map view covers the whole map.**
- **Vision is a core rule:** units are hidden outside sight; a faded "last seen" marker stays and ages; sight is
  blocked by relief, woods and villages. This moves vision ahead of the sim's S2 hardening.

This supersedes decision 0011, whose minimum hardware target is restated above. Proposals that state 1–1.5 km keep it
as their history; `docs/vision.md` is updated.

## Consequences

Good:
- room to approach and to guess, at the density the history and the games point to;
- one rule for every map.

Bad:
- the 3D world must stream in tiles, with bakes per tile: a new piece of work for Track E, before the look compiler
  (Track M's M4) can serve a whole map;
- the sim's data needs its compact, tiled or compressed format before a large map ships;
- vision moves earlier in the sim track;
- the 6 km extreme is tighter than the research suggests;
- match length on the larger maps now depends on the calibration of the clock or the march speeds.

## Alternatives considered

- **1–1.5 km (decision 0011):** the battle only, with no approach or fog of war.
- **2 km:** the armies start within sight and cannon range.
- **8–12 km for the extreme:** both research notes' choice, set aside for 6 km. It stays open for march-heavy scenarios
  with reinforcements from the edges.
- **4–16 km at true scale for whole historical fields:** sized to 100,000-man armies; 4–5k soldiers would be lost on it.
- **The whole field squeezed 2.5× to fit:** untrue slopes and march times. That was the prototype's shortcut.
