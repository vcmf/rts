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
clip that does not draw it; seven clips (DrawPistol, ReadyPistol, PresentPistol, AimPistol, LowerPistol,
FirePistol, HolsterPistol) with their joins and events; a muzzle flash in the previews; the registry and the system doc.

Out: reloading on horseback, firing at the walk or trot, the left holster.

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
- Every earlier clip and its check result unchanged, except where review asked: DrawSabre and SheatheSabre's
  reach (no pop) and the draw events' meaning, and every sabre and battery event made 1-based as the registry
  says (the battery's checks identical).
- The registry regenerated and its test, `npm test` and `node tools/check-docs.mjs` pass.
- The rider's right wrist within 40° in every clip holding or using a weapon, 70° in the draws and returns
  (the check fails otherwise).
- Close-ups of the holster, the hand on the butt and the aim reviewed; videos from the side and the RTS
  pitch for the owner.

## Review rounds

- **Round 1** (`/code-review high`): severe: the holstered pistol lay beside its holster (the bore runs 6 cm
  off the grip's axis) and kept a fixed roll while the horse turned; the draw and holster events were off by
  about 7 frames and `drawn` meant something else for the sabre. Fixed: the pistol's rest pose is in the
  holster, as its child (bore on the holster's axis), so holstered is every clip's default and moves with the
  horse; `drawn` is where a weapon clears its scabbard or holster and `sheathed` / `holstered` where it is
  fully back, for both weapons; the reaching hand blends to exactly the grip's wrist and rotation (no pop,
  in both draws); the pistol is decimated to about 1,200 triangles in the prep; one state blend and one
  standing-clip builder for both weapons; the prep's pistol branch is part of the chain; a robust fallback
  for the pistol's frame.
- **Round 2** (`/code-review high`): moderate only, fixed and stopped: the elbow blended through both draws (it
  snapped where a phase handed over); LowerPistol, so an aim can be called off without a shot (decision 0037);
  the sabre's and the battery's events made 1-based like the registry (the gun's shot was a frame early); the
  aim's sway keyed every frame; the events' meaning written in the system doc; the rest hand and the reactions
  shared; the rider seated before a draw only for the sabre; the plan's claim of unchanged clips corrected.

## Owner's review

- **2026-10-17**: "the fighting movements seem not natural; hand movements in both pistol shooting and sword
  fighting are not correct". Measured: the rider's wrist bent 90 to 150 degrees in the sabre and pistol clips
  (the hand was placed by a point and the weapon's direction, the forearm left to the IK). Reworked: the arm
  is posed by its joints (units/arm.py), every weapon state solved for a straight wrist, the draws reworked,
  the holster turned along the reach, and the wrist checked in units/validate.py. Now: the gaits 7.7°, the
  sabre and pistol clips at most 37.5°, the draws and returns 65.5° and 66.6°. Every clip of the rider was
  re-authored, so their poses change; lengths and events do not. The crew's wrists (40 to 170 degrees) are the
  next fix, out of this PR.

- **Round 3** (`/code-review high`, the first on the arm system): severe: both draws jumped where the pull
  handed over to arm states (the hand, the weapon's roll, the elbow), and the elbow jumped at the grab; the
  sabre's tip was still in the scabbard at `drawn`; the elbow's swivel sign was reversed (+ took it inwards);
  the forearm's turn had no limit. Measuring the fix found more: the sabre's blade had always pointed up
  out of the fist during the draw, never in the scabbard, and the grip ended 1.5 arm-lengths from the
  shoulder (the hand trailed it); the pistol's pull ended with the hand 0.21 arm-lengths from the shoulder.
  Fixed: the scabbard on its own bone, stretched to hold the blade, swinging forward and sliding down its
  slings in the draw while the blade slides out of it; the rider sitting back in the pistol's pull; the
  elbow placed for the straightest wrist while the weapon leads; the hand-over's difference faded out; the
  swivel's sign fixed and the forearm's turn limited, `aim_wrist` searching the swivel and the sabre's roll
  in the hand too (every keyed sabre state now within 36° of wrist and 14° of its blade target); `resolve()`
  refusing to run mid-frame; the dead code removed.
