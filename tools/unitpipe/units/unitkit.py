"""Shared helpers for the unit pipeline (prep, combine, animate, preview). Blender 5.2.

Conventions, after prep: 1 Blender unit = 1 m, +Z up, every model faces -Y (its front), ground at z = 0.
"""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler

CODE = Path(__file__).resolve().parent
sys.path.insert(0, str(CODE.parent))
import paths
ROOT = paths.work('units')       # work files: output/unitpipe/units (paths.py)
ARMY = 'french-army'             # the sources: assets/tripo/<army>/<model>/


def src(name):
    return paths.source(ARMY, name)
FPS = 24


def args():
    import sys
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def import_fbx(name):
    """Import the untouched Tripo FBX of assets/tripo/<army>/<name>/ and return (rig, mesh)."""
    path = next(src(name).glob('*.fbx'))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    rig = next((o for o in new if o.type == 'ARMATURE'), None)    # a prop (the pistol) has none
    mesh = next(o for o in new if o.type == 'MESH')
    # textures: point every image at the .fbm folder next to the FBX and pack it
    for im in bpy.data.images:
        if im.source == 'FILE' and not im.packed_file:
            cand = list(src(name).rglob(Path(im.filepath).name)) or list(src(name).rglob('*.jpg'))
            if cand:
                im.filepath = str(cand[0]); im.reload(); im.pack()
    # one UV layer name for every model, so joined meshes share a single layer
    for uv in mesh.data.uv_layers[1:]:
        mesh.data.uv_layers.remove(uv)
    mesh.data.uv_layers[0].name = 'UVMap'
    for mat in mesh.data.materials:
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    n.inputs['Roughness'].default_value = .8
                    n.inputs['Metallic'].default_value = 0
    return rig, mesh


def rescale(rig, mesh, factor, yaw=0.0):
    """Scale (and turn about Z) the rig and its mesh, then apply, so rest data is in metres."""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    rig.scale = (factor,) * 3
    rig.rotation_euler = (0, 0, yaw)
    bpy.context.view_layer.update()
    for o in (rig, mesh):
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for o in (rig, mesh):
        o.select_set(False)
    bpy.context.view_layer.update()


def components(mesh):
    """Loose parts: list of dicts (ids, count, min, max, center), largest first."""
    adj = [[] for _ in mesh.data.vertices]
    for e in mesh.data.edges:
        a, b = e.vertices; adj[a].append(b); adj[b].append(a)
    seen = set(); comps = []
    for i in range(len(adj)):
        if i in seen:
            continue
        todo = [i]; seen.add(i); ids = []
        while todo:
            j = todo.pop(); ids.append(j)
            for k in adj[j]:
                if k not in seen:
                    seen.add(k); todo.append(k)
        co = [mesh.data.vertices[j].co for j in ids]
        lo = Vector([min(c[k] for c in co) for k in range(3)])
        hi = Vector([max(c[k] for c in co) for k in range(3)])
        comps.append(dict(ids=ids, count=len(ids), min=lo, max=hi, center=(lo + hi) / 2))
    comps.sort(key=lambda c: -c['count'])
    return comps


def rigid(mesh, ids, group):
    """Weight these vertices fully to one bone (removing every other influence)."""
    for vg in mesh.vertex_groups:
        vg.remove(ids)
    vg = mesh.vertex_groups.get(group) or mesh.vertex_groups.new(name=group)
    vg.add(ids, 1.0, 'REPLACE')


def edit(rig):
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.selected_objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    return rig.data.edit_bones


def obj_mode():
    bpy.ops.object.mode_set(mode='OBJECT')


def add_bone(ebs, name, head, tail, parent=None, deform=True, roll=0.0):
    b = ebs.new(name)
    b.head = Vector(head); b.tail = Vector(tail); b.roll = roll
    b.use_deform = deform
    if parent:
        b.parent = ebs[parent] if isinstance(parent, str) else parent
    return b


def mesh_bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return (Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)]))


