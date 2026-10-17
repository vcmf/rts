"""Check each LOD over every frame of every clip: vertices weighted to the musket or ramrod move
rigidly with it (decimation must not blend weapon and hand weights), skin weights sum to 1,
nothing goes below -1.2 cm, all coordinates finite. Writes validation-lod.json; exits 1 on failure."""
import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy, json, math
from pathlib import Path
ROOT = paths.work('infantry')
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'soldier-lods.blend'))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE'); pb = rig.pose.bones
lods = json.loads((ROOT / 'lods.json').read_text()); report = {}; fail = []
def rel(n): b = pb[n]; return b.matrix @ b.bone.matrix_local.inverted()
for name, info in lods.items():
    o = bpy.data.objects[info['object']]; me = o.data; g = {vg.index: vg.name for vg in o.vertex_groups}
    weapon = {}; mixed = 0; badsum = 0
    for v in me.vertices:
        ws = {g[x.group]: x.weight for x in v.groups if x.weight > 1e-4}
        s = sum(ws.values())
        if s and abs(s - 1) > .02: badsum += 1
        for part in ('Musket', 'Ramrod'):
            w = ws.get(part, 0) / s if s else 0
            if w > .999: weapon[v.index] = part
            elif w > .01: mixed += 1
    worst = 0; minz = 1; finite = True
    for action in bpy.data.actions:
        rig.animation_data.action = action
        for f in range(int(action.frame_range[0]), int(action.frame_range[1]) + 1, 2):
            scene.frame_set(f); ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
            T = {p: rel(p) for p in ('Musket', 'Ramrod')}
            worst = max([worst] + [(ev.vertices[i].co - T[p] @ me.vertices[i].co).length for i, p in weapon.items()])
            minz = min(minz, min(v.co.z for v in ev.vertices))
            finite &= all(math.isfinite(c) for v in ev.vertices for c in v.co)
    report[name] = dict(triangles=info['triangles'], weapon_vertices=len(weapon), vertices_mixing_weapon_and_body=mixed,
                        weight_sum_errors=badsum, weapon_rigidity_error=worst, minimum_height=minz, finite=finite)
    print(name, report[name])
    if mixed: fail.append(f'{name}: {mixed} vertices blend weapon and body weights (the weapon would bend)')
    if badsum: fail.append(f'{name}: {badsum} vertices with weights not summing to 1')
    if worst > 1e-5: fail.append(f'{name}: weapon deforms by {worst}')
    if minz < -.012: fail.append(f'{name}: below ground {minz}')
    if not finite: fail.append(f'{name}: non-finite vertices')
report['failures'] = fail
(ROOT / 'validation-lod.json').write_text(json.dumps(report, indent=1))
if fail: print('FAIL', *fail, sep='\n  '); raise SystemExit(1)
print(f'PASS: rigid weapon, clean weights, ground, finite on every LOD, all {len(bpy.data.actions)} clips (every 2nd frame)')
