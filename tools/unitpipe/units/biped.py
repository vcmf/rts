"""World-space posing of a Tripo/Mixamo humanoid inside a combined rig (crew members, the rider).

A pose (a plain dict, so key poses can be blended) holds:
  hips   = (pos, yaw, lean, roll)    hip joint position (m) and body turn; yaw 0 faces -Y, + turns left,
                                     lean + bends forward, roll + tips to the figure's left
  chest  = (yaw, lean, roll)         relative to the hips, spread over the three spine bones
  head   = (yaw, pitch)              relative to the chest (+ pitch looks down); the neck takes 40%
  feet   = {'Left': (ankle, yaw, pitch)}   ankle position, foot yaw (world), toes-down pitch
  hands  = {'Left': hand spec}       see Biped.hand_target
  curl   = {'Left': 0..1}            finger curl (0 = as modelled)
Every angle is in radians.
"""
import math
from mathutils import Vector, Matrix, Quaternion

UP = Vector((0, 0, 1))


def Rz(a): return Matrix.Rotation(a, 3, 'Z')
def Rx(a): return Matrix.Rotation(a, 3, 'X')
def Ry(a): return Matrix.Rotation(a, 3, 'Y')


def fwd(yaw):
    """The direction a figure with this yaw faces (yaw 0 = -Y, +90 deg = +X)."""
    return Vector((math.sin(yaw), -math.cos(yaw), 0))


def body_rot(yaw, lean=0.0, roll=0.0):
    return Rz(yaw) @ Rx(lean) @ Ry(roll)


def blend(a, b, t):
    """Blend two pose values of the same shape (numbers, Vectors, tuples, dicts, strings/None held)."""
    if isinstance(a, dict):
        out = {}
        for k in set(a) | set(b):
            if k in a and k in b:
                out[k] = blend(a[k], b[k], t)
            else:
                out[k] = (a if k in a else b)[k]
        return out
    if isinstance(a, (tuple, list)):
        if len(a) != len(b) or (a and isinstance(a[0], str) and a[0] != b[0]):
            return b if t >= .5 else a
        return type(a)(blend(x, y, t) for x, y in zip(a, b))
    if isinstance(a, Vector):
        return a.lerp(b, t)
    if isinstance(a, Quaternion):
        return a.slerp(b, t)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a + (b - a) * t
    return b if t >= .5 else a


