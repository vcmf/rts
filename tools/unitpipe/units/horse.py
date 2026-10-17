"""The horse: body, neck, tail and four legs posed in the sagittal plane, and its gaits.

The horse faces -Y; its left is +X. Each leg is a chain J0 (shoulder / hip) - J1 (elbow / stifle) -
J2 (carpus / hock) - J3 (fetlock), then pastern, hoof, toe. A leg is set by its fetlock target and the
flexion of its middle joint (kappa) and of the pastern (psi); the rest of the chain is solved in the
leg's vertical plane, keeping each joint on the side it bends to at rest.

Gaits are in-place cycles at the ruleset's speeds: in stance a fetlock moves back at the gait speed
(planted on the ground), in swing it comes forward lifted. root speed in clips.json moves the unit.
"""
import math
from mathutils import Vector, Matrix
from timeline import ease

LEGS = ('FL', 'FR', 'HL', 'HR')
FPS = 24


def v2(p):            # (forward, up) of a world point: forward is -Y
    return (-p.y, p.z)


def circle_meet(a, ra, b, rb, side):
    """Point at distance ra from a and rb from b (2D), on the given side of a->b (+1 left of the line)."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    d = math.hypot(dx, dz)
    d = max(min(d, (ra + rb) * .9995), abs(ra - rb) * 1.0005 + 1e-6)
    t = (ra * ra - rb * rb + d * d) / (2 * d)
    h = math.sqrt(max(0.0, ra * ra - t * t))
    ux, uz = dx / max(d, 1e-9), dz / max(d, 1e-9)
    return (a[0] + ux * t - uz * h * side, a[1] + uz * t + ux * h * side)


def cross2(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


class Horse:
    def __init__(self, P, mesh, prefix='Horse:'):
        self.P = P; self.pre = prefix
        rest = P.rest
        n = lambda s: prefix + s
        self.n = n
        self.leg = {}
        for leg in LEGS:
            bones = [n(f'{leg}{k}') for k in range(1, 7)]
            J = [rest[b].to_translation() for b in bones[:4]]
            L = [(J[i + 1] - J[i]).length for i in range(3)]
            j2 = [v2(j) for j in J]
            # interior angle at J2 and the bend sides at rest
            a1 = (j2[1][0] - j2[2][0], j2[1][1] - j2[2][1]); a3 = (j2[3][0] - j2[2][0], j2[3][1] - j2[2][1])
            alpha = math.acos(max(-1, min(1, (a1[0] * a3[0] + a1[1] * a3[1]) / (math.hypot(*a1) * math.hypot(*a3)))))
            side1 = 1 if cross2(j2[0], j2[3], j2[1]) > 0 else -1
            side2 = 1 if cross2(j2[1], j2[3], j2[2]) > 0 else -1
            # the hoof: lowest vertex mainly weighted to the hoof bone, below the fetlock
            self.leg[leg] = dict(bones=bones, J=J, L=L, alpha=alpha, side1=side1, side2=side2)
        # hoof sole height under the fetlock (rest), from the mesh
        gi = {g.name: g.index for g in mesh.vertex_groups}
        for leg in LEGS:
            b5 = gi.get(n(f'{leg}5')); b4 = gi.get(n(f'{leg}4'))
            zs = [v.co.z for v in mesh.data.vertices if any(g.group in (b4, b5) and g.weight > .5 for g in v.groups)]
            self.leg[leg]['sole'] = self.leg[leg]['J'][3].z - (min(zs) if zs else 0.0)
        self.root_pivot = Vector((0, 0.10, 1.25))

    # ------------------------------------------------------------------ pieces
    def set_body(self, dz=0.0, pitch=0.0, roll=0.0, back=0.0, chest=0.0):
        """Body bob (m), pitch (+ = nose down), roll, and spine flexion (+ = back arches down)."""
        P = self.P; n = self.n
        R = Matrix.Rotation(-pitch, 4, 'X') @ Matrix.Rotation(roll, 4, 'Y')
        piv = self.root_pivot
        M = Matrix.Translation(piv + Vector((0, 0, dz))) @ R @ Matrix.Translation(-piv)
        P.set(n('Root'), M @ P.rest[n('Root')])
        for b, a in (('Back', back), ('Chest', chest)):
            pb = P.pb[n(b)]
            h = pb.head.copy()
            cur = pb.matrix.to_3x3()
            P.set(n(b), Matrix.Translation(h) @ (Matrix.Rotation(-a, 3, 'X') @ cur).to_4x4())

    def rotate_chain(self, names, angles, axis='X'):
        P = self.P
        for b, a in zip(names, angles):
            pb = P.pb[self.n(b)]
            h = pb.head.copy(); cur = pb.matrix.to_3x3()
            P.set(self.n(b), Matrix.Translation(h) @ (Matrix.Rotation(a, 3, axis) @ cur).to_4x4())

    def set_neck(self, pitch=(0, 0, 0), yaw=0.0):
        """pitch per Neck1, Neck2, Head (+ = down), yaw (+ = to the left) spread."""
        for b, a in zip(('Neck1', 'Neck2', 'Head'), pitch):
            self.rotate_chain([b], [-a], 'X')
        if yaw:
            self.rotate_chain(['Neck1', 'Neck2', 'Head'], [yaw * .4, yaw * .35, yaw * .25], 'Z')

    def set_tail(self, lift=0.0, swing=0.0):
        self.rotate_chain(['Tail1', 'Tail2'], [lift, lift * .6], 'X')
        if swing:
            self.rotate_chain(['Tail1', 'Tail2'], [swing, swing * 1.4], 'Z')

    def set_leg(self, leg, F, kappa=0.0, psi=0.0, toe=0.0):
        """Fetlock at F (world), middle joint flexed by kappa, pastern folded back by psi (rad)."""
        P = self.P; d = self.leg[leg]
        b = d['bones']; L = d['L']
        J0 = P.head(b[0])
        p0 = v2(J0); p3 = v2(F)
        alpha = max(.25, d['alpha'] - kappa)
        dd = math.sqrt(max(1e-9, L[1] ** 2 + L[2] ** 2 - 2 * L[1] * L[2] * math.cos(alpha)))
        # keep the target reachable
        reach = math.hypot(p3[0] - p0[0], p3[1] - p0[1])
        if reach > (L[0] + dd) * .999:
            self.clamps = getattr(self, 'clamps', 0) + 1
            self.worst = max(getattr(self, 'worst', 0.0), reach - (L[0] + dd) * .999)
            k = (L[0] + dd) * .999 / reach
            p3 = (p0[0] + (p3[0] - p0[0]) * k, p0[1] + (p3[1] - p0[1]) * k)
        p1 = circle_meet(p0, L[0], p3, dd, d['side1'])
        p2 = circle_meet(p1, L[1], p3, L[2], d['side2'])
        x0, x3 = J0.x, F.x
        tot = L[0] + L[1] + L[2]
        def to3(p, frac):
            return Vector((x0 + (x3 - x0) * frac, -p[0], p[1]))
        J1 = to3(p1, L[0] / tot); J2 = to3(p2, (L[0] + L[1]) / tot); J3 = to3(p3, 1.0)
        P.place(b[0], J0, J1); P.place(b[1], J1, J2); P.place(b[2], J2, J3)
        # pastern, hoof, toe: their rest world direction, folded back by psi (+ toe flick)
        R = Matrix.Rotation(psi, 3, 'X')
        head = J3
        for k, extra in ((3, 0.0), (4, toe), (5, toe)):
            rest = P.rest[b[k]]
            Rk = Matrix.Rotation(psi + extra * (k - 3), 3, 'X')
            P.set(b[k], Matrix.Translation(head) @ (Rk @ rest.to_3x3()).to_4x4())
            head = P.tail(b[k])

    def overshoot(self, leg, F, kappa=0.0):
        """How far (m) the fetlock target F is beyond the leg's reach from its current shoulder or hip."""
        d = self.leg[leg]; L = d['L']
        alpha = max(.25, d['alpha'] - kappa)
        dd = math.sqrt(max(1e-9, L[1] ** 2 + L[2] ** 2 - 2 * L[1] * L[2] * math.cos(alpha)))
        p0 = v2(self.P.head(d['bones'][0])); p3 = v2(F)
        return max(0.0, math.hypot(p3[0] - p0[0], p3[1] - p0[1]) - (L[0] + dd) * .995)

    def stance_fetlock(self, leg, s, x=None):
        """The fetlock of a planted hoof at forward position s (m, + = ahead of the rest stance)."""
        d = self.leg[leg]; J3 = d['J'][3]
        return Vector((J3.x if x is None else x, J3.y - s, d['sole']))


