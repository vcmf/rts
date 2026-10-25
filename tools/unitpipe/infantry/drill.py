"""Firing drill and bayonet fighting, authored as key poses.

Each clip is a list of keys. Every frame blends the two surrounding keys' parameters (body, feet,
head numbers; weapon and hand targets resolved in world space) and re-solves legs, arms and
weapon with the shared IK from build.py, so hands stay locked to the musket or the ramrod while
either moves. A key at an exact frame is solved on its own, so clips that share a key pose join
exactly.

Coordinates: -Y forward, -X the soldier's right, +Z up, model about 1 unit tall.
Gun-local (rest) axes: barrel toward +Z, sights toward -X, lock on the -Y side, stock below (+X).
"""
import bpy, bmesh, math, json, os, sys, importlib
from types import SimpleNamespace
from mathutils import Vector as V, Matrix, Quaternion

DEBUG = os.environ.get('DRILL_DEBUG') == '1'   # clamp unreachable grips and report instead of failing
# clip modules authored with the toolkit T (see the end of author()); each is a file next to this one
MODULES = [m for m in os.environ.get('CLIP_MODULES', 'kneel,moves,falls,morale').split(',')
           if m and os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), m + '.py'))]
ROD_LEN = .40          # model units; shorter than a real rod so two draw strokes fit the arm
G = {}                 # weapon geometry, filled by setup()
CONTACT = {'Left': V((-.012, -.012, -.025)), 'Right': V((.010, -.025, -.008))}   # as build.py grip_hand


def Q(axis, angle): return Quaternion(V(axis), angle)
def M4(q): return q.to_matrix().to_4x4()
def smooth(x): x = max(0., min(1., x)); return x * x * (3 - 2 * x)


def barrel_point(A, z):
    f, m = V(A['ForeGrip']), V(A['BarrelMuzzle'])
    return f.lerp(m, (z - f.z) / (m.z - f.z))


# ---------------------------------------------------------------- ramrod

def setup(k):
    """Add the ramrod: a thin rod under the barrel, skinned to a Ramrod bone parented to Musket."""
    A, rig, mesh = k.ANCHORS, k.rig, k.mesh
    axis = (V(A['BarrelMuzzle']) - V(A['ForeGrip'])).normalized()
    down = V((1, 0, 0)); down -= axis * down.dot(axis); down.normalize()   # stock side, away from the sights
    side = axis.cross(down)
    pipe_top = barrel_point(A, .755) + down * .011
    G.update(axis=axis, down=down, side=side, pipe_top=pipe_top, muzzle=barrel_point(A, .772),
             pan=V((-.100, -.158, .238)), grip=V(k.grip))
    # Steel colour: average UV of the bayonet blade (the thin part above the muzzle).
    blade = next(c for c in k.components if c['min'][2] > .77 and c['max'][1] < -.1)
    ids = set(blade['ids']); uvl = mesh.data.uv_layers.active
    uvs = [uvl.data[l.index].uv.copy() for l in mesh.data.loops if l.vertex_index in ids]
    uv = sum(uvs, V((0, 0))) / len(uvs)
    bm = bmesh.new(); rings = []
    for d, r in [(0, .0042), (.012, .0042), (.016, .0028), (ROD_LEN, .0028)]:
        rings.append([bm.verts.new(pipe_top - axis * d + (down * math.cos(a) + side * math.sin(a)) * r)
                      for a in [i * math.pi / 3 for i in range(6)]])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(6): bm.faces.new([r0[i], r1[i], r1[(i + 1) % 6], r0[(i + 1) % 6]])
    bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    layer = bm.loops.layers.uv.new(uvl.name)
    for f in bm.faces:
        for l in f.loops: l[layer].uv = uv
    me = bpy.data.meshes.new('Ramrod'); bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new('Ramrod', me); bpy.context.scene.collection.objects.link(obj)
    n = len(mesh.data.vertices)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh; bpy.ops.object.join()
    vg = mesh.vertex_groups.new(name='Ramrod'); vg.add(list(range(n, len(mesh.data.vertices))), 1.0, 'REPLACE')
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones.new('Ramrod'); eb.head = pipe_top; eb.tail = pipe_top - axis * .05
    eb.parent = rig.data.edit_bones['Musket']; eb.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    G['rod_rest'] = rig.data.bones['Ramrod'].matrix_local.copy()
    G['rod_verts'] = list(range(n, len(mesh.data.vertices)))
    print('RAMROD', len(G['rod_verts']), 'vertices,', len(me.polygons) if me.name in bpy.data.meshes else 'joined', 'length', ROD_LEN)


# ---------------------------------------------------------------- keys

def key(**kw):
    """A key pose. hips=(offset, yaw, lean, roll); chest=(yaw, lean, roll); feet={side: (pos, yaw, pitch)};
    gun=(space, pivot, target, fwd, lock) with space chest|world|mix (mix: target in chest, aim in world)
    or ('q', pivot, target, quaternion); hands={side: (kind, where, palm, pole, space)} with kind
    gun|rod|free|relaxed|hang (where = swing angle of a hanging free arm); head=(yaw, pitch, roll) in world; curl=left finger curl; rod=(mode, ...)."""
    base = dict(hips=(V((0, 0, 0)), 0, 0, 0), chest=(0, 0, 0), head=(0, 0, 0), curl=1, rod=('pipe', 0), shrug=0, root=0)
    base.update(kw); return base


def alter(k, **kw):
    out = dict(k); out.update(kw)
    for name in ('hands', 'feet'):
        if name in kw: out[name] = {**k[name], **kw[name]}
    return out