class Biped:
    def __init__(self, P, prefix, rest_yaw=0.0, grip0=None):
        self.P = P; self.pre = prefix; self.rest_yaw = rest_yaw
        self._grips = {}
        self.grip0 = grip0
        n = lambda s: prefix + 'mixamorig:' + s
        self.n = n
        rest = P.rest
        self.hip_rest = rest[n('Hips')].to_translation()
        self.ankle_z = rest[n('LeftFoot')].to_translation().z
        unturn = Rz(-rest_yaw)
        self.canon = {b: unturn @ rest[b].to_3x3() for b in rest if b.startswith(prefix)}
        # hand frames in the canonical rest: fingers, palm normal, thumb side
        self.hand0 = {}
        for side in ('Left', 'Right'):
            h = unturn @ rest[n(side + 'Hand')].to_translation()
            mid = unturn @ rest[n(side + 'HandMiddle1')].to_translation()
            ind = unturn @ rest[n(side + 'HandIndex1')].to_translation()
            pin = unturn @ rest[n(side + 'HandPinky1')].to_translation()
            f = (mid - h).normalized()
            a = ind - pin; a = (a - f * a.dot(f)).normalized()
            tip = unturn @ (rest[n(side + 'HandIndex3')].to_translation())
            curl = tip - ind; curl = curl - f * curl.dot(f) - a * curl.dot(a)
            nrm = f.cross(a).normalized()
            if curl.length > 1e-5 and nrm.dot(curl) < 0:
                nrm = -nrm
            s0 = 1 if a.dot(f.cross(nrm)) > 0 else -1
            M0 = Matrix((f, nrm, f.cross(nrm))).transposed()
            self.hand0[side] = dict(M0=M0, s0=s0, wrist_to_mid=(mid - h).length)
        if self.grip0 is None:
            # no modelled grip: a rod across the right palm, thumb side, closed on by curling the fingers
            h = unturn @ rest[n('RightHand')].to_translation()
            mid = unturn @ rest[n('RightHandMiddle1')].to_translation()
            hf = self.hand0['Right']
            f = hf['M0'].col[0]; nrm = hf['M0'].col[1]
            ind = unturn @ rest[n('RightHandIndex1')].to_translation(); pin = unturn @ rest[n('RightHandPinky1')].to_translation()
            u = ind - pin; u = (u - f * u.dot(f)).normalized()
            L = (mid - h).length
            g = h + f * (L * 1.45) + nrm * (L * .45)
            self.grip0 = dict(axis=list(u), point=list(g), wrist=list(h))
        # rest foot direction (canonical), per side
        self.foot0 = {}
        for side in ('Left', 'Right'):
            a = unturn @ rest[n(side + 'Foot')].to_translation()
            t = unturn @ rest[n(side + 'ToeBase')].to_translation()
            d = t - a; d.z = 0
            self.foot0[side] = math.atan2(d.x, -d.y)   # yaw of the rest foot

    # ------------------------------------------------------------ pieces
    def world(self, bone, R):
        """Set a bone's world rotation to R applied to its canonical rest, at its current head."""
        name = self.n(bone)
        self.P.set(name, Matrix.Translation(self.P.head(name)) @ (R @ self.canon[name]).to_4x4())

    def hand_rot(self, side, fingers, palm):
        """World rotation of a hand whose fingers point along `fingers` and palm faces `palm`."""
        f = fingers.normalized(); nn = (palm - f * palm.dot(f)).normalized()
        M1 = Matrix((f, nn, f.cross(nn))).transposed()
        return M1 @ self.hand0[side]['M0'].transposed()

    def grip(self, side, point, axis, back, reach=.072, depth=.032):
        """Wrist position and hand rotation for a power grip around a rod through `point` along `axis`
        (the thumb towards +axis), the back of the hand towards `back`."""
        u = axis.normalized(); b = (back - u * back.dot(u)).normalized()
        palm = -b
        s0 = self.hand0[side]['s0']
        f = s0 * palm.cross(u)
        wrist = point - f * reach - palm * depth
        return wrist, self.hand_rot(side, f, palm)

    def rod_grip(self, side, point, axis, wdir):
        """Wrist and hand rotation holding a rod through `point` along `axis` (thumb towards +axis) as the
        model's right fist holds its staff (mirrored for the left), the wrist on the `wdir` side of the rod."""
        g = self.grip0
        u0 = Vector(g['axis']); off0 = Vector(g['wrist']) - Vector(g['point'])
        if side == 'Left':
            u0.x = -u0.x; off0.x = -off0.x
        w0 = (off0 - u0 * off0.dot(u0)).normalized()
        F0 = Matrix((u0, w0, u0.cross(w0))).transposed()
        u = Vector(axis).normalized(); w1 = Vector(wdir) - u * Vector(wdir).dot(u); w1.normalize()
        F1 = Matrix((u, w1, u.cross(w1))).transposed()
        R = F1 @ F0.transposed()
        return Vector(point) + R @ off0, R

    def natural_grip(self, side, point, axis, wdir, pose, memory=None):
        """A grip round a rod, the hand wrapping it from the side that keeps the wrist straightest for where the
        elbow goes (a hand can hold a rod from any side; one fixed side bent wrists past 100 degrees). `wdir`
        is the author's preference, weighed in lightly; `memory` names the grip, which then stays near the side it
        took the frame before (no flip between two near-equal sides). Returns (wrist, hand rotation, the wrist's side)."""
        P = self.P; n = self.n
        u = Vector(axis).normalized()
        ref = Vector(wdir) - u * Vector(wdir).dot(u)
        if ref.length < 1e-6:
            ref = u.orthogonal()
        ref.normalize()
        sh = P.head(n(side + 'Arm'))
        pos, yaw, lean, roll = pose['hips']
        cy, cl, cr = pose.get('chest', (0, 0, 0))
        Rc = body_rot(yaw, lean, roll) @ body_rot(cy, cl, cr)
        out = 1 if side == 'Left' else -1
        v = pose.get('elbow', {}).get(side)
        v = Vector(v) if v is not None else Vector((.6, .5, -.4))
        pole = sh + Rc @ Vector((out * v.x, v.y, v.z))
        l1 = P.length[n(side + 'Arm')]; l2 = P.length[n(side + 'ForeArm')]
        f0 = self.hand0[side]['M0'].col[0]
        best = None
        for k in range(24):
            wd = Quaternion(u, 2 * math.pi * k / 24) @ ref
            w, R = self.rod_grip(side, point, u, wd)
            d = w - sh; dist = min(max(d.length, abs(l1 - l2) + 1e-4), (l1 + l2) * .999); d.normalize()
            pl = pole - sh; pl -= d * pl.dot(d)
            pl = pl.normalized() if pl.length > 1e-8 else Vector((0, 0, 1))
            along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
            elbow = sh + d * along + pl * math.sqrt(max(0, l1 * l1 - along * along))
            y = (w - elbow).normalized()
            c = (R @ f0).angle(y) + .25 * wd.angle(ref)
            last = self._grips.get(memory) if memory else None
            if last is not None:
                c += .6 * wd.angle(last)
            if best is None or c < best[0]:
                best = (c, w, R, wd)
        if memory:
            self._grips[memory] = best[3].copy()
        return best[1], best[2], best[3]

    def set_pose(self, pose, props=None):
        P = self.P; n = self.n
        pos, yaw, lean, roll = pose['hips']
        Rb = body_rot(yaw, lean, roll)
        P.set(n('Hips'), Matrix.Translation(Vector(pos)) @ (Rb @ self.canon[n('Hips')]).to_4x4())
        cy, cl, cr = pose.get('chest', (0, 0, 0))
        for k, b in enumerate(('Spine', 'Spine1', 'Spine2'), 1):
            f = k / 3
            self.world(b, Rb @ body_rot(cy * f, cl * f, cr * f))
        Rc = Rb @ body_rot(cy, cl, cr)
        hy, hp = pose.get('head', (0, 0))
        self.world('Neck', Rc @ body_rot(hy * .4, hp * .4))
        self.world('Head', Rc @ body_rot(hy, hp))
        for side in ('Left', 'Right'):
            self.world(side + 'Shoulder', Rc)
        # legs
        for side, (ankle, fy, fp) in pose['feet'].items():
            ankle = Vector(ankle)
            hip = P.head(n(side + 'UpLeg'))
            pole = ankle.lerp(hip, .5) + fwd(fy) * .6 + fwd(yaw) * .2
            if 'knee' in pose and side in pose['knee']:
                pole = Vector(pose['knee'][side])
            P.two_bone(n(side + 'UpLeg'), n(side + 'Leg'), ankle, pole)
            lateral = Rz(fy) @ Vector((1, 0, 0))
            self.world(side + 'Foot', Matrix.Rotation(fp, 3, lateral) @ Rz(fy - self.foot0[side]))
            self.world(side + 'ToeBase', Matrix.Rotation(fp * .3, 3, lateral) @ Rz(fy - self.foot0[side]))
        # arms
        for side, spec in pose.get('hands', {}).items():
            wrist, R = self.hand_target(side, spec, pose, props)
            sh = P.head(n(side + 'Arm'))
            out = 1 if side == 'Left' else -1
            # elbow pole: a body-relative direction from the shoulder (default out, back and down)
            v = pose.get('elbow', {}).get(side)
            v = Vector(v) if v is not None else Vector((.6, .5, -.4))
            pole = sh + Rc @ Vector((out * v.x, v.y, v.z))
            P.two_bone(n(side + 'Arm'), n(side + 'ForeArm'), wrist, pole)
            fa = n(side + 'ForeArm')
            # twist the forearm half way to the hand's roll, to spread the wrist turn
            hz = (R @ self.canon[n(side + 'Hand')]).col[2]
            cur = P.pb[fa].matrix.col[2].to_3d().normalized()
            P.place(fa, P.head(fa), P.tail(fa), twist_ref=cur.lerp(hz.normalized(), .6))
            self.world(side + 'Hand', R)
        for side, c in pose.get('curl', {}).items():
            self.curl(side, c)

    def hand_target(self, side, spec, pose, props):
        kind = spec[0]
        if kind == 'resolved':
            return spec[1], spec[2]
        if kind == 'hang':                        # ('hang', swing + = forward, out)
            pos, yaw, lean, roll = pose['hips']
            cy, cl, cr = pose.get('chest', (0, 0, 0))
            Rc = body_rot(yaw, lean, roll) @ body_rot(cy, cl, cr)
            sgn = 1 if side == 'Left' else -1
            swing = spec[1]; out = spec[2] if len(spec) > 2 else .06
            shoulder = Vector(pos) + Rc @ Vector((sgn * .19, .0, .40))
            wrist = shoulder + Rc @ Vector((sgn * out, -math.sin(swing) * .43, -math.cos(swing) * .43))
            fingers = Rc @ Vector((0, -math.sin(swing) * .3, -1))
            palm = Rc @ Vector((-sgn, 0, 0))
            return wrist, self.hand_rot(side, fingers, palm)
        if kind == 'wrist':                       # ('wrist', pos, fingers, palm)
            return Vector(spec[1]), self.hand_rot(side, Vector(spec[2]), Vector(spec[3]))
        if kind == 'rod':                         # ('rod', prop, s along it, wrist side, thumb +1/-1 along the prop)
            M = props[spec[1]]
            u = M.col[1].to_3d().normalized(); p0 = M.to_translation()
            w, R = self.rod_grip(side, p0 + u * spec[2], u * (spec[4] if len(spec) > 4 else 1), Vector(spec[3]))
            pad = spec[5] if len(spec) > 5 else 0.0     # a rod thicker than the modelled staff
            if pad:
                wd = Vector(spec[3]) - u * Vector(spec[3]).dot(u)
                w = w + wd.normalized() * pad
            return w, R
        if kind == 'grip':                        # ('grip', point, axis, wrist side)
            return self.natural_grip(side, Vector(spec[1]), Vector(spec[2]), Vector(spec[3]), pose, memory=(side, 'grip'))[:2]
        if kind == 'point':                       # ('point', pos, back) a grip on a horizontal rod along X
            return self.grip(side, Vector(spec[1]), Vector(spec[3]) if len(spec) > 3 else Vector((1, 0, 0)), Vector(spec[2]))
        raise ValueError(kind)

    def curl(self, side, c):
        """Close the fingers (and a little the thumb) by c (0..1) from the modelled shape."""
        P = self.P
        for fname in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb'):
            for k in (1, 2, 3):
                name = self.n(f'{side}Hand{fname}{k}')
                if name not in P.pb:
                    continue
                pb = P.pb[name]
                ang = c * (.35 if fname == 'Thumb' else (1.0, 1.2, .8)[k - 1])
                axis = Vector((1, 0, 0))
                pb.matrix_basis = Quaternion(axis, ang).to_matrix().to_4x4()   # absolute: posing twice is the same
        P.update()
