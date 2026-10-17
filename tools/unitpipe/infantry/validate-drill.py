"""Checks for the drill and bayonet clips, read back from the saved .blend (not from the build's state).

Contacts: every hand the build says is holding the musket or the ramrod is measured against that
point on the posed weapon. Joins: every clip edge listed in clips.json matches the pose it joins.
Plus rigid weapon and ramrod, ground, wrists and neck, per-frame pops, stowed ramrod outside the
reload, and readability measures. Writes validation-drill.json; exits non-zero on any failure.
"""
import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy, json, math
from pathlib import Path
from mathutils import Vector as V
root = paths.work('infantry')
bpy.ops.wm.open_mainfile(filepath=str(root / 'soldier-animated.blend'))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
mesh = next(o for o in scene.objects if o.type == 'MESH' and o.name != 'PreviewGround')
clips = json.loads((root / 'clips.json').read_text())['clips']
contacts = json.loads((root / 'contacts.json').read_text())
components = json.loads((root / 'components.json').read_text())
gunids = [i for c in components if c['max'][1] < -.09 and c['min'][0] < -.045 for i in c['ids']]
rodids = [v.index for v in mesh.data.vertices if any(mesh.vertex_groups[g.group].name == 'Ramrod' for g in v.groups)]
pb = rig.pose.bones
CONTACT = {'Left': V((-.012, -.012, -.025)), 'Right': V((.010, -.025, -.008))}
ROD_DIR = -(V(pb['BarrelMuzzle'].bone.head_local) - V(pb['ForeGrip'].bone.head_local)).normalized()
report, fail = {}, []
def check(ok, *msg):
    if not ok: fail.append(' '.join(str(m) for m in msg))
def rel(name): b = pb[name]; return b.matrix @ b.bone.matrix_local.inverted()
def pose(): return [p.matrix.copy() for p in pb]
def diff(a, b): return max(abs(x[r][c] - y[r][c]) for x, y in zip(a, b) for r in range(4) for c in range(4))
def at(action, frame):
    rig.animation_data.action = bpy.data.actions[action]; scene.frame_set(frame); return pose()

