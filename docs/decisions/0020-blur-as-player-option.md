---
status: accepted
date: 2026-10-13
---

# 0020 Depth of field in gameplay is a player option, on by default

Supersedes 0003.

## Context

0003 kept optical blur out of gameplay: an RTS player reads the whole screen, focus pumps as the camera pans, and
blur was expected to erase the painted grain. The owner's references from *Tiny Glade* (`design/refs/tiny-glade-img-2.jpg`, `design/refs/tiny-glade-forest.jpg`)
show strong tilt-shift depth of field over painted leaves, grass and water whose brushwork still reads: the blur
sells the field as a miniature and the strokes survive where it is mild. The owner wants both: the painted look
and the miniature field.

## Decision

Depth of field is a gameplay setting the player turns on or off, **on by default**. It focuses on the camera's
target, keeps a sharp band around it, and its strength follows the zoom and is tuned so formations at the screen's
edges still read (the readability guard's blocks pass with it on). Presentation modes and video export keep their
own, stronger settings.

## Consequences

The invariant "no optical blur during gameplay" becomes "blur is the player's choice"; `AGENTS.md` and the art
bible §1.6 and §6b change with this record. Every look check that judges the frame runs with blur off (it measures
the paint) and the readability guard runs with it on too. The cost (estimated 0.5–1 ms) is charged to the post
budget. Depth still comes from painting first (haze, cooling, looser brushwork): blur adds to it, never replaces it.

## Alternatives considered

- Keep 0003 (blur only in presentation and video): loses the miniature field the owner asked for.
- Blur only at the closest zoom (0003's fallback): too little of the effect at the zooms played most.
- Blur always on: a player who needs every edge sharp has no way out.
