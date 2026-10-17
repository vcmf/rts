"""Step 1 and 2 of the workflow for one model: re-scale to metres and improve the rig.

blender -b -P prep.py -- <gunner|light-cannon|horse|dragoon|pistol>   ->  <name>-prepped.blend, <name>-prep.json
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unitkit as K

name = K.args()[0]
K.fresh()
rig, mesh = K.import_fbx(name)
info = {}


def axis_ends(mesh, ids):
    """The two extreme points of a long, thin part along its main axis."""
    pts = [mesh.data.vertices[i].co.copy() for i in ids]
    c = sum(pts, Vector()) / len(pts)
    a = max(pts, key=lambda p: (p - c).length)
    b = max(pts, key=lambda p: (p - a).length)
    ax = (b - a).normalized()
    # end centres: mean of the points within 2 cm of each end along the axis
    ta = [p for p in pts if (p - a).dot(ax) < .02]
    tb = [p for p in pts if (b - p).dot(ax) < .02]
    return sum(ta, Vector()) / len(ta), sum(tb, Vector()) / len(tb)


if name == 'gunner':
    # hip joint at 0.90 m (as the infantryman): the figure is 1.78 m with his shako
    s = .90 / rig.data.bones['mixamorig:Hips'].head_local.z
    K.rescale(rig, mesh, s)
    comps = K.components(mesh)
    staff = next(c for c in comps if (c['max'] - c['min']).z > 1.4 and (c['max'] - c['min']).x < .3)
    a, b = axis_ends(mesh, staff['ids'])
    bottom, top = (a, b) if a.z < b.z else (b, a)
    ebs = K.edit(rig)
    K.add_bone(ebs, 'Staff', bottom, top)
    K.obj_mode()
    K.rigid(mesh, staff['ids'], 'Staff')
    # the modelled grip: where the staff runs through the right fist (used for every grip on a rod)
    bones = rig.data.bones
    wrist = bones['mixamorig:RightHand'].head_local
    palm = (wrist + bones['mixamorig:RightHandMiddle1'].head_local) / 2
    u = (top - bottom).normalized()
    g = bottom + u * (palm - bottom).dot(u)
    info.update(scale=s, staff=dict(ids=staff['ids'], bottom=list(bottom), top=list(top), length=(top - bottom).length),
                grip=dict(axis=list(u), point=list(g), wrist=list(wrist), along=(g - bottom).dot(u)))

elif name == 'light-cannon':
    comps = K.components(mesh)
    wheels = [c for c in comps if (c['max'] - c['min']).z > .3 and (c["max"] - c["min"]).x < .1]
    assert len(wheels) == 2, [((c['max'] - c['min'])) for c in comps[:8]]
    dia = sum((c['max'] - c['min']).z for c in wheels) / 2
    s = 1.35 / dia                       # field-carriage wheel of 1.35 m
    # the Tripo humanoid skeleton is meaningless on a gun: drop it, rebuild from the parts
    for o in list(bpy.data.objects):
        if o.type == 'ARMATURE':
            bpy.data.objects.remove(o)
    mesh.modifiers.clear(); mesh.vertex_groups.clear(); mesh.parent = None
    mesh.scale = (s,) * 3
    for o in bpy.context.selected_objects: o.select_set(False)
    mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    comps = K.components(mesh)
    wheels = sorted([c for c in comps if (c['max'] - c['min']).z > 1.2 and (c['max'] - c['min']).x < .45], key=lambda c: c['center'].x)
    barrel = comps[0]
    assert (barrel['max'] - barrel['min']).y > 1.5, 'barrel is not the largest part'
    hubs = [w['center'] for w in wheels]
    radius = (wheels[0]['max'].z - wheels[0]['min'].z) / 2
    # barrel axis from slices across its length
    bv = [mesh.data.vertices[i].co for i in barrel['ids']]
    y0, y1 = barrel['min'].y, barrel['max'].y
    def slice_centre(y, w=.05):
        p = [v for v in bv if abs(v.y - y) < w]
        return Vector((sum(v.x for v in p) / len(p), y, (max(v.z for v in p) + min(v.z for v in p)) / 2)), max(v.z for v in p)
    muzzle_c, _ = slice_centre(y0 + .03, .03)
    # main axis: power iteration on the covariance of the barrel's vertices
    cen = sum(bv, Vector()) / len(bv)
    cov = Matrix(((0, 0, 0), (0, 0, 0), (0, 0, 0)))
    for v in bv:
        d = v - cen
        for i in range(3):
            for j in range(3):
                cov[i][j] += d[i] * d[j]
    axis = Vector((0, 1, 0))
    for _ in range(50):
        axis = (cov @ axis).normalized()
    if axis.y < 0: axis = -axis          # from the muzzle (-Y) towards the breech
    muzzle_c = cen + axis * (muzzle_c - cen).dot(axis)
    breech_c = muzzle_c + axis * ((y1 - y0) * .93 / max(abs(axis.y), 1e-6))
    bore_r = max((v - muzzle_c - axis * (v - muzzle_c).dot(axis)).length for v in bv if v.y < y0 + .03)
    def dist_to_axis(p):
        d = p - muzzle_c
        return (d - axis * d.dot(axis)).length
    rmax = max(dist_to_axis(v) for v in bv) + .03
    barrel_ids = list(barrel['ids']); wheel_ids = {0: [], 1: []}; gun_ids = []
    for c in comps[1:]:
        if c in wheels:
            wheel_ids[wheels.index(c)] += c['ids']; continue
        vs = [mesh.data.vertices[i].co for i in c['ids']]
        if all(dist_to_axis(v) < rmax for v in vs) and c['min'].y > y0 - .01 and c['max'].y < y1 + .01 and c['center'].z > muzzle_c.z - .08:
            barrel_ids += c['ids']; continue
        side = 0 if c['center'].x < 0 else 1
        if abs(c['center'].x) > .45 and (Vector((0, c['center'].y, c['center'].z)) - Vector((0, hubs[side].y, hubs[side].z))).length < radius * 1.05:
            wheel_ids[side] += c['ids']; continue
        gun_ids += c['ids']
    # trunnion axis: under the barrel axis, at the hub's y (the trunnions sit just ahead of the axle) -
    # take the barrel point above the axle, lowered to the axis
    tr_y = hubs[0].y - .05
    t = (tr_y - muzzle_c.y) / axis.y
    trunnion = muzzle_c + axis * t
    trunnion.x = 0
    # vent: top of the breech, 9 cm ahead of the base ring
    vent = breech_c - axis * .14; vent.z = max(v.z for v in bv if abs(v.y - vent.y) < .02) + .005
    trail = [v for v in (mesh.data.vertices[i].co for i in gun_ids) if v.z < .25]
    trail_end = max(trail, key=lambda v: v.y)
    arm = bpy.data.armatures.new('GunArmature'); rig = bpy.data.objects.new('GunRig', arm)
    bpy.context.scene.collection.objects.link(rig)
    ebs = K.edit(rig)
    K.add_bone(ebs, 'Gun', (0, hubs[0].y, 0), (0, hubs[0].y - .6, 0))
    K.add_bone(ebs, 'Barrel', trunnion, trunnion - axis * .6, 'Gun')
    K.add_bone(ebs, 'WheelL', hubs[1], hubs[1] + Vector((.4, 0, 0)), 'Gun')
    K.add_bone(ebs, 'WheelR', hubs[0], hubs[0] - Vector((.4, 0, 0)), 'Gun')
    K.obj_mode()
    mesh.parent = rig
    mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    K.rigid(mesh, barrel_ids, 'Barrel'); K.rigid(mesh, gun_ids, 'Gun')
    K.rigid(mesh, wheel_ids[1], 'WheelL'); K.rigid(mesh, wheel_ids[0], 'WheelR')
    info.update(scale=s, wheel_radius=radius, hubs=[list(h) for h in hubs], muzzle=list(muzzle_c), breech=list(breech_c),
                axis=list(axis), bore_radius=bore_r, trunnion=list(trunnion), vent=list(vent), trail_end=list(trail_end),
                parts=dict(barrel=len(barrel_ids), gun=len(gun_ids), wheels=[len(wheel_ids[0]), len(wheel_ids[1])]))

elif name == 'horse':
    # the back at the croup (0.626 of the model) is 1.56 m: a 15-hand cavalry horse; the head turned to -Y
    s = 1.56 / .626
    K.rescale(rig, mesh, s, yaw=math.pi / 2)
    rename = {'tripo::Root': 'Root', 'tripo::Spine_0': 'Back', 'tripo::Spine_1': 'Chest',
              'tripo::Head_0': 'Neck1', 'tripo::Head_1': 'Neck2', 'tripo::Head_2': 'Head', 'bone_6': 'Ears', 'tripo::Head_3': 'Muzzle',
              'tripo::0_Left_Limb_0': 'FL1', 'tripo::0_Left_Limb_1': 'FL2', 'tripo::0_Left_Limb_2': 'FL3', 'tripo::0_Left_Limb_3': 'FL4', 'tripo::0_Left_Limb_4': 'FL5', 'tripo::0_Left_Limb_5': 'FL6',
              'tripo::Spine_2': 'FR1', 'bone_15': 'FR2', 'bone_16': 'FR3', 'bone_17': 'FR4', 'bone_18': 'FR5', 'bone_19': 'FR6',
              'bone_20': 'HL1', 'tripo::1_Left_Limb_0': 'HL2', 'tripo::1_Left_Limb_1': 'HL3', 'tripo::1_Left_Limb_2': 'HL4', 'tripo::1_Left_Limb_3': 'HL5', 'tripo::1_Left_Limb_4': 'HL6',
              'bone_26': 'HR1', 'tripo::0_Right_Limb_0': 'HR2', 'tripo::0_Right_Limb_1': 'HR3', 'tripo::0_Right_Limb_2': 'HR4', 'tripo::0_Right_Limb_3': 'HR5', 'tripo::0_Right_Limb_4': 'HR6',
              'tripo::Tail_0': 'Tail1', 'tripo::1_Right_Limb_0': 'Tail2'}
    for b in rig.data.bones:
        b.name = 'Horse:' + rename[b.name]   # vertex groups follow the rename
    # the side check: facing -Y, the horse's left is +X
    fl = rig.data.bones['Horse:FL1'].head_local; fr = rig.data.bones['Horse:FR1'].head_local
    assert fl.x > 0 > fr.x, (fl, fr)
    vs = [v.co for v in mesh.data.vertices]
    # the saddle: lowest point of the back's top line between withers and croup
    prof = []
    for k in range(-30, 30):
        y = k * .025
        p = [v for v in vs if abs(v.y - y) < .0125 and abs(v.x) < .05 and v.z > 1.0]
        if p:
            prof.append((y, max(v.z for v in p)))
    back = [(y, z) for y, z in prof if -.3 < y < .2]
    seat = min(back, key=lambda t: t[1])
    # the tail hair is its own loose part: skin it to the tail bones only (Tripo gave it to the hind legs too)
    comps = K.components(mesh)
    tail = max(comps[1:4], key=lambda c: c['center'].y)
    assert tail['center'].y > .7, tail['center']
    t1 = rig.data.bones['Horse:Tail1']; t2 = rig.data.bones['Horse:Tail2']
    for vg in mesh.vertex_groups:
        vg.remove(tail['ids'])
    g1 = mesh.vertex_groups['Horse:Tail1']; g2 = mesh.vertex_groups['Horse:Tail2']; g0 = mesh.vertex_groups['Horse:Root']
    top = tail['max'].z
    for i in tail['ids']:
        z = mesh.data.vertices[i].co.z
        k = max(0.0, min(1.0, (top - z) / .35))          # 0 at the dock, 1 from 35 cm down
        if k < .3:
            g0.add([i], 1 - k / .3, 'REPLACE'); g1.add([i], k / .3, 'REPLACE')
        else:
            g1.add([i], 1 - (k - .3) / .7, 'REPLACE'); g2.add([i], (k - .3) / .7, 'REPLACE')
    info.update(scale=s, seat=[0, seat[0], seat[1]], profile=prof, tail_vertices=len(tail['ids']),
                barrel_half_width=max(abs(v.x) for v in vs if abs(v.y - seat[0]) < .15 and 1.0 < v.z < 1.35))

elif name == 'dragoon':
    s = .90 / rig.data.bones['mixamorig:Hips'].head_local.z
    K.rescale(rig, mesh, s)
    comps = K.components(mesh)
    # the scabbard hangs on the left hip; the hilt is the small parts above its mouth
    scab = next(c for c in comps if c['count'] > 150 and c['center'].x > .15 and (c['max'] - c['min']).z > .6)
    top = scab['max'].z
    hilt = [c for c in comps if c is not scab and c['count'] < 120 and c['center'].x > .15
            and top - .12 < c['center'].z < top + .15 and (c['max'] - c['min']).z < .2]
    K.rigid(mesh, scab['ids'], 'mixamorig:Hips')
    hilt_ids = [i for c in hilt for i in c['ids']]
    hc = sum((c['center'] for c in hilt), Vector()) / max(1, len(hilt))
    ebs = K.edit(rig)
    K.add_bone(ebs, 'Hilt', hc, hc + Vector((0, 0, .1)), 'mixamorig:Hips')
    K.obj_mode()
    K.rigid(mesh, hilt_ids, 'Hilt')
    a, b = axis_ends(mesh, scab['ids'])
    stop, sbot = (a, b) if a.z > b.z else (b, a)       # the mouth is the upper end
    info.update(scale=s, scabbard=dict(count=scab['count'], min=list(scab['min']), max=list(scab['max']), mouth=list(stop), tip=list(sbot)),
                hilt=dict(parts=len(hilt), count=len(hilt_ids), centre=list(hc)))

elif name == 'pistol':
    # a prop, not rigged: a cavalry pistol of 35 cm (the AN XIII is about 35 cm). Turned so its barrel points
    # +Y with the grip's centre at the origin: the Pistol bone's frame (combine.py), as the sabre's
    lo, hi = K.mesh_bounds([mesh])
    s = .35 / (hi.x - lo.x)
    mesh.scale = (s,) * 3
    for o in bpy.context.selected_objects: o.select_set(False)
    mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vs = [v.co.copy() for v in mesh.data.vertices]
    x0 = min(v.x for v in vs); x1 = max(v.x for v in vs); L = x1 - x0
    face = [v for v in vs if v.x < x0 + .004]                       # the muzzle's face (the barrel points -X)
    muzzle = Vector((x0, sum(v.y for v in face) / len(face), (max(v.z for v in face) + min(v.z for v in face)) / 2))
    cap = [v for v in vs if v.x > x1 - .015]                         # the butt cap
    butt = Vector((sum(v.x for v in cap) / len(cap), sum(v.y for v in cap) / len(cap), min(v.z for v in cap) + .012))
    top = Vector((x0 + .66 * L, muzzle.y, muzzle.z - .028))          # where the handle meets the lock
    grip = top.lerp(butt, .45)
    up_handle = (top - butt).normalized()
    R = Matrix.Rotation(-math.pi / 2, 4, 'Z')                        # -X (the muzzle) -> +Y
    mesh.data.transform(R @ Matrix.Translation(-grip))
    # a few pixels at the RTS camera: Tripo's 10,000 triangles collapsed to about 1,200
    tris0 = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    dec = mesh.modifiers.new('Decimate', 'DECIMATE'); dec.ratio = 1200 / tris0
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier=dec.name)
    to = lambda p: (R @ Matrix.Translation(-grip)) @ p
    info.update(scale=s, length=L, muzzle=list(to(muzzle)), butt=list(to(butt)), handle_top=list(to(top)),
                handle_axis=list((R.to_3x3() @ up_handle).normalized()))
    info['triangles_source'] = tris0

if rig is not None and name != 'light-cannon':
    # Tripo's weights leak between distant bones: keep only bones within reach of each vertex
    info['weights_removed'] = K.clean_weights(rig, mesh, {'horse': .45}.get(name, .16))
if name in ('gunner', 'dragoon'):
    # the coat below the elbows belongs to the body, not the arms
    info['coat_freed'] = K.free_coat_from_arms(mesh, .45, 1.08)
if rig is not None:
    rig.name = {'gunner': 'GunnerRig', 'light-cannon': 'GunRig', 'horse': 'HorseRig', 'dragoon': 'RiderRig'}[name]
    mesh.name = rig.name.replace('Rig', 'Mesh')
else:
    mesh.name = 'PistolMesh'
bpy.context.view_layer.update()
lo = Vector([min((mesh.matrix_world @ v.co)[i] for v in mesh.data.vertices) for i in range(3)])
hi = Vector([max((mesh.matrix_world @ v.co)[i] for v in mesh.data.vertices) for i in range(3)])
info.update(bounds=[list(lo), list(hi)], size=list(hi - lo), triangles=sum(len(p.vertices) - 2 for p in mesh.data.polygons))
(K.ROOT / f'{name}-prep.json').write_text(json.dumps(info, indent=1, default=list))
K.save(K.ROOT / f'{name}-prepped.blend')
print('PREP', name, json.dumps({k: v for k, v in info.items() if k not in ('profile',) and not (isinstance(v, dict) and 'ids' in v)}, default=list))
