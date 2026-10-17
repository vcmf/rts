---
status: active
last_reviewed: 2026-10-17
---

# Plan: the cavalryman's pistol

Asked by the owner on 2026-10-17 ("if I give you a handgun, can you do shooting on the cavalry"); the model
came the same day (a flintlock cavalry pistol from Tripo).

## Problem

The cuirassier (`docs/systems/figure-pipeline.md`) has gaits and the sabre but no firearm. French heavy
cavalry carried pistols in holsters at the front of the saddle. The clips must follow decision 0037: a
wind-up the game can stretch, a loop it holds, a shot it anchors.

## Scope

In: the pistol as a source (assets/tripo, listed by hash), re-scaled and turned in the prep step; on its own
bone in the cavalry rig with a holster at the front right of the saddle, the pistol sitting in it in every
clip that does not draw it; six clips (DrawPistol, ReadyPistol, PresentPistol, AimPistol, FirePistol,
HolsterPistol) with their joins and events; a muzzle flash in the previews; the registry and the system doc.

Out: reloading on horseback, firing at the walk or trot, a lighter pistol mesh (it is 10,000 triangles), the
left holster.

## Approach

1. `tools/unitpipe/units/prep.py`: the pistol, unrigged, scaled to 35 cm, its barrel turned to +Y with the
   grip's centre at the origin; its muzzle, butt and handle axis recorded.
2. `tools/unitpipe/units/combine.py`: a `Pistol` bone and a `Holster` bone (child of the horse's back) with
   a made leather holster.
3. `tools/unitpipe/units/anim_cavalry.py`: pistol states in the saddle's frame (grip, barrel, the lock's top,
   chest, head), the hand gripping the handle; the draw along the holster; FirePistol's `shot` at frame 3, a
   kick, back to the ready, the horse starting at the shot.

## Acceptance

- `./tools/unitpipe/units/run-all.sh` passes: every pistol clip on the ground and slide checks, every join
  listed (Idle → DrawPistol → ReadyPistol → PresentPistol → AimPistol → FirePistol → ReadyPistol or
  HolsterPistol → Idle) exact.
- Every earlier clip and its check result unchanged; the battery unchanged.
- The registry regenerated and its test, `npm test` and `node tools/check-docs.mjs` pass.
- Close-ups of the holster, the hand on the butt and the aim reviewed; videos from the side and the RTS
  pitch for the owner.

## Review rounds
