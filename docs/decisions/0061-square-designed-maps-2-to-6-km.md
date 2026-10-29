---
status: accepted
date: 2026-10-24
---

# 0061 Square maps of 2 to 6 km a side, designed for play, at true local scale

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

- **Maps are square, 2 to 6 km a side, in whole kilometres** (4 to 36 km²), chosen per scenario:

  | Side | For | Density |
  |---|---|---|
  | 2 km | skirmishes, about 2–3,000 soldiers | about 500–750 per km² |
  | **3 km** | **the default**: the typical match of 4–5,000 soldiers | about 450–550 per km² |
  | 4 km | large battles | depends on the armies |
  | 5 km | larger battles | depends on the armies |
  | 6 km | the extreme of 32,000 | about 890 per km² |

  All are smaller than the research's recommendations (4–6 km for the typical match, 8–12 km for the extreme): a game
  map, not a historical field (below).
- **Designed for play, at true local scale.** A map is designed, not copied: it may be inspired by a real place and
  built from its real heights, but the empty distances between features are shortened to what the game needs.
  - Features keep believable sizes: a ridge, a plateau, a village, a stream valley, with slopes as real ground has
    them.
  - Soldiers, formations, weapon ranges and sight are real size.
  - What is never done is squeezing a whole real field uniformly, as the prototype did (2.5×): that steepens every
    slope by the same factor and crowds real-size soldiers, ranges and sight onto less ground.
- **The default game speed is faster than real time,** so an approach of 1–2 km takes minutes on screen, and a whole
  battle fits decision 0009's 30–45 minutes.
- **A historical battle** is a designed map after its field: Austerlitz is a 6 km map built from the real terrain
  around the Pratzen and the Goldbach, its villages, streams and ponds placed closer together, for the 32,000-soldier
  extreme.
- **Budgets:**
  - **Hardware:** the minimum target is unchanged from decision 0011: a gaming laptop with an RTX 3060 (6 GB of video
    memory) at 1080p and 60 fps.
  - **The 3D world streams in tiles around the camera.** 0011's bake budget (at most 600 MB resident) applies to the
    tiles resident at once, not to the map. Static light is still baked once per map (the invariant), tile by tile, at
    build time, and loaded as the camera approaches.
  - **The sim's data uses a compact format.** In today's format (a float64 heightfield, 1 m class grids) a 2 × 2 km map
    is about 22 MB (`docs/proposals/map-format.md`), so a 6 km map would be about 200 MB: too large to hold, and over
    GitHub's 100 MB file limit. The map engine's compact 2 m grids (u16 heights, u16 attribute indexes; the map engine
    proposal §5) total about 5–6 MB per 1.5 km square: about 10 MB at 2 km, 20 MB at 3 km, 90 MB at 6 km (estimates).
    So the large maps' grids are tiled or compressed, and their built data is not committed raw.
  - **The map view covers the whole map.**
- **Vision is a core rule:** units are hidden outside sight; a faded "last seen" marker stays and ages; sight is
  blocked by relief, woods and villages. On these smaller maps fog of war depends on dead ground, so map design leaves
  ridges, valleys and woods to hide behind. This moves vision ahead of the sim's S2 hardening.

This supersedes decision 0011, whose minimum hardware target is restated above. Proposals that state 1–1.5 km keep it
as their history; `docs/vision.md` is updated.


## Consequences

Good:
- room to approach and to guess, at a density between Total War's and the real-scale wargames';
- one rule for every map, sized per scenario;
- smaller data and fewer tiles than real-scale fields.

Bad:
- the 3D world must stream in tiles, with bakes per tile: a new piece of work for Track E, before the look compiler
  (Track M's M4) can serve a whole map;
- the sim's data needs its compact, tiled or compressed format before a large map ships;
- vision moves earlier in the sim track;
- less strategic room than real-scale fields: long approach marches mostly go, and the 32,000 extreme plays as a
  dense fight;
- maps are designed, not imported: building one from real terrain is authoring work (the editor, Track M).

## Alternatives considered

- **1–1.5 km (decision 0011):** the battle only, with no approach or fog of war.
- **2 km:** the armies start within sight and cannon range.
- **The research's sizes (4–6 km typical, 8–12 km extreme):** real-scale room for long approaches; set aside for designed,
  smaller maps (the owner: "it's a game after all").
- **3, 4 and 6 km only:** an earlier version of this record; whole kilometres from 2 to 6 let each scenario fit its
  armies.
- **4–16 km at true scale for whole historical fields:** sized to 100,000-man armies; 4–5k soldiers would be lost on it.
- **The whole field squeezed 2.5× to fit:** untrue slopes and march times. That was the prototype's shortcut.