deform = [p for p in pb if p.bone.use_deform]
for name, c in clips.items():
    end = c['frames']; r = report[name] = {}
    worst_contact = worst_gun = worst_rod = min_z = 0; min_z = 1; jumps = []; prev = None
    wristbend = wristgap = neckgap = 0
    for f in range(1, end + 1):
        rig.animation_data.action = bpy.data.actions[name]; scene.frame_set(f)
        ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        co = [v.co for v in ev.data.vertices]
        check(all(math.isfinite(x) for v in co for x in v), name, f, 'non-finite vertex')
        min_z = min(min_z, min(v.z for v in co))
        G, Rr = rel('Musket'), rel('Ramrod')
        worst_gun = max(worst_gun, max((co[i] - G @ mesh.data.vertices[i].co).length for i in gunids))
        worst_rod = max(worst_rod, max((co[i] - Rr @ mesh.data.vertices[i].co).length for i in rodids))
        for side, (kind, where) in contacts[name][str(f)].items():
            hb = pb['mixamorig:' + side + 'Hand']
            hand = hb.matrix @ hb.bone.matrix_local.inverted() @ (hb.bone.head_local + CONTACT[side])
            point = G @ V(where) if kind == 'gun' else Rr @ (pb['Ramrod'].bone.head_local + ROD_DIR * where)
            worst_contact = max(worst_contact, (hand - point).length)
        heads = [p.head.copy() for p in deform]
        if prev: jumps.append(max((a - b).length for a, b in zip(heads, prev)))
        prev = heads
        if not c.get('ramrod'):   # the ramrod stays home outside the reloads
            check((Rr @ G.inverted()).to_translation().length < 1e-5 and abs((Rr @ G.inverted()).to_quaternion().angle) < 1e-4, name, f, 'ramrod not stowed')
    for i in range(2 * (end - 1) + 1):
        fr = 1 + i * .5; scene.frame_set(int(fr), subframe=fr - int(fr))
        neckgap = max(neckgap, (pb['mixamorig:Head'].head - pb['mixamorig:Neck'].tail).length)
        for side in ('Left', 'Right'):
            fo, ha = pb['mixamorig:' + side + 'ForeArm'], pb['mixamorig:' + side + 'Hand']
            wristgap = max(wristgap, (ha.head - fo.tail).length)
            wristbend = max(wristbend, (fo.tail - fo.head).angle(ha.tail - ha.head))
    # a pop is a frame-to-frame jump far above its neighbours
    pops = [i + 2 for i in range(1, len(jumps) - 1) if jumps[i] > .02 and jumps[i] > 3 * max(jumps[i - 1], jumps[i + 1])]
    r.update(max_contact_error=worst_contact, weapon_rigidity_error=worst_gun, ramrod_rigidity_error=worst_rod,
             minimum_mesh_height=min_z, max_bone_step=max(jumps), pops=pops, max_wrist_bend_degrees=math.degrees(wristbend),
             max_wrist_gap=wristgap, max_head_neck_gap=neckgap)
    check(worst_contact < 1e-3, name, 'hand off the weapon', worst_contact)
    check(worst_gun < 1e-5 and worst_rod < 1e-5, name, 'weapon or ramrod deforms', worst_gun, worst_rod)
    check(min_z > -.012, name, 'mesh below ground', min_z)
    if c.get('lies'):   # clips ending on the ground must rest on it, not float
        rig.animation_data.action = bpy.data.actions[name]; scene.frame_set(end)
        ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        rest = min(v.co.z for v in ev.data.vertices); r['final_lowest_point'] = rest
        check(rest < .015, name, 'lying pose floats above the ground', rest)
    check(not pops, name, 'pops at frames', pops)
    check(wristbend < math.radians(25), name, 'wrist bend', math.degrees(wristbend))
    check(wristgap < 1e-5 and neckgap < 1e-5, name, 'detached wrist or head', wristgap, neckgap)

# joins: every clip edge equals the pose it joins ('still' = ends on a held pose, nothing follows)
from mathutils import Matrix
def turned(pose, degrees):   # the pose with the root turned about the vertical (clips with root_turn)
    R = Matrix.Rotation(math.radians(degrees), 4, 'Z'); return [R @ m for m in pose]
def edge(spec, name):
    clip, where = spec.split('@'); frame = clips[clip]['frames'] if where == 'end' else (33 if clip == 'Walking' and where == 'end' else int(where))
    return clip, frame
joins = {}
for name, c in clips.items():
    for which, frame in (('starts', 1), ('ends', c['frames'])):
        for spec in c[which].split('|'):
            if spec == 'still': continue
            other = edge(spec, name)
            mine, theirs = at(name, frame), at(*other)
            if which == 'ends' and c.get('root_turn'): theirs = turned(theirs, c['root_turn'])
            if which == 'starts' and clips.get(other[0], {}).get('root_turn') and other[1] == clips[other[0]]['frames']:
                mine = turned(mine, clips[other[0]]['root_turn'])   # follows a clip that turned the root
            e = diff(mine, theirs); joins[f'{name}@{frame} = {spec}'] = e
            check(e < 1e-5, 'join', name, frame, spec, e)
report['joins'] = joins

# readability
rig.animation_data.action = bpy.data.actions['Fire']
def muzzle_pitch(f):   # barrel axis, not butt-to-muzzle (the stock drops below the barrel line)
    scene.frame_set(f); d = pb['BarrelMuzzle'].head - pb['ForeGrip'].head; return math.degrees(math.atan2(d.z, -d.y))
shot = clips['Fire']['events']['fire']
report['fire'] = dict(aim_pitch_degrees=muzzle_pitch(shot - 1), recoil_peak_pitch_degrees=max(muzzle_pitch(f) for f in range(shot, shot + 8)),
                      stock_to_shoulder=(pb['StockContact'].head - pb['mixamorig:RightArm'].head).length)
