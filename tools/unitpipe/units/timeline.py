"""Key-pose timelines for bipeds and props, with planted footsteps.

An Actor has body keys (hips, chest, head, hands, curl, elbow: blended with an ease) and, separately,
footsteps: each foot stays planted until a step lifts it and sets it down elsewhere, so feet never slide.
Hands are resolved to (wrist, rotation) at both keys of a segment, then blended, so a hand can go from
hanging to gripping a moving prop smoothly. Props are keyed 4x4 matrices (and a scale for hiding).
"""
import copy, math
from mathutils import Vector, Matrix, Quaternion
from biped import blend, fwd, body_rot
import unitkit as K


def ease(kind, t):
    t = max(0.0, min(1.0, t))
    if kind == 'linear': return t
    if kind == 'in': return t * t
    if kind == 'out': return 1 - (1 - t) * (1 - t)
    if kind == 'snap': return 1 - (1 - t) ** 3
    return t * t * (3 - 2 * t)


def unwrap(a, ref):
    """The angle equal to a (mod 2 pi) closest to ref."""
    return ref + (a - ref + math.pi) % (2 * math.pi) - math.pi


def lateral(yaw):
    return Vector((math.cos(yaw), math.sin(yaw), 0))


class Prop:
    def __init__(self, name, M, scale=1.0):
        self.name = name
        self.keys = [(0, M.copy(), scale, 'smooth')]
        self.carries = []       # (f0, f1, actor, fn(hips) -> matrix): the prop goes where the body goes

    def carry(self, f0, f1, actor, fn):
        """Carry the prop with an actor's body from f0 to f1 (keyed at both ends, so it joins)."""
        self.key(f0, fn(actor.hips_at(f0)))
        self.key(f1, fn(actor.hips_at(f1)))
        self.carries.append((f0, f1, actor, fn))

    def key(self, f, M=None, scale=None, ease_kind='smooth'):
        """Key the prop at frame f; what is not given keeps its state at f."""
        M0, s0 = self.sample_keys(f)
        self.keys = [k for k in self.keys if k[0] != f]
        self.keys.append((f, (M if M is not None else M0).copy(), s0 if scale is None else scale, ease_kind))
        self.keys.sort(key=lambda k: k[0])

    def hold(self, f):
        self.key(f)

    def sample(self, f):
        for (a, b, actor, fn) in self.carries:
            if a <= f <= b:
                return fn(actor.hips_at(f)), self.sample_keys(f)[1]
        return self.sample_keys(f)

    def sample_keys(self, f):
        ks = self.keys
        if f <= ks[0][0]:
            k = ks[0]; return k[1], k[2]
        for a, b in zip(ks, ks[1:]):
            if f <= b[0]:
                t = ease(b[3], (f - a[0]) / max(1e-9, b[0] - a[0]))
                loc = a[1].to_translation().lerp(b[1].to_translation(), t)
                q = a[1].to_quaternion().slerp(b[1].to_quaternion(), t)
                M = q.to_matrix().to_4x4(); M.translation = loc
                return M, a[2] + (b[2] - a[2]) * t
        k = ks[-1]; return k[1], k[2]

    def at(self, f):
        return self.sample(f)[0]


