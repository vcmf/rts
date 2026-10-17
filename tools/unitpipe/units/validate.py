"""Checks of every clip of an animated unit, on the deformed mesh.

blender -b <unit>-animated.blend -P validate.py -- <battery|cavalry>   ->  validation-<unit>.json, exit 1 on failure

- ground: no vertex below -2 cm (hooves, boots, wheels, trail);
- planted feet do not slide: a hoof or boot sole on the ground (lowest point under 2 cm) moves less than
  2.5 cm a frame over the ground, the clip's root motion included (the single lift-off frame of a hoof
  pivots about the fetlock, not the toe: up to about 2.2 cm at the walk);
- loops close: the last frame equals the first (max vertex distance under 1 mm);
- joins: a clip's last frame equals the first frame of each clip it leads to ('next' in the clips file).
"""
import bpy, json, sys, math
from pathlib import Path
from mathutils import Vector
ROOT = Path(bpy.data.filepath).parent
unit = sys.argv[sys.argv.index('--') + 1]
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig)
clips = json.loads((ROOT / f'{unit}-clips.json').read_text())
sc = bpy.context.scene
gi = {g.name: g.index for g in mesh.vertex_groups}


def ids_of(prefixes, min_w=.5):
    want = {gi[n] for n in gi if any(n.startswith(p) for p in prefixes)}
    return [v.index for v in mesh.data.vertices if any(g.group in want and g.weight >= min_w for g in v.groups)]


if unit == 'cavalry':
    feet = {leg: ids_of([f'Horse:{leg}5', f'Horse:{leg}4']) for leg in ('FL', 'FR', 'HL', 'HR')}
else:
    feet = {}
    for role in ('Sponger', 'Loader', 'Ventsman', 'Firer'):
        for side in ('Left', 'Right'):
            feet[f'{role}.{side}'] = ids_of([f'{role}:mixamorig:{side}Foot', f'{role}:mixamorig:{side}ToeBase'])


def frame_coords(f):
    sc.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    me = ev.to_mesh()
    co = [mesh.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return co


report = {}; ok = True
for name, meta in clips.items():
    act = bpy.data.actions[name]
    rig.animation_data.action = act
    if hasattr(rig.animation_data, 'action_slot') and act.slots:
        rig.animation_data.action_slot = act.slots[0]
    n = meta['frames']; v = meta.get('root_speed', 0.0)
    prev = None; worst_slide = {}; low = 1e9; first = None; last = None
    for f in range(1, n + 1):
        co = frame_coords(f)
        low = min(low, min(c.z for c in co))
        shift = Vector((0, -v * (f - 1) / 24, 0))       # the unit moves along -Y at root speed
        cur = {}
        for k, ids in feet.items():
            pts = [co[i] for i in ids]
            zmin = min(p.z for p in pts)
            sole = [p for p in pts if p.z < zmin + .02]
            c = sum(sole, Vector()) / len(sole) + shift
            cur[k] = (zmin, c)
            if prev and prev[k][0] < .02 and zmin < .02:
                d = (Vector((c.x, c.y, 0)) - Vector((prev[k][1].x, prev[k][1].y, 0))).length
                worst_slide[k] = max(worst_slide.get(k, 0), d)
        prev = cur
        if f == 1: first = co
        if f == n: last = co
    r = dict(lowest=round(low, 4), slide_cm={k: round(d * 100, 2) for k, d in worst_slide.items()})
    fails = []
    if low < -.02: fails.append(f'below ground {low:.3f}')
    bad = {k: d for k, d in worst_slide.items() if d > .025}
    if bad: fails.append('slide ' + ', '.join(f'{k} {d*100:.1f} cm' for k, d in bad.items()))
    if meta.get('loop'):
        gap = max((a - b).length for a, b in zip(first, last))
        r['loop_gap_mm'] = round(gap * 1000, 2)
        if gap > .001: fails.append(f'loop gap {gap*1000:.1f} mm')
    r['fails'] = fails
    ok &= not fails
    report[name] = r
    print('CHECK', name, 'OK' if not fails else 'FAIL', json.dumps(r))
# joins
ends = {}
for name, meta in clips.items():
    for nxt in meta.get('next', []):
        for clip, fr in ((name, meta['frames']), (nxt, 1)):
            rig.animation_data.action = bpy.data.actions[clip]
            if hasattr(rig.animation_data, 'action_slot') and bpy.data.actions[clip].slots:
                rig.animation_data.action_slot = bpy.data.actions[clip].slots[0]
            ends[(clip, fr)] = frame_coords(fr)
        gap = max((a - b).length for a, b in zip(ends[(name, meta['frames'])], ends[(nxt, 1)]))
        r = report.setdefault('joins', {})
        r[f'{name}>{nxt}'] = round(gap * 1000, 2)
        bad = gap > .001
        ok &= not bad
        print('CHECK join', name, '>', nxt, 'FAIL' if bad else 'OK', f'{gap*1000:.2f} mm')
(ROOT / f'validation-{unit}.json').write_text(json.dumps(report, indent=1))
sys.exit(0 if ok else 1)