def author(k):
    A = k.ANCHORS; rig = k.rig; bone = k.bone
    grip0 = G['grip']; axis = G['axis']
    name_now = ['']
    contacts = {}          # clip -> frame -> side -> ('gun', local point) | ('rod', u)

    def local(where):
        return V(A[where]) if isinstance(where, str) else V(where)

    def frame_q(fwd, lock):
        z1 = axis; y1 = V((0, -1, 0)); y1 -= z1 * y1.dot(z1); y1.normalize(); x1 = y1.cross(z1)
        z2 = V(fwd).normalized(); y2 = V(lock); y2 -= z2 * y2.dot(z2); y2.normalize(); x2 = y2.cross(z2)
        L = Matrix((x1, y1, z1)).transposed(); W = Matrix((x2, y2, z2)).transposed()
        return (W @ L.transposed()).to_quaternion()

    def chest_delta():
        c = bone('Spine2'); return c.matrix @ c.bone.matrix_local.inverted()

    # -- body
    def apply_body(P, feet_lift=None):
        k.reset()
        off, yaw, lean, roll = P['hips']
        hips = bone('Hips')
        hips.matrix = Matrix.Translation(hips.bone.head_local + off) @ M4(Q((0, 0, 1), yaw) @ Q((1, 0, 0), lean) @ Q((0, 1, 0), roll)) @ hips.bone.matrix_local.to_3x3().to_4x4()
        cy, cl, cr = P['chest']
        if cy or cl or cr:
            part = Quaternion().slerp(Q((0, 0, 1), cy) @ Q((1, 0, 0), cl) @ Q((0, 1, 0), cr), 1 / 3)
            for n in ('Spine', 'Spine1', 'Spine2'):
                p = bone(n); rq = p.bone.matrix_local.to_quaternion()
                p.rotation_quaternion = rq.inverted() @ part @ rq
        if P['shrug']:   # lift the right shoulder girdle for high reaches
            p = bone('RightShoulder'); rq = p.bone.matrix_local.to_quaternion()
            p.rotation_quaternion = rq.inverted() @ Q((0, 1, 0), P['shrug']) @ rq
        bpy.context.view_layer.update()
        for side, (pos, fyaw, pitch, *kp) in P['feet'].items():
            k.foot_ik(side, pos, fyaw, pitch, kp[0] if kp and kp[0] is not None else None)

    def knee_pole(pos, fyaw):   # default: the knee points the way the foot points
        return V((pos.x, 0, .3)) + Q((0, 0, 1), fyaw) @ V((0, -1, 0))

    # -- weapon
    def resolve_gun(spec, D):
        if spec[0] == 'q':
            _, pivot, target, q = spec; pw = V(target)
        else:
            space, pivot, target, fwd, lock = spec
            dq = D.to_quaternion()
            pw = D @ V(target) if space in ('chest', 'mix') else V(target)
            q = frame_q(fwd, lock)
            if space == 'chest': q = dq @ q
        return pw - q @ (local(pivot) - grip0), q

    def gun_point(gun, p):
        o, q = gun; return o + q @ (V(p) - grip0)

    def rod_state(spec, gun):
        """World (H, rotation) of the rod for pipe/bore modes; H is the head end."""
        o, q = gun; mode = spec[0]
        if mode == 'pipe': return gun_point(gun, G['pipe_top'] + axis * spec[1]), q
        if mode == 'bore': return gun_point(gun, G['muzzle'] - axis * spec[1]), q @ Q(G['down'], math.pi)
        raise ValueError(spec)

    def rod_grip(rod, u):
        H, rq = rod; return H + (rq @ -axis) * u

    def pose_rod(H, rq):
        p = rig.pose.bones['Ramrod']
        p.matrix = Matrix.Translation(H) @ M4(rq) @ G['rod_rest'].to_3x3().to_4x4()
        bpy.context.view_layer.update()

    # -- hands
    def hand_contact(side):
        hb = bone(side + 'Hand')
        return hb.matrix @ hb.bone.matrix_local.inverted() @ (hb.bone.head_local + CONTACT[side])

    def palm_of(side):
        hb = bone(side + 'Hand'); src = V((-1, 0, 0) if side == 'Left' else (1, 0, 0))
        return (hb.matrix.to_quaternion() @ hb.bone.matrix_local.to_quaternion().inverted()) @ src

    def reachable(side, point, margin=.035):
        """Pull a free target in to the arm's reach (grips are never clamped: they must be exact)."""
        sh = bone(side + 'Arm').head
        L = bone(side + 'Arm').bone.length + bone(side + 'ForeArm').bone.length - margin - .001
        d = point - sh
        return sh + d.normalized() * L if d.length > L else point

    def resolve_hand(side, spec, gun, rod, D):
        kind, where, palm, pole, space = spec
        dq = D.to_quaternion()
        pa = V(palm) if space == 'world' else dq @ V(palm)
        po = V(pole) if space == 'world' else D @ V(pole)
        if kind in ('gun', 'gunpt'): target = gun_point(gun, local(where))
        elif kind == 'rod': target = rod_grip(rod, where)
        elif kind == 'free': target = V(where) if space == 'world' else D @ V(where)
        elif kind == 'hang':   # a hanging free arm: solve it to read where the hand's contact point is
            po = k.hang_target(side, where)[1]
            k.hang_arm(side, where)
            target, pa = hand_contact(side), palm_of(side)
        elif kind == 'relaxed':   # solve to read where the relaxed hand puts its contact point
            k.limb(side, 'arm', bone(side + 'Arm').head, reachable(side, V(where), 0), po); k.relaxed_hand(side)
            target, pa = hand_contact(side), palm_of(side)
        return target, pa.normalized(), po

    def curl(amount, side='Left'):
        for digit in ('Index', 'Middle', 'Ring', 'Pinky'):
            for seg in (1, 2, 3):
                p = bone(side + 'Hand' + digit + str(seg))
                # left: about world Y in the rest pose; right (modelled gripping): about the bone's own Z, - opens
                fa = p.bone.matrix_local.to_quaternion().inverted() @ V((0, 1, 0)) if side == 'Left' else V((0, 0, 1))
                p.rotation_quaternion = Q(fa, (.95 if seg < 3 else .65) * amount)

    def pose_head(P):
        hy, hp, hr = P['head']; hips = P['hips']; cy, cl, cr = P['chest']
        chest = Q((0, 0, 1), hips[1]) @ Q((1, 0, 0), hips[2]) @ Q((0, 1, 0), hips[3]) @ Q((0, 0, 1), cy) @ Q((1, 0, 0), cl) @ Q((0, 1, 0), cr)
        headq = Q((0, 0, 1), hy) @ Q((1, 0, 0), hp) @ Q((0, 1, 0), hr)
        neck = bone('Neck')
        neck.matrix = Matrix.Translation(neck.head) @ M4(chest.slerp(headq, .5)) @ neck.bone.matrix_local.to_3x3().to_4x4()
        bpy.context.view_layer.update()
        head = bone('Head')
        head.matrix = Matrix.Translation(neck.tail) @ M4(headq) @ head.bone.matrix_local.to_3x3().to_4x4()
        head.location = (0, 0, 0)
        bpy.context.view_layer.update()

    # -- one frame
    def lerp(a, b, t): return a + (b - a) * t

    def blend_numbers(A_, B_, t, opts, traw):
        P = {}
        P['hips'] = tuple(lerp(a, b, t) for a, b in zip(A_['hips'], B_['hips']))
        P['chest'] = tuple(lerp(a, b, t) for a, b in zip(A_['chest'], B_['chest']))
        P['head'] = tuple(lerp(a, b, t) for a, b in zip(A_['head'], B_['head']))
        P['curl'] = lerp(A_['curl'], B_['curl'], t)
        P['curl_right'] = lerp(A_.get('curl_right', 0), B_.get('curl_right', 0), t)   # 0: the modelled right hand
        P['shrug'] = lerp(A_['shrug'], B_['shrug'], t)
        P['root'] = lerp(A_.get('root', 0), B_.get('root', 0), t)
        P['feet'] = {}
        for side in A_['feet']:
            (pa, ya, fa, *ka), (pb, yb, fb, *kb) = A_['feet'][side], B_['feet'][side]
            w0, w1 = opts.get('feet', {}).get(side, (0, 1))
            s = smooth((traw - w0) / (w1 - w0)) if w1 > w0 else float(traw >= w0)
            pos = V(pa).lerp(V(pb), s)
            if (V(pa) - V(pb)).length > .01: pos.z += opts.get('lift', .035) * math.sin(math.pi * s)
            foot = (pos, lerp(ya, yb, s), lerp(fa, fb, s) + opts.get('toe', 0) * math.sin(math.pi * s))
            if ka or kb:   # blend knee poles (a missing one is the default for its foot)
                qa = V(ka[0]) if ka and ka[0] is not None else knee_pole(V(pa), ya)
                qb = V(kb[0]) if kb and kb[0] is not None else knee_pole(V(pb), yb)
                foot += (qa.lerp(qb, s),)
            P['feet'][side] = foot
        return P

    def solve(A_, B_=None, t=0., traw=0., opts={}, extra=None, f=0):
        exact = B_ is None
        P = A_ if exact else blend_numbers(A_, B_, t, opts, traw)
        if extra: P = extra(f, dict(P))
        apply_body(P)
        D = chest_delta()
        ga = resolve_gun(A_['gun'], D)
        if exact: gun = ga
        else:
            gb = resolve_gun(B_['gun'], D); piv = local(opts.get('pivot', 'TriggerGrip'))
            pa, pb = gun_point(ga, piv), gun_point(gb, piv)
            arc = D.to_quaternion() @ V(opts.get('arc', (0, 0, 0))) * math.sin(math.pi * t)
            q = ga[1].slerp(gb[1], t); gun = (pa.lerp(pb, t) + arc - q @ (piv - grip0), q)
        if extra and 'gun_post' in P: gun = P['gun_post'](gun)
        k.gun_pose(gun[0], gun[1])
        # rod in the pipes or the bore (hands may hold it); 'air' rods follow the hand afterwards
        ra, rb = A_['rod'], (A_ if exact else B_)['rod']
        air = 'air' in (ra[0], rb[0])
        rod = None
        if not air:
            assert ra[0] == rb[0], ('rod mode change without an air phase', ra, rb)
            rod = rod_state((ra[0], lerp(ra[1], rb[1], t)), gun)
            if not (ra == rb == ('pipe', 0)): pose_rod(*rod)
        else:
            rod = rod_state(rb if ra[0] == 'air' and rb[0] != 'air' else ra if ra[0] != 'air' else ('pipe', 0), gun)
        record = {}
        for side in ('Left', 'Right'):
            sa = A_['hands'][side]; sb = sa if exact else B_['hands'][side]
            if exact and sa[0] == 'relaxed':
                k.limb(side, 'arm', bone(side + 'Arm').head, V(sa[1]), V(sa[3])); k.relaxed_hand(side); continue
            if sa[0] == 'hang' and sb[0] == 'hang':   # pose the hanging arm directly (a grip solve bends it)
                k.hang_arm(side, sa[1] if exact else lerp(sa[1], sb[1], t)); continue
            if sa[0] == 'rod' or sb[0] == 'rod':
                u = lerp(sa[1], sb[1], t) if sa[0] == sb[0] == 'rod' else None
            ta, pa_, poa = resolve_hand(side, sa, gun, rod, D)
            if exact: target, palm, pole = ta, pa_, poa
            else:
                tb, pb_, pob = resolve_hand(side, sb, gun, rod, D)
                if sa[0] == sb[0] == 'gun':
                    target = gun_point(gun, local(sa[1]).lerp(local(sb[1]), t))
                elif sa[0] == sb[0] == 'rod' and not air:
                    target = rod_grip(rod, lerp(sa[1], sb[1], t))
                else: target = ta.lerp(tb, t)
                harc = opts.get('hand_arc', {}).get(side)
                if harc: target = target + D.to_quaternion() @ V(harc) * math.sin(math.pi * t)
                palm = pa_.lerp(pb_, t).normalized(); pole = poa.lerp(pob, t)
            if side not in contact_kind(sa, sb, air): target = reachable(side, target)
            if os.environ.get('DRILL_TRACE') == name_now[0]:   # authoring: shoulder, target, target in gun frame
                gl = gun[1].inverted() @ (target - gun[0]) + grip0
                print('TRACE', name_now[0], f, side, *[round(c, 4) for c in bone(side + 'Arm').head], *[round(c, 4) for c in target], *[round(c, 4) for c in gl])
            try: k.grip_hand(side, target, palm, pole)
            except AssertionError:
                if not DEBUG: raise
                clamped = reachable(side, target, .03)
                print('SHORT', name_now[0], f, side, round((clamped - target).length, 4))
                if os.environ.get('DRILL_DEBUG_POS') == '1':   # shoulder, world target, target in gun frame
                    gl = gun[1].inverted() @ (target - gun[0]) + grip0
                    print('SHORTPOS', name_now[0], f, side, *[round(c, 4) for c in bone(side + 'Arm').head], *[round(c, 4) for c in target], *[round(c, 4) for c in gl])
                k.grip_hand(side, clamped, palm, pole)
            regrip = not exact and side in opts.get('hand_arc', {})
            if regrip: pass
            elif sa[0] == sb[0] == 'gun': record[side] = ('gun', list(local(sa[1]).lerp(local(sb[1]), t)))
            elif sa[0] == sb[0] == 'rod' and not air: record[side] = ('rod', lerp(sa[1], sb[1], t))
        if air:   # the rod rides in the right hand; only an air-to-air segment turns it
            if ra[0] == rb[0] == 'air': angle, u = lerp(ra[1], rb[1], t), lerp(ra[2], rb[2], t)
            else:
                airk, other = (ra, rb) if ra[0] == 'air' else (rb, ra)
                base = 0 if other[0] == 'pipe' else math.pi
                eq = base + 2 * math.pi * round((airk[1] - base) / (2 * math.pi))
                angle = lerp(airk[1], eq, t) if airk is ra else lerp(eq, airk[1], t); u = airk[2]
            rq = gun[1] @ Q(G['down'], angle)
            g = hand_contact('Right'); H = g - (rq @ -axis) * u
            pose_rod(H, rq); record['Right'] = ('rod', u)
        curl(P['curl'])
        if P.get('curl_right'): curl(P['curl_right'], 'Right')
        pose_head(P)
        if P.get('root'): turn_root(P['root'])
        return record

    DEPTH = sorted(rig.pose.bones, key=lambda p: len(p.parent_recursive))
    def turn_root(angle):
        """Turn the solved pose about the vertical through the origin. The pose is solved facing -Y and
        then turned whole, so a turned key is exactly the unturned pose rotated (re-solving rotated
        targets is not: the IK's shortest-arc bone rotations are not rotation-invariant)."""
        R = Matrix.Rotation(angle, 4, 'Z'); M = {p.name: p.matrix.copy() for p in rig.pose.bones}
        depth = None
        for p in DEPTH:
            d = len(p.parent_recursive)
            if d != depth: bpy.context.view_layer.update(); depth = d
            p.matrix = R @ M[p.name]
        bpy.context.view_layer.update()

    def contact_kind(sa, sb, air):
        return ('Left', 'Right') if sa[0] == sb[0] and sa[0] in ('gun',) or (sa[0] == sb[0] == 'rod' and not air) else ()

    EASE = {'smooth': smooth, 'linear': lambda x: x, 'in': lambda x: x * x, 'out': lambda x: 1 - (1 - x) ** 2,
            'snap': lambda x: 1 - (1 - x) ** 3, 'slowin': lambda x: x ** 3}

    def clip(name, keys, extra=None):
        """keys: [(frame, key, opts)] where opts shape the segment that ENDS at that key."""
        contacts[name] = {}; name_now[0] = name
        frames = keys[-1][0]

        def fn(f):
            for (f0, a, _), (f1, b, opts) in zip(keys, keys[1:]):
                if f0 <= f <= f1: break
            if f == f0 or f0 == f1: rec = solve(a, extra=extra, f=f)
            elif f == f1: rec = solve(b, extra=extra, f=f)
            else:
                traw = (f - f0) / (f1 - f0); t = EASE[opts.get('ease', 'smooth')](traw)
                rec = solve(a, b, t, traw, opts, extra, f)
            contacts[name][f] = rec
        return k.action(name, frames, fn)

    # ============================================================ poses
    carry_yaw = .075
    CARRY = key(
        hips=(V((0, 0, -.012)), carry_yaw, 0, 0),
        head=(carry_yaw, 0, 0),
        feet={'Left': (V((.085, k.WALK_HALF, .069)), 0, 0), 'Right': (V((-.065, -k.WALK_HALF, .069)), 0, 0)},   # = Walking frame 1
        gun=('q', 'CarryGrip', Q((0, 0, 1), carry_yaw) @ V((.155, -.075, .523)),
             Q((0, 0, 1), carry_yaw) @ Q((1, 0, 0), -.28) @ Q((0, 1, 0), -.05)),
        hands={'Left': ('gun', 'CarryGrip', (-1, 0, .12), (.105, .18, .56), 'world'),
               'Right': ('hang', k.ARM_SWING, (1, 0, 0), (0, 0, 0), 'world')})   # = Walking frame 1

    # Firing stance: half-right, left foot toward the target, right foot back and turned out.
    STANCE = {'Left': (V((.060, -.070, .069)), -.20, 0), 'Right': (V((-.090, .095, .069)), -1.15, 0)}
    READY = key(
        hips=(V((0, .010, -.022)), -.42, .03, 0), chest=(-.10, .03, 0), head=(-.10, .02, 0), feet=STANCE,
        gun=('chest', 'TriggerGrip', (-.045, -.150, .540), (.10, -.10, 1), (-.45, -1, 0)),
        hands={'Right': ('gun', 'TriggerGrip', (.6, .2, 0), (-.26, .05, .52), 'chest'),
               'Left': ('gun', 'ForeGrip', (-.6, .5, 0), (.20, -.05, .52), 'chest')})
    PRESENT = key(
        hips=(V((0, -.005, -.030)), -.52, .06, 0), chest=(-.24, .10, -.04), head=(.02, .30, -.30), feet=STANCE,
        gun=('mix', 'StockContact', (-.072, -.030, .728), (0, -1, -.035), (-1, 0, .30)),
        hands={'Right': ('gun', 'TriggerGrip', (1, 0, 0), (-.34, .02, .76), 'world'),
               # support hand under the left side of the forestock, fingers over the top: the stock is
               # deeper than the small fist, so a grip on the barrel line put the wood through the wrist
               'Left': ('gun', (-.080, -.120, .290), (-1, 0, .6), (.25, -.05, .50), 'world')})
    LOAD = key(
        hips=(V((0, .005, -.025)), -.42, .06, 0), chest=(-.10, .10, 0), head=(-.15, .28, 0), feet=STANCE,
        gun=('chest', 'TriggerGrip', (-.090, -.110, .470), (.30, -.55, .78), (-.75, 0, .65)),
        hands={'Right': ('free', (-.115, -.150, .505), (0, 0, -1), (-.30, .05, .50), 'chest'),
               'Left': ('gun', (-.118, -.131, .450), (-.2, .3, .9), (.22, -.05, .48), 'chest')})

    # ============================================================ clips: firing
    SHOT = 3   # Fire's shot frame: two frames of trigger squeeze after the aim
    def fire_extra(f, P):
        # recoil: rises over two frames from the shot, decays, and is exactly zero 15 frames after it
        S = SHOT
        r = 0 if f <= S - 1 or f >= S + 15 else min(1, (f - S + 1) / 2) * math.exp(-max(0, f - S - 1) / 3) * (1 - smooth((f - S - 1) / 14))
        if r == 0: return P
        off, y, l, ro = P['hips']; P['hips'] = (off + V((0, .025 * r, 0)), y + .06 * r, l - .04 * r, ro)
        cy, cl, cr = P['chest']; P['chest'] = (cy + .16 * r, cl - .12 * r, cr)   # right shoulder driven back
        hy, hp, hr = P['head']; P['head'] = (hy + .06 * r, hp - .16 * r, hr)

        def post(gun):
            o, q = gun
            butt = gun_point(gun, V(A['StockContact'])); fwd = q @ axis
            lateral = fwd.cross(V((0, 0, 1))).normalized()
            kick = Q(lateral, .30 * r)                     # muzzle rises about 17 degrees
            q2 = kick @ q; butt2 = butt - fwd * .035 * r
            return butt2 - q2 @ (V(A['StockContact']) - grip0), q2
        P['gun_post'] = post
        return P

    make_ready = clip('MakeReady', [
        (1, CARRY, {}),
        (9, alter(CARRY, hips=(V((0, .005, -.018)), -.20, .02, 0), head=(-.05, .02, 0),
                  feet={'Left': STANCE['Left'], 'Right': STANCE['Right']},
                  gun=('chest', 'CarryGrip', (.050, -.150, .600), (-.05, -.10, 1), (-.2, -1, 0)),
                  hands={'Right': ('gun', 'TriggerGrip', (.6, .2, 0), (-.26, .05, .52), 'chest'),
                         'Left': ('gun', 'CarryGrip', (-.6, .5, 0), (.20, -.05, .50), 'chest')}),
         {'pivot': 'CarryGrip', 'feet': {'Right': (.1, .8), 'Left': (.3, .9)}, 'hand_arc': {'Right': (0, -.04, .03)}}),
        (21, READY, {'hand_arc': {'Left': (.03, -.05, .02)}}),
    ])

    # Preparing and shooting are separate clips so the game decides how long a unit takes to aim:
    # Present (ready -> aim) can play faster or slower, Aim loops for as long as the unit holds its aim,
    # Fire is only the shot, the recoil and bringing the musket down to load.
    present = clip('Present', [
        (1, READY, {}),
        (11, PRESENT, {'arc': (0, -.02, .02), 'pivot': (-.108, -.132, .29)}),
    ])

    def aim_extra(f, P):   # holding the aim: breathing and a small wander of the muzzle; period 24 frames
        w = 2 * math.pi * (f - 1) / 24
        cy, cl, cr = P['chest']; P['chest'] = (cy + .006 * math.sin(w), cl + .010 * math.sin(w), cr)

        def post(gun):
            o, q = gun; piv = V(A['StockContact']); p = gun_point(gun, piv)
            dq = Q((1, 0, 0), .007 * math.sin(w)) @ Q((0, 0, 1), .006 * math.sin(2 * w))
            q2 = dq @ q; return p - q2 @ (piv - grip0), q2
        P['gun_post'] = post
        return P
    aim = clip('Aim', [(1, PRESENT, {}), (25, PRESENT, {'ease': 'linear'})], extra=aim_extra)

    fire = clip('Fire', [
        (1, PRESENT, {}),
        (12, PRESENT, {'ease': 'linear'}),
        (28, LOAD, {'pivot': (-.112, -.132, .42)}),
    ], extra=fire_extra)

    # ============================================================ clip: reload
    ax = axis; pipe = G['pipe_top']; muz = G['muzzle']; out = -G['side']   # out: the lock side, away from the left hand
    CAST = key(
        hips=(V((0, .000, -.025)), -.30, .12, 0), chest=(0, .10, 0), head=(-.05, .38, 0), feet=STANCE,
        gun=('world', 'StockContact', (.010, -.150, .026), (-.165, .07, .985), (-1, 0, 0)),
        hands={'Left': ('gun', (-.126, -.130, .560), (-1, .2, 0), (.24, -.02, .45), 'chest'),
               'Right': ('gunpt', muz + ax * .045, (0, 0, -1), (-.30, .05, .60), 'chest')})
    rodhand = lambda u: ('rod', u, (.3, -.2, -1), (-.30, .10, .62), 'chest')
    airhand = lambda p: ('gunpt', p, (.3, -.2, -1), (-.34, .10, .70), 'chest')

    def reload_keys(LOAD, CAST, READY, end_opts=None, cast_opts=None):
        """The 1791 loading drill from LOAD (musket down to load) through CAST (butt grounded, rod side
        forward) to READY. Hand targets are on the musket or in the chest frame, so the same keys work
        for any body pose that defines these three keys (standing, kneeling). end_opts and cast_opts
        replace the options of the last segment (up to READY) and of the swing into CAST."""
        def R(hand, rod=None, **kw):
            k_ = alter(CAST, hands={'Right': hand}, **kw)
            if rod is not None: k_['rod'] = rod
            return k_
        BOX = alter(LOAD, hands={'Right': ('free', (-.112, -.040, .600), (0, 0, -1), (-.30, .10, .45), 'chest')}, head=(-.35, .32, 0))
        MOUTH = alter(LOAD, hands={'Right': ('free', (.002, -.090, .848), (0, 1, 0), (-.22, -.05, .62), 'chest')}, head=(-.05, .10, 0))
        BITE = alter(MOUTH, head=(-.12, -.06, .05))
        PAN = alter(LOAD, hands={'Right': ('gunpt', G['pan'] + V((.005, -.020, .018)), (.3, 0, -1), (-.30, .05, .52), 'chest')}, head=(-.20, .34, 0))
        shake = lambda d: alter(PAN, hands={'Right': ('gunpt', G['pan'] + V((.005, -.020, .018 + d)), (.3, 0, -1), (-.30, .05, .52), 'chest')})
        SHUT = alter(PAN, hands={'Right': ('gunpt', G['pan'] + V((-.005, -.010, .000)), (.3, 0, -1), (-.30, .05, .52), 'chest')})
        return [
        (1, LOAD, {}),
        (13, BOX, {'hand_arc': {'Right': (-.02, 0, .02)}}),
        (17, alter(BOX, hands={'Right': ('free', (-.112, -.040, .585), (0, 0, -1), (-.30, .10, .45), 'chest')}), {}),
        (30, MOUTH, {'hand_arc': {'Right': (-.03, -.03, 0)}}),
        (36, BITE, {'ease': 'snap'}),
        (48, PAN, {'hand_arc': {'Right': (-.02, -.03, .02)}}),
        (52, shake(.008), {}), (56, shake(0), {}), (60, shake(.008), {}), (64, shake(0), {}),
        (70, SHUT, {}),
        # cast about: musket swung across to the left, butt to the ground, rod side forward
        (94, R(airhand(muz + ax * .045)), cast_opts or {'pivot': (-.126, -.130, .50), 'arc': (.03, .05, .03)}),
        (100, R(airhand(muz + ax * .045 + out * .010)), {}), (106, R(airhand(muz + ax * .045)), {}),
        (112, R(airhand(muz + ax * .030)), {}),
        # draw the ramrod: grab the head, two strokes with a regrip, rod clear of the pipes
        (118, R(rodhand(0), ('pipe', 0)), {}),
        (128, R(rodhand(0), ('pipe', .20), shrug=.40), {}),
        (133, R(rodhand(.18), ('pipe', .20)), {}),
        (144, R(rodhand(.18), ('pipe', ROD_LEN), shrug=.40), {}),
        # turn it end over end out to the right, head down over the muzzle
        (152, R(airhand(pipe + ax * (ROD_LEN - .18 + .03) + out * .07), ('air', -math.pi / 2, .18), shrug=.40), {}),
        (160, R(airhand(muz + ax * .18), ('air', -math.pi, .18), shrug=.40), {}),
        # into the bore, regrip at the top, two ramming strokes
        (168, R(rodhand(.18), ('bore', .16)), {}),
        (173, R(rodhand(.36), ('bore', .16), shrug=.40), {}),
        (181, R(rodhand(.36), ('bore', .34)), {'ease': 'in'}),
        (186, R(rodhand(.36), ('bore', .25), shrug=.40), {'ease': 'out'}),
        (191, R(rodhand(.36), ('bore', .34)), {'ease': 'in'}),
        # withdraw in two strokes, turn it back, return it to the pipes
        (200, R(rodhand(.36), ('bore', .15), shrug=.40), {}),
        (205, R(rodhand(.19), ('bore', .15)), {}),
        (214, R(rodhand(.19), ('bore', -.02), shrug=.40), {}),
        (222, R(airhand(pipe + ax * (ROD_LEN - .19 + .03) + out * .07), ('air', -1.5 * math.pi, .19), shrug=.40), {}),
        (230, R(airhand(pipe + ax * (ROD_LEN - .19)), ('air', -2 * math.pi, .19), shrug=.40), {}),
        (231, R(rodhand(.19), ('pipe', ROD_LEN), shrug=.40), {}),
        (239, R(rodhand(.19), ('pipe', .21)), {}),
        (244, R(rodhand(0), ('pipe', .21), shrug=.40), {}),
        (252, R(rodhand(0), ('pipe', 0)), {}),
        # raise to the ready, cocking
        (272, READY, end_opts or {'pivot': (-.12, -.131, .45), 'arc': (0, -.03, .03), 'hand_arc': {'Left': (.02, -.03, 0)}}),
        ]
    reload = clip('Reload', reload_keys(LOAD, CAST, READY))
    # ============================================================ clips: bayonet fighting
    GSTANCE = {'Left': (V((.055, -.130, .069)), -.25, 0), 'Right': (V((-.085, .130, .069)), -1.10, 0)}
    GUARD = key(
        hips=(V((0, .020, -.055)), -.55, .08, 0), chest=(-.05, .10, 0), head=(.02, .06, 0), feet=GSTANCE,
        gun=('mix', 'TriggerGrip', (-.085, -.010, .505), (0, -1, .30), (-1, 0, .40)),
        hands={'Right': ('gun', 'TriggerGrip', (1, 0, .2), (-.26, .15, .45), 'world'),
               'Left': ('gun', (-.118, -.131, .450), (0, .2, 1), (.20, -.10, .40), 'world')})

    def guard_extra(f, P):   # idle: weight shifts and the point wanders a little; period 32 frames
        w = 2 * math.pi * (f - 1) / 32
        off, y, l, r = P['hips']; P['hips'] = (off + V((.006 * math.sin(w), .008 * math.sin(w), .006 * (math.cos(2 * w) - 1) / 2)), y + .03 * math.sin(w), l, r)
        cy, cl, cr = P['chest']; P['chest'] = (cy - .02 * math.sin(w), cl + .015 * math.sin(2 * w), cr)

        def post(gun):
            o, q = gun; piv = V((-.118, -.131, .450)); p = gun_point(gun, piv)
            dq = Q((1, 0, 0), .035 * math.sin(w)) @ Q((0, 0, 1), .03 * math.sin(2 * w))
            q2 = dq @ q; return p - q2 @ (piv - grip0), q2
        P['gun_post'] = post
        return P

    guard_ready = clip('GuardReady', [
        (1, CARRY, {}),
        (10, alter(CARRY, hips=(V((0, .010, -.030)), -.25, .04, 0), head=(-.05, .03, 0), feet=GSTANCE,
                   gun=('chest', 'CarryGrip', (.040, -.150, .560), (.05, -.45, .90), (-.6, -.6, 0)),
                   hands={'Right': ('gun', 'TriggerGrip', (1, 0, .2), (-.26, .10, .48), 'world')}),
         {'pivot': 'CarryGrip', 'feet': {'Left': (.1, .7), 'Right': (.3, .95)}, 'hand_arc': {'Right': (0, -.04, .03)}}),
        (22, GUARD, {'pivot': 'TriggerGrip', 'hand_arc': {'Left': (.03, -.06, .02)}}),
    ])
    guard = clip('BayonetGuard', [(1, GUARD, {}), (33, GUARD, {'ease': 'linear'})], extra=guard_extra)

    WIND = alter(GUARD, hips=(V((0, .050, -.060)), -.62, .04, 0), chest=(-.08, .05, 0),
                 gun=('mix', 'TriggerGrip', (-.085, .045, .500), (0, -1, .33), (-1, 0, .40)))
    LUNGE = alter(GUARD, hips=(V((0, -.130, -.078)), -.46, .20, 0), chest=(-.12, .18, 0), head=(.02, .10, 0),
                  feet={'Left': (V((.055, -.310, .069)), -.25, 0), 'Right': (V((-.085, .130, .069)), -1.10, .50)},
                  gun=('mix', 'TriggerGrip', (-.060, -.150, .560), (0, -1, .10), (-1, 0, .40)),
                  # the rear hand drives the musket forward through the leading hand
                  hands={'Left': ('gun', (-.106, -.132, .280), (0, .2, 1), (.20, -.10, .45), 'world')})
    thrust = clip('BayonetThrust', [
        (1, GUARD, {}),
        (7, WIND, {'ease': 'out'}),
        (13, LUNGE, {'ease': 'snap', 'feet': {'Left': (0, .85), 'Right': (.1, 1)}, 'lift': .03}),
        (16, LUNGE, {'ease': 'linear'}),
        (30, GUARD, {'feet': {'Left': (.2, .9), 'Right': (0, .7)}, 'lift': .025}),
    ])

    COIL = alter(GUARD, hips=(V((0, .050, -.060)), -.75, .05, 0), chest=(-.22, .06, 0), head=(.05, .08, 0),
                 gun=('mix', 'TriggerGrip', (-.100, .060, .520), (.20, -1, .45), (-1, 0, .40)),
                 hands={'Left': ('gun', (-.118, -.131, .50), (0, .2, 1), (.20, -.10, .40), 'world')})
    BSTANCE = {'Left': (V((.055, -.130, .069)), .25, 0), 'Right': (V((-.050, -.170, .069)), -.20, 0)}
    STRIKE = alter(GUARD, hips=(V((0, -.110, -.050)), .30, .12, 0), chest=(.30, .08, 0), head=(-.05, .02, 0), feet=BSTANCE,
                   gun=('world', 'StockContact', (-.020, -.420, .780), (.50, .80, -.30), (0, 0, 1)),
                   hands={'Right': ('gun', 'TriggerGrip', (0, .3, 1), (-.32, .10, .38), 'world'),
                          'Left': ('gun', (-.118, -.131, .400), (0, 0, 1), (.25, .10, .50), 'world')})
    FOLLOW = alter(STRIKE, hips=(V((0, -.120, -.050)), .40, .12, 0), chest=(.40, .08, 0),
                   gun=('world', 'StockContact', (.110, -.380, .840), (.20, .92, -.30), (0, 0, 1)))
    butt = clip('ButtStroke', [
        (1, GUARD, {}),
        (9, COIL, {'ease': 'out'}),
        (15, STRIKE, {'ease': 'snap', 'pivot': (-.118, -.131, .40), 'feet': {'Right': (0, .9)}, 'lift': .04}),
        (19, FOLLOW, {'ease': 'out'}),
        (36, GUARD, {'pivot': (-.118, -.131, .42), 'feet': {'Right': (.1, .8)}, 'lift': .03}),
    ])
    # ============================================================ shared helpers for the clip modules
    def walk_extra(period=k.WALK_N, stride=k.WALK_HALF, lift=k.WALK_LIFT, backward=False, base_yaw=0.):
        """Per-frame legs and hips of the walk (k.walk_feet, speed-locked, in place) for any upper body.
        Frame 1 is the carry stance (CARRY's feet, hips and yaw). backward: the feet travel forward
        under the body, so the soldier steps back."""
        def extra(f, P):
            ph = 2 * math.pi * (f - 1) / period * (-1 if backward else 1)
            off, yaw, lean, roll = P['hips']
            bob = -.012 - .008 * (1 - math.cos(2 * ph))
            P['hips'] = (V((off.x, off.y, bob)), base_yaw + carry_yaw * math.cos(ph), lean, roll)
            P['feet'] = k.walk_feet(((f - 1) / period) % 1, stride, lift, backward)
            return P
        return extra

    def run_extra():
        """Per-frame legs and hips of the run (16 frames, k.RUN_SPEED model units/s) for any upper body."""
        def extra(f, P):
            i = (f - 1) % k.RUN_FRAMES; ph = 2 * math.pi * i / k.RUN_FRAMES
            bob = -.035 - .015 * math.cos(2 * math.pi * (i - 2) / 8)
            yaw = -.09 * math.cos(ph)
            off, _, lean, roll = P['hips']
            P['hips'] = (V((off.x, -.015, bob)), yaw, k.RUN_LEAN + lean, roll)
            cy, cl, cr = P['chest']; P['chest'] = (cy - .8 * yaw, cl + k.RUN_CHEST_LEAN, cr)
            feet = {}
            for side, x, o in (('Left', .075, 0), ('Right', -.055, k.RUN_FRAMES // 2)):
                j = (i + o) % k.RUN_FRAMES; y, z = k.RUN_FOOT[j]
                feet[side] = (V((x, y, z)), 0, k.RUN_PITCH[j])
            P['feet'] = feet
            return P
        return extra

    def chain(*extras):
        def extra(f, P):
            for e in extras:
                if e: P = e(f, P)
            return P
        return extra

    def rotate_key(K, angle):
        """K turned by angle (radians, counter-clockwise from above) about the root: for clips that end
        facing another way. The game turns the root by the same angle when the clip ends. Feet,
        hands and gun targets stay in the key's own (root) frame; to keep a foot planted on the
        ground while the root turns, give it planted(world position, root angle)."""
        return alter(K, root=K.get('root', 0) + angle)

    def planted(world, root):   # a world position expressed in a frame turned by root
        return Q((0, 0, 1), -root) @ V(world)

    T = SimpleNamespace(**dict(locals()))
    T.key, T.alter, T.Q, T.V, T.M4, T.smooth, T.G, T.ROD_LEN = key, alter, Q, V, M4, smooth, G, ROD_LEN
    module_actions, module_clips = [], {}
    for mod_name in MODULES:   # each clip module: author(k, T) -> (actions, clip table entries)
        mod = importlib.import_module(mod_name)
        acts, table = mod.author(k, T)
        module_actions += acts; module_clips.update(table)

    # Contacts (for validate-drill.py) and the clip graph with event times (for the game).
    (k.ROOT / 'contacts.json').write_text(json.dumps(contacts))
    CLIPS = {
        'MakeReady': dict(frames=21, loop=False, starts='Walking@1', ends='Present@1', reverse_to='Walking@1'),
        'Present': dict(frames=11, loop=False, starts='MakeReady@end|Reload@end', ends='Aim@1', reverse_to='MakeReady@end', aim=[6, 11]),
        'Aim': dict(frames=25, loop=True, starts='Present@end', ends='Aim@1', aim=[1, 25]),
        'Fire': dict(frames=28, loop=False, starts='Present@end|Aim@1', ends='Reload@1', events={'fire': SHOT}, aim=[1, 12]),
        'Reload': dict(frames=272, loop=False, starts='Fire@end', ends='Present@1', ramrod=True,
                       events={'rod_drawn': 144, 'rammed': 181, 'rod_returned': 252}),
        'GuardReady': dict(frames=22, loop=False, starts='Walking@1', ends='BayonetGuard@1', reverse_to='Walking@1'),
        'BayonetGuard': dict(frames=33, loop=True, starts='GuardReady@end', ends='BayonetGuard@1'),
        'BayonetThrust': dict(frames=30, loop=False, starts='BayonetGuard@1', ends='BayonetGuard@1', events={'hit': 13}),
        'ButtStroke': dict(frames=36, loop=False, starts='BayonetGuard@1', ends='BayonetGuard@1', events={'hit': 15}),
    }
    CLIPS.update(module_clips)
    for c in CLIPS.values():
        c['seconds'] = (c['frames'] - 1) / 24
        c['event_seconds'] = {e: (fr - 1) / 24 for e, fr in c.get('events', {}).items()}
    (k.ROOT / 'clips.json').write_text(json.dumps(dict(fps=24, clips=CLIPS), indent=1))
    return [make_ready, present, aim, fire, reload, guard_ready, guard, thrust, butt] + module_actions