check(abs(report['fire']['aim_pitch_degrees']) < 5, 'aim not level', report['fire']['aim_pitch_degrees'])
check(report['fire']['recoil_peak_pitch_degrees'] - report['fire']['aim_pitch_degrees'] > 10, 'recoil too small')
rig.animation_data.action = bpy.data.actions['BayonetThrust']
scene.frame_set(1); t0 = pb['BayonetTip'].head.copy(); scene.frame_set(13); t1 = pb['BayonetTip'].head.copy()
report['thrust'] = dict(tip_forward_travel=t0.y - t1.y)
check(t0.y - t1.y > .30, 'thrust too short', t0.y - t1.y)
rig.animation_data.action = bpy.data.actions['ButtStroke']
scene.frame_set(1); b0 = pb['StockContact'].head.copy(); scene.frame_set(15); b1 = pb['StockContact'].head.copy()
report['butt_stroke'] = dict(butt_travel=(b1 - b0).length, butt_height_at_hit=b1.z)
check((b1 - b0).length > .40, 'butt stroke too small', (b1 - b0).length)
rig.animation_data.action = bpy.data.actions['Reload']
scene.frame_set(144); out = pb['Ramrod'].head - pb['BarrelMuzzle'].head
report['reload'] = dict(rod_head_above_muzzle_when_drawn=out.length)

# cuff: forearm and hand vertices within 2 cm of the wrist joint (rest), tested inside the musket by ray parity
from mathutils.bvhtree import BVHTree
vg = {g.index: g.name for g in mesh.vertex_groups}
dom = [vg[max(v.groups, key=lambda g: g.weight).group] if v.groups else '' for v in mesh.data.vertices]
gunset = set(gunids)
gunfaces = [list(p.vertices) for p in mesh.data.polygons if all(i in gunset for i in p.vertices)]
wrist0 = pb['mixamorig:LeftHand'].bone.head_local
cuffids = [i for i, n in enumerate(dom) if n in ('mixamorig:LeftForeArm', 'mixamorig:LeftHand') and (mesh.data.vertices[i].co - wrist0).length < .02]
RAYS = [V(d).normalized() for d in ((1, .13, .07), (-.11, 1, .17), (.05, -.19, -1))]
def inside(bvh, p):
    votes = 0
    for d in RAYS:
        n, o = 0, p.copy()
        while True:
            loc = bvh.ray_cast(o, d, 1.)[0]
            if loc is None: break
            n += 1; o = loc + d * 1e-5
        votes += n % 2
    return votes >= 2
cuff = {}
for name, frames in ((n, range(c['aim'][0], c['aim'][1] + 1)) for n, c in clips.items() if 'aim' in c):   # from the aim on
    rig.animation_data.action = bpy.data.actions[name]; worst = 0; clear = 1
    for f in frames:
        scene.frame_set(f)
        ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()); co = [v.co.copy() for v in ev.data.vertices]
        bvh = BVHTree.FromPolygons(co, gunfaces)
        worst = max(worst, sum(1 for i in cuffids if inside(bvh, co[i])))
        clear = min(clear, bvh.find_nearest(pb['mixamorig:LeftHand'].head)[3])
    cuff[name] = dict(left_cuff_vertices_inside=worst, left_wrist_clearance=clear)
    check(worst == 0 and clear > .010, name, 'left cuff through the musket while aiming', worst, clear)
report['aim_cuff'] = cuff

report['failures'] = fail
(root / 'validation-drill.json').write_text(json.dumps(report, indent=1))
for name in clips: print(name, {k: (round(v, 6) if isinstance(v, float) else v) for k, v in report[name].items()})
print('joins max error', max(joins.values()))
print('fire', report['fire']); print('aim cuff', report['aim_cuff']); print('thrust', report['thrust']); print('butt', report['butt_stroke'])
if fail:
    print('FAIL', *fail, sep='\n  '); raise SystemExit(1)
print('PASS: contacts, joins, left cuff clear while aiming, rigid weapon and ramrod, ground, wrists, neck, no pops, readability')
