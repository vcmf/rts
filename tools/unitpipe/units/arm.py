"""An arm posed by its joints, with the weapon fixed in the fist: for blows, aims and parries.

A hand placed by a target point and a weapon direction, with the forearm left to the IK, bent the wrist
90 to 150 degrees in the sabre and pistol clips (a wrist manages about 60 in flexion and 20 to 35 to
the side). Here the arm leads and the weapon follows: an arm state gives

  az, el   the wrist's direction from the shoulder, in the chest's frame (degrees): az 0 is straight ahead,
           + to the arm's own side; el + is up
  r        the wrist's distance from the shoulder, as a share of the arm's length (under 1: never locked)
  sw       the elbow's swivel about the shoulder-wrist line (degrees): 0 hangs the elbow down, + takes it out
  pron     the forearm's turn (degrees): 0 is the handshake (thumb up when the forearm is level), + turns the
           palm down
  flex     the wrist bent towards the palm (+) or the back of the hand (-), within +-60
  dev      the wrist bent towards the little finger (+, ulnar) or the thumb (-), within -20..35

Blending these numbers moves the hand on arcs about the shoulder, as an arm does. The weapon is held in a
fixed grip: the sabre's blade continues the thumb's line, its edge along the knuckles; the pistol's barrel
continues the fingers.
"""
import math
from mathutils import Vector, Matrix, Quaternion

D = math.radians
FLEX = (-60.0, 60.0)
DEV = (-20.0, 35.0)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


