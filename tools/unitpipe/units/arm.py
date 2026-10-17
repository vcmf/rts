"""An arm posed by its joints, with the weapon fixed in the fist: for blows, aims and parries.

A hand placed by a target point and a weapon direction, with the forearm left to the IK, bent the wrist
90 to 150 degrees in the sabre and pistol clips (a wrist manages about 60 in flexion and 20 to 35 to
the side). Here the arm leads and the weapon follows: an arm state gives

  az, el   the wrist's direction from the shoulder, in the chest's frame (degrees): az 0 is straight ahead,
           + to the arm's own side; el + is up
  r        the wrist's distance from the shoulder, as a share of the arm's length (under 1: never locked)
  sw       the elbow's swivel about the shoulder-wrist line (degrees): 0 hangs the elbow down, + takes it out
  pron     the forearm's turn (degrees): 0 is the handshake (thumb up when the forearm is level), + turns the
           palm down, within -85..90
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
PRON = (-85.0, 90.0)     # the forearm's turn from the handshake: supination (palm up) to pronation (palm down)


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
        chest's rotation Rc. Returns (wrist, elbow, fingers, palm, thumb, hand rotation for Biped)."""
        sh = self.shoulder()
        L = self.l1 + self.l2
        a = D(st['az']); e = D(st['el'])
        d_local = Vector((self.out * math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        d = (Rc @ d_local).normalized()
        dist = clamp(st['r'], .3, .97) * L
        wrist = sh + d * dist
        elbow, side_dir = self.elbow(d, dist, Rc, st['sw'])
        u = (elbow - sh).normalized(); y = (wrist - elbow).normalized()
        # the forearm's frame: its flexion axis; the handshake palm faces across the body's midline
        z = u.cross(y)
        if z.length < 1e-4:
            z = side_dir.cross(y)
        z.normalize()
        palm = z if self.side == 'Left' else -z      # the handshake: the palm faces across the body
        # the forearm's turn about its axis, then the wrist's bend (flexion about the thumb's axis, deviation
        # about the palm's normal)
        q = Quaternion(y, D(clamp(st['pron'], *PRON)) * (-1 if self.side == 'Right' else 1))   # + = pronation: the palm turns down
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

    def elbow(self, d, dist, Rc, sw):
        """The elbow for a wrist at `dist` along `d` from the shoulder, swivelled by sw degrees: 0 in the plane
        through the shoulder-wrist line holding "down", + out to the arm's side. Returns (elbow, the side's
        direction)."""
        sh = self.shoulder()
        down = Rc @ Vector((0, 0, -1))
        ref = down - d * down.dot(d)
        if ref.length < 1e-4:
            ref = Rc @ Vector((0, 1, 0)) - d * (Rc @ Vector((0, 1, 0))).dot(d)
        ref.normalize()
        # d x ref points to the body's left (+X): times `out`, to the arm's own side
        side_dir = d.cross(ref).normalized() * self.out
        pole_dir = (ref * math.cos(D(sw)) + side_dir * math.sin(D(sw))).normalized()
        along = (self.l1 ** 2 - self.l2 ** 2 + dist ** 2) / (2 * dist)
        return sh + d * along + pole_dir * math.sqrt(max(0.0, self.l1 ** 2 - along ** 2)), side_dir

    def easiest_elbow(self, wrist, fingers, Rc, memory):
        """Where the elbow goes for a hand placed by its wrist and fingers (a hand on a weapon in its scabbard or
        holster): the swivel whose forearm lines up best with the fingers, so the wrist bends least. `memory`
        (a dict) holds the last swivel, which is preferred, so the elbow does not flip between two near-equal
        places from one frame to the next."""
        sh = self.shoulder(); v = wrist - sh
        dist = clamp(v.length, abs(self.l1 - self.l2) + 1e-3, .999 * (self.l1 + self.l2)); d = v.normalized()
        last = memory.get('sw')
        best = None
        for sw in range(-30, 121, 3):
            e, _ = self.elbow(d, dist, Rc, sw)
            c = (sh + d * dist - e).angle(fingers) + (.004 * abs(sw - last) if last is not None else 0.0)
            if best is None or c < best[0]:
                best = (c, sw, e)
        memory['sw'] = best[1]
        return best[2]

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


WRIST_SOFT = 36.0        # past this bend of the hand off the forearm (degrees), a pose costs steeply (the check fails at 40)


def aim_wrist(arm, st, Rc, weapon, blade, up=None, swing=30, roll=25):
    """The elbow's swivel (within `swing` degrees of the state's), the forearm's turn, the wrist's bend and, for
    the sabre, its roll in the fingers (within `roll` degrees of the state's tilt) that point the weapon along
    `blade` (world), within the joints' limits, preferring a wrist near neutral and the authored swivel and roll;
    `up` asks the weapon's z axis to face that way. A coarse grid, then finer ones about the best. Returns the
    state with them set."""
    blade = Vector(blade).normalized()
    up = Vector(up).normalized() if up is not None else None
    sw0 = st['sw']; tilt0 = st.get('tilt', 18.0)
    tilts = [tilt0] if weapon != 'Sabre' or not roll else [clamp(tilt0 + k, 5, 70) for k in range(-roll, roll + 1, 5)]

    def cost(sw, p, fl, dv, tilt=None):
        s = dict(st, sw=sw, pron=p, flex=fl, dev=dv)
        wrist, elbow, f, n, t, Rh = arm.solve(s, Rc)
        if weapon == 'Sabre':
            tilt = tilt0 if tilt is None else tilt
            M = arm.sabre(wrist, f, n, t, D(tilt))
        else:
            M = arm.pistol(wrist, f, n, t)
        y = M.col[1].to_3d().normalized()
        bend = math.degrees((wrist - elbow).angle(f))
        # a pistol is aimed with the wrist straight: its wrist costs more than a sabre's
        c = (y.angle(blade) + (.6 if weapon == 'Pistol' else .15) * (abs(fl) / 60 + abs(dv) / 35) + .003 * abs(sw - sw0)
             + .05 * max(0.0, bend - WRIST_SOFT) + (.002 * abs(tilt - tilt0) if weapon == 'Sabre' else 0.0))
        if up is not None:
            c += .5 * M.col[2].to_3d().normalized().angle(up)
        return c

    def rng(lo, hi, c, step):
        return range(max(int(lo), int(c) - 3 * step), min(int(hi), int(c) + 3 * step) + 1, step)

    SW = (max(-30, sw0 - swing), min(120, sw0 + swing))
    best = None
    for sw in sorted({clamp(sw0 + k, *SW) for k in range(-swing, swing + 1, 15)}):
        for p in range(int(PRON[0]), int(PRON[1]) + 1, 15):
            for fl in range(-60, 61, 20):
                for dv in range(-20, 36, 11):
                    c = cost(sw, p, fl, dv)
                    if best is None or c < best[0]:
                        best = (c, sw, p, fl, dv)
    for step in (5, 2):
        _, s0, p0, f0, d0 = best
        for sw in rng(*SW, s0, step):
            for p in rng(*PRON, p0, step):
                for fl in rng(*FLEX, f0, step):
                    for dv in rng(*DEV, d0, step):
                        c = cost(sw, p, fl, dv)
                        if c < best[0]:
                            best = (c, sw, p, fl, dv)
    _, sw, p, fl, dv = best
    out = dict(st, sw=float(sw), pron=float(p), flex=float(fl), dev=float(dv))
    if len(tilts) > 1:                  # the roll in the fingers, for the arm found (then the wrist again, finely)
        tilt = min(tilts, key=lambda tl: cost(sw, p, fl, dv, tl))
        b2 = min(((sw, p2, f2, d2) for p2 in rng(*PRON, p, 2) for f2 in rng(*FLEX, fl, 2) for d2 in rng(*DEV, dv, 2)),
                 key=lambda a: cost(*a, tilt))
        out = dict(st, sw=float(sw), pron=float(b2[1]), flex=float(b2[2]), dev=float(b2[3]), tilt=float(tilt))
    return out