class Actor:
    def __init__(self, biped, pose, ankle_z=.128):
        self.B = biped
        body = {k: v for k, v in pose.items() if k != 'feet'}
        self.keys = [(0, body, 'smooth')]
        self.plants = {s: [(-1, -1, Vector(p), y, p)] for s, (p, y, _) in pose['feet'].items()}
        self.steps = {s: [] for s in pose['feet']}
        self.paths = []
        self.ankle_z = ankle_z

    # ---------------------------------------------------------------- authoring
    def last(self):
        return copy.copy(self.keys[-1][1])

    def key(self, f, ease_kind='smooth', **changes):
        body = copy.copy(self.body_at_key(f))
        for k, v in changes.items():
            if k in ('hands', 'curl', 'elbow'):
                d = dict(body.get(k, {})); d.update(v); body[k] = d
            else:
                body[k] = v
        self.keys = [k for k in self.keys if k[0] != f] + [(f, body, ease_kind)]
        self.keys.sort(key=lambda k: k[0])
        return body

    def hold(self, f):
        self.key(f)

    def body_at_key(self, f):
        """The latest key at or before f (the state a new key starts from)."""
        ks = [k for k in self.keys if k[0] <= f]
        return (ks[-1] if ks else self.keys[0])[1]

    def feet_at(self, f):
        return {s: self.foot(s, f)[0:2] for s in self.plants}

    def step(self, side, f0, f1, pos, yaw, lift=.07):
        pos = Vector(pos); pos.z = self.ankle_z if pos.z == 0 else pos.z
        prev = self.plant_at(side, f0)
        yaw = unwrap(yaw, prev[3])
        self.steps[side].append((f0, f1, prev[2].copy(), prev[3], pos, yaw, lift))
        self.plants[side].append((f0, f1, pos, yaw, None))

    def plant_at(self, side, f):
        ps = [p for p in self.plants[side] if p[1] <= f]
        return ps[-1]

    def walk(self, f0, f1, dest, yaw, width=.11, first=None, step_len=.5, face_travel=None, lean=None):
        """Walk from where the feet stand to dest (x, y), ending feet together facing yaw.

        Longer walks (over 0.8 m, or face_travel=True) turn into the path first, walk facing where they
        go and turn to yaw in the last two steps; short ones step there keeping the body's facing,
        turning gradually. The hips follow the feet on a path of their own (see pose_at), so body keys
        inside the walk (hands, chest) keep their own timing."""
        L = self.plant_at('Left', f0); R = self.plant_at('Right', f0)
        start = (L[2] + R[2]) / 2; start.z = 0; dest = Vector((dest[0], dest[1], 0))
        d = dest - start
        y0 = self.body_at_key(f0)['hips'][1]
        travel = d.length > .8 if face_travel is None else face_travel
        head = unwrap(math.atan2(d.x, -d.y), y0) if d.length > 1e-4 else y0
        n = max(2, math.ceil(d.length / step_len) + (2 if travel else 1))
        yaw_end = unwrap(yaw, head if travel else y0)
        if first is None:   # the foot behind (along the way) goes first
            first = 'Left' if (L[2] - R[2]).dot(d) < 0 else 'Right'
        sides = [first, 'Right' if first == 'Left' else 'Left']
        dur = (f1 - f0) / n
        h0 = self.body_at_key(f0)['hips'][0]
        pts = [(f0, Vector((h0.x, h0.y, 0)), y0)]
        feet = {'Left': L[2].copy(), 'Right': R[2].copy()}
        for i in range(n):
            side = sides[i % 2]
            t = (i + 1) / n
            last2 = i >= n - 2              # the last two steps set the feet in the standing stance
            c = dest if last2 else start.lerp(dest, min(1, t + .5 / n))
            if last2:
                yy = yaw_end
            elif travel:
                yy = head
            else:
                yy = y0 + (yaw_end - y0) * t
            sgn = 1 if side == 'Left' else -1
            p = c + lateral(yy) * width * sgn
            self.step(side, f0 + i * dur, f0 + (i + 1) * dur, Vector((p.x, p.y, 0)), yy + .12 * sgn)
            feet[side] = Vector((p.x, p.y, 0))
            mid = (feet['Left'] + feet['Right']) / 2
            pts.append((f0 + (i + 1) * dur, dest.copy() if i == n - 1 else mid, yy))
        self.paths.append((f0, f1, pts))
        b = self.body_at_key(f0)['hips']
        self.key(f0)
        self.key(f1, hips=(Vector((dest.x, dest.y, b[0].z)), yaw, b[2] if lean is None else lean, b[3]))

    # ---------------------------------------------------------------- sampling
    def foot(self, side, f):
        for (a, b, p0, y0, p1, y1, lift) in self.steps[side]:
            if a <= f < b:
                t = (f - a) / (b - a)
                # the foot rises before it travels and is set down after: no scuffing
                e = ease('smooth', (t - .12) / .76)
                p = p0.lerp(p1, e); p.z += lift * math.sin(math.pi * t) ** .7
                pitch = .25 * math.sin(math.pi * t) * (1 - t) - .15 * math.sin(math.pi * t) * t
                return p, y0 + (y1 - y0) * e, pitch
        pl = self.plant_at(side, f)
        return pl[2].copy(), pl[3], 0.0

    def sample_body(self, f):
        ks = self.keys
        if f <= ks[0][0]:
            return ks[0][1], ks[0][1], 0.0
        for a, b in zip(ks, ks[1:]):
            if f <= b[0]:
                return a[1], b[1], ease(b[2], (f - a[0]) / max(1e-9, b[0] - a[0]))
        return ks[-1][1], ks[-1][1], 0.0

    def hips_at(self, f):
        a, b, t = self.sample_body(f)
        h = blend(a['hips'], b['hips'], t)
        for (p0, p1, pts) in self.paths:
            if p0 <= f < p1:
                for (fa, pa, ya), (fb, pb, yb) in zip(pts, pts[1:]):
                    if fa <= f <= fb:
                        u = (f - fa) / max(1e-9, fb - fa)
                        k = ease('in' if fa == p0 else 'out' if fb == pts[-1][0] else 'linear', u) if len(pts) > 2 else ease('smooth', u)
                        xy = pa.lerp(pb, k)
                        return (Vector((xy.x, xy.y, h[0].z)), ya + (yb - ya) * k, h[2], h[3])
        return h

    def pose_at(self, f, props):
        a, b, t = self.sample_body(f)
        body = blend({k: v for k, v in a.items() if k not in ('hands', 'elbow')},
                     {k: v for k, v in b.items() if k not in ('hands', 'elbow')}, t)
        body['hips'] = self.hips_at(f)
        body['feet'] = {s: self.foot(s, f) for s in self.plants}
        hands = {}
        for side in set(a.get('hands', {})) | set(b.get('hands', {})):
            sa = a.get('hands', {}).get(side); sb = b.get('hands', {}).get(side)
            sa = sa or sb; sb = sb or sa
            wa, Ra = self.B.hand_target(side, sa, body, props)
            wb, Rb = self.B.hand_target(side, sb, body, props)
            hands[side] = ('resolved', wa.lerp(wb, t), Ra.to_quaternion().slerp(Rb.to_quaternion(), t).to_matrix())
        body['hands'] = hands
        el = {}
        for side in set(a.get('elbow', {})) | set(b.get('elbow', {})):
            ea = a.get('elbow', {}).get(side); eb = b.get('elbow', {}).get(side)
            if ea is not None and eb is not None:
                el[side] = blend(ea, eb, t)
            elif (ea if t < .5 else eb) is not None:
                el[side] = ea if t < .5 else eb
        body['elbow'] = el
        return body
