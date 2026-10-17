# Authoring a clip module

New clips go in a module file next to `drill.py` (for example `kneel.py`), listed in `drill.MODULES`
(default `kneel,moves,falls,morale`; override with `CLIP_MODULES=a,b`). A module is:

```python
def author(k, T):
    ...
    return [actions...], {'ClipName': dict(frames=…, loop=…, starts=…, ends=…, ...), ...}
```

`k` is build.py's namespace (rig, bone(), limb(), RUN_* tables …). `T` is the drill toolkit: every
local of `drill.author()` at the point modules run, so all of the following are available.

## Keys

`T.key(**kw)` makes a pose; `T.alter(K, **kw)` changes some fields (`hands` and `feet` merge per side).

| Field | Meaning |
|---|---|
| `hips=(offset, yaw, lean, roll)` | offset from the rest hip position; yaw about Z, then lean about X (+ = forward), roll about Y |
| `chest=(yaw, lean, roll)` | spread over the three spine bones |
| `head=(yaw, pitch, roll)` | in world (root) frame; the neck takes half |
| `feet={'Left': (pos, yaw, pitch[, knee_pole])}` | ankle target, foot yaw, foot pitch (+ = toes down); optional world point the knee points at (kneeling, lying) |
| `gun=(space, pivot, target, fwd, lock)` | `space` chest / world / mix; pivot is an anchor name or a gun-local point placed at target; `('q', pivot, target, quaternion)` for an explicit rotation |
| `hands={'Left': (kind, where, palm, pole, space)}` | kind `gun` (gun-local point, locked), `gunpt` (gun-local point, not recorded as a contact), `rod`, `free` (a point), `hang` (a free arm hanging from the shoulder; `where` is its swing angle, + = hand back; use it for every free arm that is not doing something), `relaxed` (arm to a world wrist point, hand relaxed; for thrown or reaching arms only) |
| `curl` | left finger curl 0..1 |
| `curl_right` | right fingers from the modelled grip: 0 = as modelled, negative opens, positive closes |
| `root` | turn of the whole solved pose about the vertical (radians, + = left). Use `T.rotate_key(K, angle)` |

`T.clip(name, [(frame, key, opts), …], extra=fn)`: opts shape the segment that ends at that key:
`ease` (smooth, linear, in, out, snap, slowin), `pivot` (gun point the gun turns about), `arc`
(chest-frame bump of the gun), `hand_arc` ({side: bump}, a regrip), `feet` ({side: (t0, t1)} step
timing), `lift` (step height), `toe`. `extra(f, P)` edits the blended numbers per frame; it may set
`P['gun_post'] = fn(gun) -> gun` to move the gun after it is placed.

## Helpers

- `T.walk_extra(period=k.WALK_N, stride=k.WALK_HALF, lift=k.WALK_LIFT, backward=False)`: the walking
  legs and hips under any upper body; frame 1 equals CARRY's stance. The feet are `k.walk_feet(t)`,
  the same speed-locked law Walking uses. `T.run_extra()`: the running legs (16 frames, k.RUN_SPEED).
- Scale and speeds live in build.py: `k.M_PER_UNIT` (1.82 m), `k.WALK_SPEED` (0.9 m/s), `k.RUN_SPEED`
  (3.2 m/s); never hard-code a stance or a speed (build.py writes them to `gaits.json` for publish).
  `T.chain(e1, e2)` combines extras.
- `T.rotate_key(K, angle)`, `T.planted(world_pos, root)`: turn clips. The validator joins a clip with
  `root_turn=degrees` to the next clip turned by that angle.
- `T.reload_keys(LOAD, CAST, READY, end_opts=None, cast_opts=None)`: the full loading drill for any body pose that
  defines those three keys (the hand targets are on the gun or in the chest frame).
- Poses to start from: `T.CARRY` (= Walking frame 1), `T.READY`, `T.PRESENT`, `T.LOAD`, `T.CAST`,
  `T.GUARD`, `T.STANCE`, `T.GSTANCE`; extras `T.fire_extra` (recoil after `T.SHOT`), `T.aim_extra`,
  `T.guard_extra`. Gun anchors: `T.A[...]` (StockContact, TriggerGrip, ForeGrip, CarryGrip, PortGrip,
  BarrelMuzzle, BayonetTip). Coordinates: −Y forward, −X the soldier's right, +Z up, model ≈ 1 tall.

## Clip table fields

`frames`, `loop`, `starts`, `ends` (`Clip@1`, `Clip@end`, several with `|`, or `still` for a held
last pose), optional `reverse_to`, `events` ({name: frame}), `root_turn` (degrees), `root_speed`
(model units/s), `root_direction` (back, left or right, for loops that do not move forward) and, for
the checks only: `aim` ([first, last] frames to check the left cuff),
`ramrod` (the ramrod may leave the pipes), `lies` (the last frame must rest on the ground).

## Rules

- Every clip starts and ends on a pose another clip shares (or `still`); joins are checked exactly.
- No unreachable grips: build with `DRILL_DEBUG=1` and fix every `SHORT` line.
- `validate-drill.py` must pass: contacts, joins, rigid weapon, ground (> −1.2 cm), wrists, no pops,
  left cuff clear while aiming.
- Look at it: close-ups of the hands on the weapon, the preview from the close-up and the RTS pitch
  (`blender -b -P preview.py -- name=ClipA,ClipB*2`, then ffmpeg). Hands through the wood, feet
  sliding, knees through the ground, a musket through the body are failures even when checks pass.

## Authoring aids

- `DRILL_TRACE=<clip>` prints, for every hand grip of that clip, the shoulder, the target and the
  target in the gun frame; `DRILL_DEBUG_POS=1` adds the same to each `SHORT` line. Both are for
  fitting poses within reach.
- Clips near the ground: `falls.py` wraps `T.clip` with a grounding pass that lifts the solved pose
  so no vertex is below −3 mm (never lowers it, never touches frame 1). Copy it if another module
  needs it, or move it into the toolkit.
- Measuring foot slide: move the root at the stated speed and direction and track any foot (or hand,
  knee, crutch) on the ground from frame to frame; a planted part should not move.
