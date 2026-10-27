---
status: accepted
date: 2026-10-27
---

# 0070 A real field may be fitted to a map as a scale model: distances and heights scaled by one factor

## Context

Decision 0061 makes maps 2 to 6 km a side, designed for play, and rules out "squeezing a whole real field uniformly,
as the prototype did (2.5×)": that squeeze shrank distances but kept heights, so every slope steepened by the same
factor. Austerlitz is a 6 km map (M8, `docs/plans/active/m8-austerlitz.md`), but its field is about 12 km from the
Brünn–Olmütz highway in the north to the Satschan ponds in the south. Cutting the relief into pieces moved closer keeps
each feature's real size, at the cost of seams and of design work on every piece. The owner asked for the simple way:
the same map, smaller (2026-10-27).

## Decision

- A `relief.dem` piece may be read as a **scale model** (`scale`, 1 to 4): a map point (x, z) reads its file at
  (k x + shift.x, k z + shift.z), and its height above the datum is the file's divided by k. Distances and heights
  shrink together, so slopes and sight angles are the field's.
- What 0061 rules out stays ruled out: distances scaled and heights kept.
- **Austerlitz** is one piece at 2×: 12 km of ČÚZK's relief in 6 km, its window 0.5 km south of the crop's centre
  (the owner chose it over 1.5× from side-by-side screenshots, 2026-10-27). The period map's scan follows the piece by
  the same factor (decision 0069).
- Cutting and moving pieces stays available, per piece, for maps that need it.

## Consequences

- Good: the field keeps every relation: which hill sees which valley, where each village lies on its stream; one piece,
  no seams.
- Good: slopes, so movement costs and the sim's slope rules, are the field's.
- Bad: features shrink by the factor while soldiers, formations, ranges and buildings stay real size: the Pratzen
  plateau, about 2 km across, is 1 km; a battalion's line takes twice its share of it, and a gun's reach covers twice
  as much of the field.
- Bad: folds the size of a man halve: a 3 m dip that hid a standing man becomes 1.5 m and no longer does; woods and
  buildings stand out more against halved hills.
- Neutral: stream widths and depths, house sizes and wood heights are attributes, set at real size as before.

## Alternatives considered

- **Pieces of the field moved closer** (0061's way, the plan's first idea): features at real size, but seams to blend
  and every piece placed by hand.
- **Distances scaled, heights kept:** twice the slopes; what 0061 rules out.
- **1.5×:** 9 km of field; the highway and the southern villages and ponds left out.
