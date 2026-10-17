"""Step 3 of the workflow: combine the parts of a multi-object unit into one rig and one mesh.

blender -b -P combine.py -- battery   ->  battery-combined.blend  (the gun, a crew of four, their props)
blender -b -P combine.py -- cavalry   ->  cavalry-combined.blend  (the horse, its rider, a sabre, a saddle)
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix, Euler
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unitkit as K

which = K.args()[0]


def append(blend, names):
    with bpy.data.libraries.load(str(K.ROOT / blend), link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in names]
    out = []
    for o in dst.objects:
        bpy.context.scene.collection.objects.link(o)
        out.append(o)
    return out


def place_copy(rig, mesh, loc, yaw):
    for o in bpy.context.selected_objects: o.select_set(False)
    rig.location = loc; rig.rotation_euler = (0, 0, yaw)
    bpy.context.view_layer.update()
    for o in (rig, mesh): o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in (rig, mesh): o.select_set(False)


def prefix_bones(rig, prefix):
    for b in rig.data.bones:
        b.name = prefix + b.name


def prop_bone(rig, mesh_obj, name, head, tail, parent=None):
    ebs = K.edit(rig)
    K.add_bone(ebs, name, head, tail, parent)
    K.obj_mode()
    mesh_obj.parent = rig
    vg = mesh_obj.vertex_groups.new(name=name)
    vg.add(list(range(len(mesh_obj.data.vertices))), 1.0, 'REPLACE')
    mod = mesh_obj.modifiers.new('Armature', 'ARMATURE'); mod.object = rig


def join(rig, rigs, meshes, name):
    for o in bpy.context.selected_objects: o.select_set(False)
    for r in rigs: r.select_set(True)
    rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.join()
    import re
    for m in meshes:   # copies of one model share its material (and texture)
        for slot in m.material_slots:
            base = re.sub(r'\.\d{3}$', '', slot.material.name) if slot.material else None
            if base and base != slot.material.name and base in bpy.data.materials:
                slot.material = bpy.data.materials[base]
    for o in bpy.context.selected_objects: o.select_set(False)
    main = meshes[0]
    for m in meshes: m.select_set(True)
    bpy.context.view_layer.objects.active = main
    bpy.ops.object.join()
    main.modifiers.clear()
    mod = main.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    main.parent = rig
    rig.name = name + 'Rig'; main.name = name + 'Mesh'
    return rig, main


if which == 'battery':
    K.fresh()
    bpy.ops.wm.open_mainfile(filepath=str(K.ROOT / 'light-cannon-prepped.blend'))
    gun = json.loads((K.ROOT / 'light-cannon-prep.json').read_text())
    gp = json.loads((K.ROOT / 'gunner-prep.json').read_text())
    from battery_layout import POSTS
    grig = bpy.data.objects['GunRig']; gmesh = bpy.data.objects['GunMesh']
    rigs = []; meshes = [gmesh]
    for n, (role, post) in enumerate(POSTS['ready'].items(), 1):
        r, m = sorted(append('gunner-prepped.blend', {'GunnerRig', 'GunnerMesh'}), key=lambda o: o.type)
        prefix = f'{role}:'
        if role != 'Sponger':
            # only the sponger keeps the sponge-rammer: delete it from the others
            staff_ids = set(gp['staff']['ids'])
            import bmesh
            bm = bmesh.new(); bm.from_mesh(m.data)
            bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.verts[i] for i in staff_ids], context='VERTS')
            bm.to_mesh(m.data); bm.free()
            vg = m.vertex_groups.get('Staff')
            if vg: m.vertex_groups.remove(vg)
            ebs = K.edit(r); ebs.remove(ebs['Staff']); K.obj_mode()
        prefix_bones(r, prefix)
        place_copy(r, m, Vector((post[0], post[1], 0)), post[2])
        rigs.append(r); meshes.append(m)
    # the sponger's staff becomes a free prop bone of the whole rig
    # props: the cartridge (round shot, wooden sabot and serge bag) and the linstock (a portfire holder)
    canvas = K.flat_material('Cartridge', (.78, .72, .58))
    cart = K.make_prop('Cartridge', [('cyl', (0, 0, -.12), (0, 0, .07), .052, .052, 12), ('cyl', (0, 0, .07), (0, 0, .13), .055, .03, 12)], canvas)
    wood = K.flat_material('LinstockWood', (.32, .2, .1))
    match = K.flat_material('Match', (.25, .08, .02), emission=(1.0, .35, .05))
    lin = K.make_prop('Linstock', [('cyl', (0, 0, 0), (0, 0, 1.0), .014, .012, 8),
                                   ('cyl', (0, 0, 1.0), (0, 0, 1.06), .012, .008, 8)], wood)
    tip = K.make_prop('LinstockMatch', [('cyl', (0, 0, 1.06), (0, 0, 1.12), .009, .007, 8)], match)
    for o in (lin, tip):
        o.select_set(True)
    bpy.context.view_layer.objects.active = lin; bpy.ops.object.join(); lin = bpy.context.object
    for o in bpy.context.selected_objects: o.select_set(False)
    prop_bone(grig, cart, 'Cartridge', (0, 0, -.12), (0, 0, .13))
    prop_bone(grig, lin, 'Linstock', (0, 0, 0), (0, 0, 1.12))
    meshes += [cart, lin]
    rig, mesh = join(grig, rigs, meshes, 'Battery')
    bpy.context.view_layer.update()
    ebs = K.edit(rig)
    ebs['Sponger:Staff'].name = 'Staff'
    K.obj_mode()
    info = dict(gun=gun, staff=gp['staff'] | dict(ids=None), cartridge=dict(length=.25), linstock=dict(length=1.12, match=1.09))
    (K.ROOT / 'battery-combined.json').write_text(json.dumps(info, indent=1))
    K.save(K.ROOT / 'battery-combined.blend')
    print('COMBINED battery', len(rig.data.bones), 'bones', sum(len(p.vertices) - 2 for p in mesh.data.polygons), 'triangles')

elif which == 'cavalry':
    K.fresh()
    bpy.ops.wm.open_mainfile(filepath=str(K.ROOT / 'horse-prepped.blend'))
    hp = json.loads((K.ROOT / 'horse-prep.json').read_text())
    dp = json.loads((K.ROOT / 'dragoon-prep.json').read_text())
    hrig = bpy.data.objects['HorseRig']; hmesh = bpy.data.objects['HorseMesh']
    r, m = sorted(append('dragoon-prepped.blend', {'RiderRig', 'RiderMesh'}), key=lambda o: o.type)
    prefix_bones(r, 'Rider:')
    seat = Vector(hp['seat'])
    hip = r.data.bones['Rider:mixamorig:Hips'].head_local
    # rest: the rider's hip joint 14 cm above the seat of the saddle (the saddle adds 6 cm)
    place_copy(r, m, Vector((0, seat.y - hip.y, seat.z + .20 - hip.z)), 0)
    # the sabre: a heavy cavalry sword, 0.97 m straight blade, brass guard, leather grip;
    # its bone runs from the grip's centre along the blade
    # bright steel, not dark metal: the blade must read at the RTS camera (readable first)
    steel = K.flat_material('SabreSteel', (.86, .88, .92), metallic=.3, rough=.3)
    brass = K.flat_material('SabreBrass', (.7, .52, .2), metallic=.7, rough=.45)
    leather = K.flat_material('SabreGrip', (.12, .08, .05))
    blade = K.make_prop('SabreBlade', [('blade', (0, .085, 0), (0, 1.055, 0), .042, .010)], steel)
    guard = K.make_prop('SabreGuard', [('box', (0, .075, 0), (.075, .012, .03)), ('cyl', (0, .075, -.015), (0, -.07, -.03), .006, .006, 6),
                                       ('cyl', (0, -.07, 0), (0, -.09, 0), .016, .012, 8)], brass)
    grip = K.make_prop('SabreGrip', [('cyl', (0, -.07, 0), (0, .07, 0), .015, .016, 8)], leather)
    for o in (blade, guard, grip): o.select_set(True)
    bpy.context.view_layer.objects.active = blade; bpy.ops.object.join(); sabre = bpy.context.object
    for o in bpy.context.selected_objects: o.select_set(False)
    prop_bone(hrig, sabre, 'Sabre', (0, 0, 0), (0, .3, 0))
    # the pistol (pistol-prepped.blend: barrel along +Y, the grip's centre at the origin) on its own bone,
    # and its holster at the front of the saddle on the right, the muzzle down: where French cavalry carried it
    holster_leather = K.flat_material('Holster', (.16, .09, .05))
    hmouth = Vector((-.17, hp['seat'][1] - .30, hp['seat'][2] + .04))
    haxis = Vector((-.22, -.38, -.90)).normalized()             # down, forward and out, along the shoulder
    holster = K.make_prop('Holster', [('cyl', hmouth, hmouth + haxis * .25, .040, .030, 10)], holster_leather)
    prop_bone(hrig, holster, 'Holster', hmouth, hmouth + haxis * .25, 'Horse:Back')
    # the pistol rests in its holster, as its child: holstered is every clip's default. Its frame (barrel +Y,
    # lock top +Z, the grip's centre at the origin) is placed with the bore on the holster's axis, muzzle down,
    # the lock's top forward so the butt curves back towards the rider
    pp = json.loads((K.ROOT / 'pistol-prep.json').read_text())
    bore = Vector(pp['muzzle']).z
    y = haxis; z = Vector((0, -1, 0)) - y * Vector((0, -1, 0)).dot(y); z.normalize(); x = y.cross(z)
    G = hmouth - y * .06 - z * bore
    held = Matrix((x, y, z)).transposed().to_4x4(); held.translation = G
    pistol = next(o for o in append('pistol-prepped.blend', {'PistolMesh'}) if o.type == 'MESH')
    pistol.data.transform(held)
    ebs = K.edit(hrig)
    pb_ = K.add_bone(ebs, 'Pistol', G, G + y * .3, 'Holster')
    pb_.matrix = held; pb_.length = .3
    K.obj_mode()
    pistol.parent = hrig
    pistol.vertex_groups.new(name='Pistol').add(list(range(len(pistol.data.vertices))), 1.0, 'REPLACE')
    pistol.modifiers.new('Armature', 'ARMATURE').object = hrig
    # the tack (the Tripo horse has none): a shabraque and a saddle cut from the horse's own skin and pushed
    # out along its normals, so they fit the body and deform with it; a rolled cloak behind the saddle
    sy, sz = seat.y, seat.z
    def shell(name, keep, push, mats, mat_of_face=None):
        o = hmesh.copy(); o.data = hmesh.data.copy(); o.name = name
        bpy.context.scene.collection.objects.link(o)
        import bmesh
        bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context='VERTS')
        bm.normal_update()
        for v in bm.verts:
            v.co += v.normal * push(v.co)
        bm.to_mesh(o.data); bm.free()
        o.data.materials.clear()
        for m_ in mats:
            o.data.materials.append(m_)
        if mat_of_face:
            for p_ in o.data.polygons:
                p_.material_index = mat_of_face(p_.center)
        return o
    cloth = K.flat_material('Shabraque', (.025, .04, .13))
    trim = K.flat_material('ShabraqueTrim', (.85, .80, .62))
    leather = K.flat_material('Saddle', (.22, .13, .07))
    cloak = K.flat_material('Portmanteau', (.03, .05, .15))
    def in_shab(c):
        dy = abs(c.y - (sy + .04)); return c.z > sz - .46 + .25 * (dy / .44) ** 4 and dy < .44 and c.z > 1.0
    shab = shell('Shabraque', in_shab, lambda c: .014, [cloth, trim],
                 lambda c: 1 if (c.z < sz - .38 + .25 * (abs(c.y - (sy + .04)) / .44) ** 4 or abs(c.y - (sy + .04)) > .39) else 0)
    def in_seat(c):
        return abs(c.y - (sy - .02)) < .25 and c.z > sz - .17 and abs(c.x) < .2
    def seat_push(c):
        dy = (c.y - (sy - .02)) / .25
        return .03 + .07 * max(0.0, abs(dy) - .55) / .45 * (1 if dy < 0 else .8)      # pommel and cantle
    saddle = shell('Saddle', in_seat, seat_push, [leather])
    roll = K.make_prop('Portmanteau', [('cyl', (-.26, sy + .36, sz + .07), (.26, sy + .36, sz + .07), .075, .075, 10)], cloak)
    prop_bone(hrig, roll, 'Portmanteau', (0, sy + .36, sz + .07), (0, sy + .36, sz + .3), 'Horse:Back')
    tack = [shab, saddle, roll]
    ebs = K.edit(hrig)     # the seat frame the rider is posed from (no skin)
    K.add_bone(ebs, 'Saddle', (0, sy, sz), (0, sy - .3, sz), 'Horse:Back', deform=False)
    K.obj_mode()
    # reins: a thin strap each side from the bit to the rider's left hand; one end skinned to the horse's
    # head, the other to the hand, so they stretch between the two whatever the pose
    gi = {g.name: g.index for g in hmesh.vertex_groups}
    hv = [v.co for v in hmesh.data.vertices if any(g.group in (gi['Horse:Head'], gi['Horse:Muzzle']) and g.weight > .5 for g in v.groups)]
    front = min(v.y for v in hv)
    nose = [v for v in hv if v.y < front + .12]
    bit_z = min(v.z for v in nose) + .07; bit_y = front + .10
    hand = r.data.bones['Rider:mixamorig:LeftHand'].head_local.copy()
    rein_m = K.flat_material('Reins', (.10, .07, .05))
    reins = []
    for sx in (-1, 1):
        bit = Vector((sx * .05, bit_y, bit_z))
        o = K.make_prop('Rein', [('cyl', bit, hand, .011, .011, 4)], rein_m)
        hv_ids = [i for i, v in enumerate(o.data.vertices) if (v.co - bit).length < .02]
        hd_ids = [i for i, v in enumerate(o.data.vertices) if (v.co - hand).length < .02]
        o.vertex_groups.new(name='Horse:Head').add(hv_ids, 1.0, 'REPLACE')
        o.vertex_groups.new(name='Rider:mixamorig:LeftHand').add(hd_ids, 1.0, 'REPLACE')
        o.parent = hrig; mod = o.modifiers.new('Armature', 'ARMATURE'); mod.object = hrig
        reins.append(o)
    rig, mesh = join(hrig, [r], [hmesh, m, sabre, pistol, holster] + tack + reins, 'Cavalry')
    info = dict(horse=hp | dict(profile=None), rider=dp, seat=list(seat), sabre=dict(length=1.055, grip=0.0), bit=[0, bit_y, bit_z],
                pistol=json.loads((K.ROOT / 'pistol-prep.json').read_text()), holster=dict(mouth=list(hmouth), axis=list(haxis), length=.25))
    (K.ROOT / 'cavalry-combined.json').write_text(json.dumps(info, indent=1))
    K.save(K.ROOT / 'cavalry-combined.blend')
    print('COMBINED cavalry', len(rig.data.bones), 'bones', sum(len(p.vertices) - 2 for p in mesh.data.polygons), 'triangles')