def make_prop(name, parts, material):
    """A mesh built from (kind, params) parts: ('cyl', p0, p1, r0, r1, sides) or ('box', center, size)."""
    bm = bmesh.new()
    for part in parts:
        if part[0] == 'cyl':
            _, p0, p1, r0, r1, n = part
            p0 = Vector(p0); p1 = Vector(p1); axis = p1 - p0
            q = Vector((0, 0, 1)).rotation_difference(axis.normalized())
            ring0 = []; ring1 = []
            for i in range(n):
                a = 2 * math.pi * i / n
                d = q @ Vector((math.cos(a), math.sin(a), 0))
                ring0.append(bm.verts.new(p0 + d * r0)); ring1.append(bm.verts.new(p1 + d * r1))
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
            bm.faces.new(list(reversed(ring0))); bm.faces.new(ring1)
        elif part[0] == 'box':
            _, c, s = part
            r = bmesh.ops.create_cube(bm, size=1.0)
            for v in r['verts']:
                v.co = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2])) + Vector(c)
        elif part[0] == 'blade':
            # a flat, slightly tapering straight blade from p0 (hilt) to p1 (tip), width w, thickness t
            _, p0, p1, w, t = part
            p0 = Vector(p0); p1 = Vector(p1)
            ax = (p1 - p0); L = ax.length; ax.normalize()
            side = Vector((1, 0, 0)) if abs(ax.x) < .9 else Vector((0, 1, 0))
            side = (side - ax * side.dot(ax)).normalized(); thick = ax.cross(side)
            pts = []
            for k, (u, ww) in enumerate([(0, w), (.85, w * .8), (1, 0.0005)]):
                c = p0 + ax * L * u
                pts.append([bm.verts.new(c + side * ww / 2), bm.verts.new(c + thick * t / 2),
                            bm.verts.new(c - side * ww / 2), bm.verts.new(c - thick * t / 2)])
            for a, b in zip(pts, pts[1:]):
                for i in range(4):
                    j = (i + 1) % 4
                    bm.faces.new((a[i], a[j], b[j], b[i]))
            bm.faces.new(list(reversed(pts[0])))
    me = bpy.data.meshes.new(name)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def flat_material(name, rgb, emission=None, metallic=0.0, rough=.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 6.0
    m.diffuse_color = (*rgb, 1)
    return m


def save(path):
    bpy.ops.wm.save_as_mainfile(filepath=str(path))


# ---------------------------------------------------------------- posing

class Poser:
    """Places pose bones by world (armature-space) head/tail, with analytic two-bone IK.

    Every function works in armature space (the rig object sits at the origin, unrotated)."""

    def __init__(self, rig):
        self.rig = rig
        self.pb = rig.pose.bones
        for p in self.pb:
            p.rotation_mode = 'QUATERNION'
        self.rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
        self.length = {b.name: b.length for b in rig.data.bones}

    def reset(self):
        for p in self.pb:
            p.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()

    def update(self):
        bpy.context.view_layer.update()

    def set(self, name, mat):
        self.pb[name].matrix = mat
        bpy.context.view_layer.update()

    def place(self, name, head, tail, twist_ref=None):
        """Bone from head towards tail (keeps rest length): swing-only rotation from the rest direction,
        unless twist_ref (a world vector) is given: then the bone's rest Z axis is turned towards it."""
        b = self.rig.data.bones[name]
        head = Vector(head); d = (Vector(tail) - head).normalized()
        r = self.rest[name].to_3x3()
        q = r.col[1].normalized().rotation_difference(d)
        m = q.to_matrix() @ r
        if twist_ref is not None:
            z = m.col[2]; t = Vector(twist_ref) - d * Vector(twist_ref).dot(d)
            if t.length > 1e-6:
                ang = z.normalized().angle(t.normalized())
                sgn = 1 if z.cross(t).dot(d) > 0 else -1
                m = Quaternion(d, sgn * ang).to_matrix() @ m
        self.set(name, Matrix.Translation(head) @ m.to_4x4())

    def orient(self, name, head, rot3):
        """Bone at head with a world rotation relative to its rest orientation (rot3 @ rest)."""
        self.set(name, Matrix.Translation(Vector(head)) @ (rot3 @ self.rest[name].to_3x3()).to_4x4())

    def head(self, name):
        return self.pb[name].head.copy()

    def tail(self, name):
        return self.pb[name].tail.copy()

    def two_bone(self, upper, lower, target, pole, end=None):
        """Upper and lower bones from upper's current head to target, the middle joint towards pole.
        Returns the reached end (clamped to 99.9% reach)."""
        start = self.head(upper)
        l1 = self.length[upper]; l2 = self.length[lower]
        target = Vector(target); d = target - start
        dist = min(d.length, (l1 + l2) * .999); dist = max(dist, abs(l1 - l2) * 1.001)
        d.normalize(); end = start + d * dist
        plane = Vector(pole) - start; plane -= d * plane.dot(d)
        plane = plane.normalized() if plane.length > 1e-8 else Vector((0, 0, 1))
        along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
        mid = start + d * along + plane * math.sqrt(max(0, l1 * l1 - along * along))
        self.place(upper, start, mid)
        self.place(lower, mid, end)
        return end

    def key_all(self, frame, names=None):
        for p in self.pb:
            if names is None or p.name in names:
                p.keyframe_insert('location', frame=frame, group=p.name)
                p.keyframe_insert('rotation_quaternion', frame=frame, group=p.name)
                p.keyframe_insert('scale', frame=frame, group=p.name)


def new_action(rig, name):
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    return act


def finish_action(rig, act, frames, linear=True):
    """Make every key linear (the poses are solved per frame) and store the range."""
    try:
        curves = act.fcurves
    except AttributeError:   # slotted actions (Blender 4.4+)
        curves = [fc for layer in act.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR' if linear else 'BEZIER'
    act.frame_range = (1, frames)
    act.use_frame_range = True


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    return a + (b - a) * t


def keyed(keys, f, ease=smooth):
    """keys: [(frame, value), ...] with numbers, Vectors or Quaternions; eased interpolation at frame f."""
    if f <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1:
            t = ease((f - f0) / (f1 - f0)) if f1 > f0 else 1
            if isinstance(v0, Quaternion):
                return v0.slerp(v1, t)
            return v0 + (v1 - v0) * t if not isinstance(v0, (int, float)) else lerp(v0, v1, t)
    return keys[-1][1]


def clean_weights(rig, mesh, max_dist, keep=()):
    """Drop skin influences from bones far from the vertex (Tripo's auto-weights leak, e.g. a thumb
    weighted to a toe): an influence goes if its bone is farther than max_dist and more than 2.5 times
    farther than the vertex's nearest influencing bone. The nearest one always stays. Renormalises.
    Returns the number of influences removed."""
    segs = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}
    names = {g.index: g.name for g in mesh.vertex_groups}
    def dist(p, n):
        a, b = segs[n]; ab = b - a
        t = 0 if ab.length < 1e-9 else max(0, min(1, (p - a).dot(ab) / ab.dot(ab)))
        return (p - (a + ab * t)).length
    drops = {}
    for v in mesh.data.vertices:
        inf = [(dist(v.co, names[g.group]), g.group) for g in v.groups if g.weight > 0 and names[g.group] in segs]
        if len(inf) < 2:
            continue
        near = min(d for d, _ in inf)
        for d, gi in inf:
            if d > max_dist and d > 2.5 * near and names[gi] not in keep:
                drops.setdefault(gi, []).append(v.index)
    removed = 0
    for gi, ids in drops.items():
        mesh.vertex_groups[gi].remove(ids); removed += len(ids)
    for v in mesh.data.vertices:
        tot = sum(g.weight for g in v.groups)
        if tot > 1e-6 and abs(tot - 1) > 1e-4:
            for g in v.groups:
                g.weight /= tot
    return removed


ARM_CHAIN = ('Shoulder', 'Arm', 'ForeArm', 'Hand')


def free_coat_from_arms(mesh, z_lo, z_hi, prefix='mixamorig:'):
    """Coat skirts weighted to the arms swing out when the arms move: for vertices between z_lo and
    z_hi that are not mainly arm (arm-chain weight under 0.9), drop the arm influences. Returns the count."""
    names = {g.index: g.name for g in mesh.vertex_groups}
    is_arm = {i: any(n.startswith(prefix + s + k) for s in ('Left', 'Right') for k in ARM_CHAIN) for i, n in names.items()}
    drops = {}
    count = 0
    for v in mesh.data.vertices:
        if not (z_lo < v.co.z < z_hi):
            continue
        arm = sum(g.weight for g in v.groups if is_arm[g.group])
        rest = sum(g.weight for g in v.groups if not is_arm[g.group])
        if 0 < arm < .9 and rest > 0:
            count += 1
            for g in v.groups:
                if is_arm[g.group]:
                    drops.setdefault(g.group, []).append(v.index)
    for gi, ids in drops.items():
        mesh.vertex_groups[gi].remove(ids)
    for v in mesh.data.vertices:
        tot = sum(g.weight for g in v.groups)
        if tot > 1e-6 and abs(tot - 1) > 1e-4:
            for g in v.groups:
                g.weight /= tot
    return count
