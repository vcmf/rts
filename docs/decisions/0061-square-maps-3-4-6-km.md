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

Two research notes (kept outside the repository, under `scratch/map-view/`) agree on the scale:
- **History:**
  - a 600-man battalion in line is about 120 m wide;
  - small battles of 10–35,000 men held about 3 km of front, inside 6–10 km of manoeuvre ground;
  - armies stood 2–8 km apart on the morning of battle;
  - formations show at 1.2–1.5 km.
- **Games:**
  - Total War puts 5–10,000 men on 1–2 km with no room to approach, and players ask for more;
  - Scourge of War's real-scale maps are about 8 km;
  - maps of 40–80 km are avoided, for lag and long marches;
  - a density of about 250–500 soldiers per km² gives room to manoeuvre without losing the armies.

Most whole-battle fronts and all densities are the researchers' estimates; the formation widths are sourced.

## Decision

- **Maps are square:** 3, 4 or 6 km a side (9, 16 or 36 km²), chosen per scenario.
  - **4 km** is the default, for the typical match of 4–5,000 soldiers: about 250–300 per km², with 1.5–3 km to
    approach and room to flank and to hide.
  - **3 km** is for small actions.
  - **6 km** is for the extreme of 32,000. It is denser than the research's 8–12 km, about 890 per km², near Scourge
    of War's Wavre map. Its front of about 3 km leaves about 1.5 km of flank a side, so there is less room for wide
    manoeuvre (the owner's choice).
- **True scale:** distances, slopes, ranges and sight are real; nothing is squeezed. Compressing distance would steepen
  slopes and crowd real-size soldiers, ranges and sight onto less ground. Where an approach is too slow, the clock
  speeds up instead.
- **A historical battle** is a real-scale crop of its field at one of these sizes, fought by a representative army.
  Austerlitz: a 6 km crop around the Pratzen and the Goldbach, with 32,000 soldiers.
- **What it implies:**
  - the sim loads a whole map's 2 m grids: about 70 MB for 6 km, an estimate;
  - the 3D world, today one 800 m tile, streams in tiles around the camera;
  - the map view covers the whole map;
  - vision is a core rule: units are hidden outside sight, a faded "last seen" marker stays and ages, and sight is
    blocked by relief, woods and villages.

This supersedes decision 0011's play area. Its minimum hardware target stands.

## Consequences

Good:
- room to approach and to guess, at the density the history and the games point to;
- one rule for every map;
- the sim needs no tiling at these sizes.

Bad:
- the 3D world must stream in tiles, a new piece of work for Track E;
- vision moves earlier in the sim track;
- the 6 km extreme is tighter than the research suggests;
- an approach on a 4 km map takes about 30–40 minutes of real-time marching before contact.

## Alternatives considered

- **1–1.5 km (decision 0011):** the battle only, with no approach or fog of war.
- **2 km:** the armies start within sight and cannon range.
- **8–12 km for the extreme:** the research's choice, set aside for 6 km. It stays open for march-heavy scenarios with
  reinforcements from the edges.
- **4–16 km at true scale for whole historical fields:** sized to 100,000-man armies; 4–5k soldiers would be lost on it.
- **The whole field squeezed 2.5× to fit:** untrue slopes and march times. That was the prototype's shortcut.