class Arm:
    def __init__(self, P, biped, side='Right'):
        self.P = P; self.B = biped; self.side = side
        n = biped.n
        self.upper = n(side + 'Arm'); self.lower = n(side + 'ForeArm')
        self.l1 = P.length[self.upper]; self.l2 = P.length[self.lower]
        self.out = -1.0 if side == 'Right' else 1.0       # the arm's own side, in the body's frame (+X is the left)
        h0 = biped.hand0[side]
        self.f0 = h0['M0'].col[0].copy(); self.n0 = h0['M0'].col[1].copy(); self.s0 = h0['s0']
        self.palm_len = h0['wrist_to_mid']

    def shoulder(self):
        return self.P.head(self.upper)

    def solve(self, st, Rc):
        """The wrist, the elbow pole and the hand's frame (fingers, palm, thumb) for an arm state, with the
        chest's rotation Rc. Returns (wrist, pole, fingers, palm, thumb, hand rotation for Biped)."""
        sh = self.shoulder()
        L = self.l1 + self.l2
        a = D(st['az']); e = D(st['el'])
        d_local = Vector((self.out * math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        d = (Rc @ d_local).normalized()
        dist = clamp(st['r'], .3, .97) * L
        wrist = sh + d * dist
        # the elbow: in the plane through the shoulder-wrist line holding "down" (swivel 0), turned by sw
        down = Rc @ Vector((0, 0, -1))
        ref = down - d * down.dot(d)
        if ref.length < 1e-4:
            ref = Rc @ Vector((0, 1, 0)) - d * (Rc @ Vector((0, 1, 0))).dot(d)
        ref.normalize()
        # + swivel takes the elbow out to the arm's side
        side_dir = d.cross(ref).normalized() * (-self.out)
        pole_dir = (ref * math.cos(D(st['sw'])) + side_dir * math.sin(D(st['sw']))).normalized()
        along = (self.l1 ** 2 - self.l2 ** 2 + dist ** 2) / (2 * dist)
        elbow = sh + d * along + pole_dir * math.sqrt(max(0.0, self.l1 ** 2 - along ** 2))
        u = (elbow - sh).normalized(); y = (wrist - elbow).normalized()
        # the forearm's frame: its flexion axis; the handshake palm faces across the body's midline
        z = u.cross(y)
        if z.length < 1e-4:
            z = side_dir.cross(y)
        z.normalize()
        palm = z if self.side == 'Left' else -z      # the handshake: the palm faces across the body
        thumb_dir = self.s0 * y.cross(palm)
        # the forearm's turn about its axis, then the wrist's bend (flexion about the thumb's axis, deviation
        # about the palm's normal)
        q = Quaternion(y, D(st['pron']) * (-1 if self.side == 'Right' else 1))   # + = pronation: the palm turns down
        f = q @ y; n = q @ palm
        t = self.s0 * f.cross(n)
        fl = D(clamp(st['flex'], *FLEX)); dv = D(clamp(st['dev'], *DEV))
        qf = Quaternion(t.normalized(), -fl * self.s0)   # towards the palm
        f = qf @ f; n = qf @ n
        qd = Quaternion(n.normalized(), dv * self.s0)    # towards the little finger
        f = qd @ f
        f.normalize(); n = (n - f * n.dot(f)).normalized(); t = (self.s0 * f.cross(n)).normalized()
        Rh = self.B.hand_rot(self.side, f, n)
        return wrist, elbow, f, n, t, Rh

    def palm_centre(self, wrist, f, n):
        return wrist + f * (1.45 * self.palm_len) + n * (.45 * self.palm_len)

    def sabre(self, wrist, f, n, t, tilt=D(18)):
        """The sabre in a hammer grip: the blade continues the thumb's line, leaning a little towards the
        fingers; its flat faces the palm, its edge along the knuckles."""
        y = (t * math.cos(tilt) + f * math.sin(tilt)).normalized()
        x = n - y * n.dot(y); x.normalize(); z = x.cross(y)
        M = Matrix((x, y, z)).transposed().to_4x4(); M.translation = self.palm_centre(wrist, f, n)
        return M

    def hand_on_pistol(self, M, rise=D(10)):
        """The hand that holds the pistol at M with this module's grip (the inverse of pistol()): its wrist and
        its rotation for the biped. Used where the pistol is placed first (in its holster)."""
        y = M.col[1].to_3d().normalized(); z = M.col[2].to_3d().normalized()
        f = (y * math.cos(rise) - z * math.sin(rise)).normalized()      # the barrel is the fingers raised by `rise`
        t = (z - f * z.dot(f)).normalized()
        n = (t.cross(f) * self.s0).normalized()                           # t = s0 * f x n
        wrist = M.to_translation() - f * (1.45 * self.palm_len) - n * (.45 * self.palm_len)
        return wrist, self.B.hand_rot(self.side, f, n)

    def pistol(self, wrist, f, n, t, rise=D(10)):
        """The pistol: the barrel continues the fingers, raised a little; the lock's top along the thumb."""
        y = (f * math.cos(rise) + t * math.sin(rise)).normalized()
        z = t - y * t.dot(y); z.normalize(); x = y.cross(z)
        M = Matrix((x, y, z)).transposed().to_4x4(); M.translation = self.palm_centre(wrist, f, n)
        return M


def aim_wrist(arm, st, Rc, weapon, blade, up=None):
    """The forearm's turn and the wrist's bend (pron, flex, dev) that point the weapon along `blade` (world),
    within the wrist's limits, preferring a wrist near neutral; for the pistol, `up` asks the lock's top to
    face that way. A coarse grid, then a finer one about the best. Returns the state with them set."""
    blade = Vector(blade).normalized()
    up = Vector(up).normalized() if up is not None else None

    def cost(p, fl, dv):
        s = dict(st, pron=p, flex=fl, dev=dv)
        wrist, elbow, f, n, t, Rh = arm.solve(s, Rc)
        M = arm.sabre(wrist, f, n, t, D(st.get('tilt', 18))) if weapon == 'Sabre' else arm.pistol(wrist, f, n, t)
        y = M.col[1].to_3d().normalized()
        # a pistol is aimed with the wrist straight: its wrist costs more than a sabre's
        c = y.angle(blade) + (.6 if weapon == 'Pistol' else .15) * (abs(fl) / 60 + abs(dv) / 35)
        if up is not None:
            c += .5 * M.col[2].to_3d().normalized().angle(up)
        return c

    best = None
    for p in range(-90, 181, 15):
        for fl in range(-60, 61, 20):
            for dv in range(-20, 36, 11):
                c = cost(p, fl, dv)
                if best is None or c < best[0]:
                    best = (c, p, fl, dv)
    for step in (5, 2):
        _, p0, f0, d0 = best
        for p in range(p0 - 3 * step, p0 + 3 * step + 1, step):
            for fl in range(max(-60, f0 - 3 * step), min(60, f0 + 3 * step) + 1, step):
                for dv in range(max(-20, d0 - 3 * step), min(35, d0 + 3 * step) + 1, step):
                    c = cost(p, fl, dv)
                    if c < best[0]:
                        best = (c, p, fl, dv)
    _, p, fl, dv = best
    return dict(st, pron=float(p), flex=float(fl), dev=float(dv))
