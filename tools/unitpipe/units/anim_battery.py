"""Step 4 for the battery: the gun drill of a field piece with a crew of four.

blender -b battery-combined.blend -P anim_battery.py [-- Clip,Clip]  ->  battery-animated.blend, battery-clips.json

Clips (24 fps):
  Idle   loop at the loading posts
  Load   sponge, load, ram, prime and lay; ends with the crew clear of the recoil (fire posts)
  Ready  loop at the fire posts: the linstock raised, waiting for the order
  Fire   the shot, the recoil, the run-up by hand, back to the loading posts
Idle -> Load -> Ready -> Fire -> Load (or Idle). The game holds Ready as long as it wants.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
ROOT = Path(bpy.data.filepath).parent            # the work folder, where the combined blend is
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unitkit as K, biped, crew
from biped import fwd, Rz
from timeline import Actor, Prop, lateral
from battery_layout import POSTS

D = math.radians
rig = bpy.data.objects['BatteryRig']
info = json.loads((ROOT / 'battery-combined.json').read_text())
gun = info['gun']
grip0 = json.loads((ROOT / 'gunner-prep.json').read_text())['grip']
P = K.Poser(rig)
M0 = Vector(gun['muzzle']); A = Vector(gun['axis']).normalized()     # muzzle centre; axis muzzle -> breech
VENT = Vector(gun['vent']); R_WHEEL = gun['wheel_radius']
HUB_R = Vector(gun['hubs'][0]); HUB_L = Vector(gun['hubs'][1])
LS = info['staff']['length']
UP = Vector((0, 0, 1))
READY = POSTS['ready']; FIREP = POSTS['fire']
ROLES = list(READY)


def staff_bore(D_, rammer=False):
    """The staff along the bore: sponge end (or rammer end) D_ metres inside the muzzle."""
    if not rammer:
        bottom = M0 + A * (D_ - LS); u = A
    else:
        bottom = M0 + A * D_; u = -A
    return crew.prop_matrix(bottom, u, UP)


def staff_at_side(x, y, yaw, side=-1, fwd_off=.12, out=.28, lift=.02):
    f = fwd(yaw); l = lateral(yaw)
    return crew.prop_matrix(Vector((x, y, 0)) + l * out * side + f * fwd_off + Vector((0, 0, lift)), UP, f)


def linstock_at_side(x, y, yaw, out=.30, fwd_off=.15):
    f = fwd(yaw); l = lateral(yaw)
    return crew.prop_matrix(Vector((x, y, 0)) - l * out + f * fwd_off, Vector((0, 0, 1)) + f * .08, f)


def linstock_to(tip, from_dir, length=info['linstock']['match']):
    """The linstock with its match at `tip`, its butt back along from_dir."""
    d = Vector(from_dir).normalized()
    return crew.prop_matrix(Vector(tip) - d * length, d, UP)


def actors_at(posts):
    acts = {}
    for r in ROLES:
        x, y, yaw = posts.get(r, READY[r])
        b = biped.Biped(P, r + ':', READY[r][2], grip0)
        p = crew.stand(x, y, yaw)
        crew.hang(p, 'Left'); crew.hang(p, 'Right')
        acts[r] = Actor(b, p)
    return acts


def idle_staff_hands(a, f, yaw=None):
    """The sponger's resting hold: right fist round the staff at his side."""
    yaw = READY['Sponger'][2] if yaw is None else yaw
    a.key(f, hands={'Right': ('rod', 'Staff', grip0['along'], -fwd(yaw) + lateral(yaw) * .3, 1, 0.0)})


def staff_side_of(h):
    """The staff at the sponger's right side, for his hips h (carried while he walks)."""
    return staff_at_side(h[0].x, h[0].y, h[1])


def linstock_side_of(h):
    return linstock_at_side(h[0].x, h[0].y, h[1])


def linstock_hold(a, f, s=.95):
    x, y, yaw = READY['Firer']
    a.key(f, hands={'Right': ('rod', 'Linstock', s, -fwd(yaw) + lateral(yaw) * .3, 1, 0.0)})


class Clip:
    def __init__(self, name, frames, loop, posts_start):
        self.name = name; self.frames = frames; self.loop = loop
        self.A = actors_at(posts_start)
        x, y, yaw = posts_start.get('Sponger', READY['Sponger'])
        self.props = {'Staff': Prop('Staff', staff_at_side(x, y, yaw)),
                      'Linstock': Prop('Linstock', linstock_at_side(*READY['Firer'])),
                      'Cartridge': Prop('Cartridge', crew.prop_matrix(self.pouch(), UP), 0.0)}
        idle_staff_hands(self.A['Sponger'], 0, yaw)
        linstock_hold(self.A['Firer'], 0)
        self.gun_y = [(0, 0.0, 'smooth')]      # recoil (m, +Y = back)
        self.kick = [(0, 0.0, 'smooth')]       # barrel elevation change (rad, + = muzzle up)
        self.events = {}

    @staticmethod
    def pouch():
        """Where the loader's cartridge waits, hidden (scale 0): at his pouch."""
        lx, ly, lyaw = READY['Loader']
        return Vector((lx, ly, 0)) + fwd(lyaw) * .18 - lateral(lyaw) * .12 + Vector((0, 0, .95))

    def gun_at(self, f):
        def samp(keys):
            if f <= keys[0][0]: return keys[0][1]
            for a, b in zip(keys, keys[1:]):
                if f <= b[0]:
                    from timeline import ease
                    t = ease(b[2], (f - a[0]) / max(1e-9, b[0] - a[0]))
                    return a[1] + (b[1] - a[1]) * t
            return keys[-1][1]
        return samp(self.gun_y), samp(self.kick)

    def solve(self, f):
        y, kick = self.gun_at(f)
        gm = Matrix.Translation(Vector((0, y, 0)))
        P.set('Gun', gm @ P.rest['Gun'])
        tr = P.rest['Barrel']
        P.set('Barrel', gm @ Matrix.Translation(tr.to_translation()) @ Matrix.Rotation(-kick, 4, 'X') @ Matrix.Translation(-tr.to_translation()) @ tr)
        for wn, sgn in (('WheelL', -1), ('WheelR', 1)):
            r = P.rest[wn]
            P.set(wn, gm @ r @ Matrix.Rotation(sgn * y / R_WHEEL, 4, 'Y'))
        props = {}
        for n, pr in self.props.items():
            M, sc = pr.sample(f)
            props[n] = M
            P.set(n, M @ Matrix.Diagonal((max(sc, .001),) * 3).to_4x4())
        for r, a in self.A.items():
            a.B.set_pose(a.pose_at(f, props), props)
        return props

    def build(self):
        act = K.new_action(rig, self.name)
        for f in range(1, self.frames + 1):
            P.reset()
            self.solve(f - 1)
            P.key_all(f)
        K.finish_action(rig, act, self.frames)
        return act


# ------------------------------------------------------------------ the clips

def settle(c, f, posts):
    """Key every actor's body exactly as it stands at the start of a clip from these posts (their feet
    must already be there: walk them to their posts first)."""
    ref = actors_at(posts)
    idle_staff_hands(ref['Sponger'], 0, posts.get('Sponger', READY['Sponger'])[2]); linstock_hold(ref['Firer'], 0)
    for r, a in c.A.items():
        b = ref[r].keys[0][1]
        a.key(f, **{k: v for k, v in b.items()})


def hips_of(a, f):
    return a.body_at_key(f)['hips']


def body(a, f, x, y, yaw, lean=0.0, crouch=0.0, chest=(0, 0, 0), head=(0, 0), **kw):
    h = hips_of(a, f)
    a.key(f, hips=(Vector((x, y, crew.HIP - crouch)), yaw, lean, 0.0), chest=chest, head=head, **kw)


def breathe(a, f0, f1, amp=.025):
    h = hips_of(a, f0)
    mid = (f0 + f1) // 2
    pos, yaw, lean, roll = h
    a.key(mid, hips=(pos + Vector((0, 0, -.006)), yaw, lean + amp, roll), chest=(0, amp, 0))
    a.key(f1, hips=h, chest=(0, 0, 0))


def make_idle():
    c = Clip('Idle', 72, True, {})
    S, L, V, F = (c.A[r] for r in ROLES)
    for i, (r, a) in enumerate(c.A.items()):
        a.hold(0)
        breathe(a, 0, 71, .02 + .008 * i)
    # the loader turns to look down the range and back; the ventsman glances at the sponger
    lx, ly, lyaw = READY['Loader']
    L.walk(8, 22, (lx, ly), D(-35)); L.key(22, head=(D(-10), D(-3)))
    L.walk(44, 60, (lx, ly), lyaw); L.key(60, head=(0, 0))
    V.key(18, head=(D(-35), D(2))); V.key(46, head=(D(-35), D(2))); V.key(60, head=(0, 0))
    S.key(30, head=(D(-25), D(4))); S.key(52, head=(0, 0))
    F.key(26, head=(D(20), 0)); F.key(50, head=(0, 0))
    for a in (S, L, V, F):
        a.key(71, head=(0, 0))
    c.props['Staff'].hold(71); c.props['Linstock'].hold(71)
    return c


def outer_y(D_, rammer=False):
    """y of the staff's outer end for a sponge (or rammer) D_ m inside the muzzle."""
    return (M0 + A * (D_ - LS)).y if not rammer else (M0 + A * D_ - A * LS).y


def hand_y(D_, s, rammer=False):
    """y of the point s m along the staff (from its bottom) when it is D_ m into the bore."""
    if not rammer:
        return (M0 + A * (D_ - LS) + A * s).y        # bottom outside, sponge in
    return (M0 + A * D_ - A * s).y                   # rammer (bottom) in


def make_load():
    c = Clip('Load', 240, False, {})
    S, L, V, F = (c.A[r] for r in ROLES)
    st = c.props['Staff']; ca = c.props['Cartridge']; li = c.props['Linstock']
    # ---- the sponger: he faces the muzzle with the staff along his right side, pushes it in walking
    # after it, turns it end for end, rams the same way, and goes back to his post
    sx, sy, syaw = READY['Sponger']
    WY = D(165)                              # facing the muzzle (+Y), turned a little to the staff
    wf = fwd(WY); wl = lateral(WY)           # his left is -X: the staff (x = 0) is on his right
    toward = wl                              # wrists on his side of the staff
    XS = -0.40                               # where he stands across the line of the bore

    def at(y_hand_rear):                     # his hips for a rear (right) hand at this y
        return (XS, y_hand_rear - .14)

    S.hold(12); st.hold(12)
    sp = at(hand_y(-.02, .30))
    S.walk(12, 32, sp, WY)                   # turns into the path, walks, turns to the muzzle
    st.carry(12, 26, S, staff_side_of)
    st.key(36, staff_bore(-.02))
    sponge = lambda: {'Right': ('rod', 'Staff', .30, toward, 1, 0.0), 'Left': ('rod', 'Staff', .64, toward, 1, 0.0)}
    S.key(36, chest=(D(-12), D(8), 0), hands=sponge(), curl={'Left': .9})
    # in: the staff slides 0.77 m into the bore, he walks after it
    st.key(56, staff_bore(.75))
    S.walk(38, 56, at(hand_y(.75, .30)), WY)
    S.key(56, chest=(D(-12), D(14), 0))
    for k, d in enumerate((.62, .78, .62, .76)):        # scrub
        st.key(60 + 5 * k, staff_bore(d))
    st.key(86, staff_bore(-.06))
    S.walk(72, 88, at(hand_y(-.06, .30)), WY)
    S.key(88, chest=(D(-10), D(8), 0))
    # end for end: up to vertical before him, then down with the rammer to the muzzle
    h = Vector(at(hand_y(-.06, .30)) + (0,))
    top = h + wf * .38 - wl * .12 + Vector((0, 0, .25))
    st.key(100, crew.prop_matrix(top, UP, wf))
    S.key(100, chest=(D(-4), D(4), 0), hands={'Right': ('rod', 'Staff', .55, -wf, 1, 0.0), 'Left': ('rod', 'Staff', .92, -wf, 1, 0.0)})
    st.key(114, staff_bore(-.12, rammer=True))
    ram = lambda: {'Right': ('rod', 'Staff', 1.18, toward, -1, 0.0), 'Left': ('rod', 'Staff', .84, toward, -1, 0.0)}
    S.key(114, chest=(D(-12), D(8), 0), hands=ram())
    S.hold(130); st.hold(130)
    # ram home: walks it in, two short strokes, out again
    st.key(146, staff_bore(.80, rammer=True))
    S.walk(130, 146, at(hand_y(.80, 1.18, True)), WY)
    S.key(146, chest=(D(-12), D(16), 0))
    hx, hy = at(hand_y(.80, 1.18, True))
    st.key(152, staff_bore(.62, rammer=True)); S.key(152, hips=(Vector((hx, hy - .16, crew.HIP)), WY, D(4), 0.0))
    st.key(160, staff_bore(.92, rammer=True)); S.key(160, hips=(Vector((hx, hy + .12, crew.HIP - .03)), WY, D(14), 0.0))
    st.key(180, staff_bore(-.12, rammer=True))
    S.walk(164, 180, at(hand_y(-.12, 1.18, True)), WY)
    S.key(180, chest=(D(-8), D(6), 0))
    # staff upright, sponge up, to his side; back to his post and turned down the range (fire post)
    st.key(194, crew.prop_matrix(top, UP, wf))
    S.key(194, chest=(0, 0, 0), hands={'Right': ('rod', 'Staff', .55, -wf, 1, 0.0), 'Left': ('rod', 'Staff', .92, -wf, 1, 0.0)})
    S.key(204, hands={'Right': ('rod', 'Staff', grip0['along'], -wf + wl * .3, 1, 0.0), 'Left': ('hang', 0.0, .06)}, curl={'Left': 0.0})
    st.key(204, staff_at_side(h.x, h.y, WY))
    fsx, fsy, fsyaw = FIREP['Sponger']
    S.walk(206, 234, (fsx, fsy), fsyaw)
    st.carry(204, 239, S, staff_side_of)
    idle_staff_hands(S, 234, fsyaw)
    # ---- the loader: a cartridge from his pouch into the muzzle
    lx, ly, lyaw = READY['Loader']
    lf = fwd(lyaw); ll = lateral(lyaw)       # faces -X; his left is -Y
    L.hold(60)
    L.walk(60, 70, (lx, ly), lyaw + D(-30))  # half turns to reach his pouch
    pouch = Vector((lx, ly, 0)) + lf * .18 - ll * .12 + Vector((0, 0, .95))
    ca.key(66, crew.prop_matrix(pouch, -ll * .3 + UP, lf), 0.0, 'snap')
    L.key(78, chest=(0, D(10), 0), head=(0, D(20)), hands={'Right': ('rod', 'Cartridge', .12, -lf + UP * .3, 1, .03)})
    ca.key(78, crew.prop_matrix(pouch, -ll * .3 + UP, lf), 0.0, 'snap')
    ca.key(80, crew.prop_matrix(pouch, -ll * .3 + UP, lf), 1.0, 'snap')
    LY = lyaw + D(-50)                       # ahead of the muzzle, facing the bore
    lf2 = fwd(LY)
    held = Vector((0.50, -2.66, 0)) + lf2 * .30 + Vector((0, 0, 1.15))
    ca.key(104, crew.prop_matrix(held, Vector((0, 1, 0)), UP))
    L.key(92, chest=(0, D(4), 0), head=(0, D(15)), hands={'Right': ('rod', 'Cartridge', .08, -lf, 1, .03), 'Left': ('rod', 'Cartridge', .19, -lf, -1, .03)},
          curl={'Left': .8})
    L.walk(84, 104, (0.50, -2.66), LY)
    # into the muzzle, ball first, pushed home with the right hand
    ca.key(116, crew.prop_matrix(M0 - A * .30, A, UP))
    L.key(104, hands={'Right': ('rod', 'Cartridge', .08, -lf2, 1, .03), 'Left': ('rod', 'Cartridge', .19, -lf2, -1, .03)})
    L.key(116, chest=(D(-4), D(8), 0), head=(D(-4), D(16)), hands={'Right': ('rod', 'Cartridge', .06, -lf2, 1, .03), 'Left': ('rod', 'Cartridge', .18, -lf2, -1, .03)})
    ca.key(126, crew.prop_matrix(M0 + A * .04, A, UP), 1.0)
    L.key(126, chest=(D(-4), D(12), 0), hands={'Right': ('rod', 'Cartridge', .02, -lf2, 1, .03), 'Left': ('hang', D(10), .08)}, curl={'Left': 0.0})
    ca.key(127, crew.prop_matrix(M0 + A * .3, A, UP), 0.0, 'snap')
    ca.key(128, crew.prop_matrix(Clip.pouch(), UP), 0.0, 'snap')     # hidden: parked at the pouch
    ca.hold(239)
    L.key(132, hands={'Right': ('hang', D(5), .06)}, chest=(0, D(4), 0), head=(0, D(5)))
    flx, fly, flyaw = FIREP['Loader']
    L.walk(134, 156, (flx, fly), lyaw)       # back to his post...
    L.key(156, chest=(0, 0, 0), head=(D(-20), D(5)))
    L.walk(214, 232, (flx, fly), flyaw)      # ...and turned down the range for the shot
    # ---- the ventsman: thumb on the vent, prick, prime, lay the gun, then clear of the recoil
    vx, vy, vyaw = READY['Ventsman']
    vf = fwd(vyaw); vl = lateral(vyaw)
    V.hold(10)
    thumb = VENT + vf * -.06 + Vector((0, 0, .055))
    V.key(26, chest=(D(10), D(22), 0), head=(D(5), D(25)),
          hands={'Left': ('wrist', thumb, vf + Vector((0, 0, -.6)), -UP)})
    V.key(26, hips=(Vector((vx, vy, crew.HIP - .03)), vyaw, D(10), 0.0))
    V.hold(128)
    V.key(140, hands={'Left': ('hang', D(6), .07)}, chest=(D(4), D(14), 0))
    prick = VENT + vf * -.05 + Vector((0, 0, .09))
    V.key(152, chest=(D(-6), D(24), 0), hands={'Right': ('wrist', prick, -UP + vf * .3, vf)}, head=(0, D(30)))
    for k in range(3):
        V.key(156 + 6 * k, hands={'Right': ('wrist', prick + Vector((0, 0, -.035)), -UP + vf * .3, vf)})
        V.key(159 + 6 * k, hands={'Right': ('wrist', prick, -UP + vf * .3, vf)})
    V.key(180, hands={'Right': ('wrist', prick + Vector((0, 0, -.02)), -UP + vf * .3, vf)})
    # lay: steps behind the breech, faces down the barrel, bends to sight along it
    V.key(184, hands={'Right': ('hang', 0, .06)}, chest=(0, D(6), 0), head=(0, D(5)))
    V.walk(184, 196, (0.16, 0.42), D(0))
    V.key(202, hips=(Vector((0.16, 0.42, crew.HIP - .22)), D(0), D(26), 0.0), chest=(0, D(16), 0), head=(0, D(-30)),
          hands={'Right': ('wrist', Vector((-.10, .02, 1.02)), Vector((0, -1, -.4)), -UP), 'Left': ('wrist', Vector((.12, .02, 1.02)), Vector((0, -1, -.4)), -UP)})
    V.hold(208)
    V.key(214, hips=(Vector((0.16, 0.42, crew.HIP)), D(0), 0.0, 0.0), chest=(0, 0, 0), head=(0, 0),
          hands={'Right': ('hang', 0, .06), 'Left': ('hang', 0, .06)})
    fx, fy, fyaw = FIREP['Ventsman']
    V.walk(214, 226, (1.25, 0.62), D(-110))  # round the back of the left wheel...
    V.walk(226, 238, (fx, fy), fyaw)         # ...out clear of the recoil, turned to watch the shot
    # ---- the firer: watches the loading, then raises the linstock
    F.key(40, head=(D(-30), D(5))); F.key(120, head=(D(-30), D(5))); F.key(150, head=(D(10), D(5)))
    F.key(200, head=(0, 0)); li.hold(200)
    x, y, yaw = READY['Firer']
    ff = fwd(yaw); fl = lateral(yaw)
    ready_tip = Vector((x, y, 0)) + ff * .55 - fl * .25 + Vector((0, 0, 1.55))
    li.key(222, linstock_to(ready_tip, ff * .35 + UP))
    F.key(222, hands={'Right': ('rod', 'Linstock', .55, -ff + fl * .2, 1, 0.0), 'Left': ('rod', 'Linstock', .25, -ff - fl * .2, 1, 0.0)}, curl={'Left': .9},
          head=(D(-8), D(10)))
    settle(c, 239, FIREP)
    fire_ready(c, 239)
    c.events = {'cartridge_out': 80 + 1, 'cartridge_in': 127 + 1}     # 1-based frames: key k is frame k + 1
    return c


def fire_ready(c, f):
    """The waiting-to-fire state (end of Load, the Ready loop, start of Fire): the linstock raised."""
    x, y, yaw = READY['Firer']
    ff = fwd(yaw); fl = lateral(yaw)
    ready_tip = Vector((x, y, 0)) + ff * .55 - fl * .25 + Vector((0, 0, 1.55))
    c.props['Linstock'].key(f, linstock_to(ready_tip, ff * .35 + UP))
    c.props['Staff'].key(f, staff_at_side(*FIREP['Sponger']))
    c.A['Firer'].key(f, hands={'Right': ('rod', 'Linstock', .55, -ff + fl * .2, 1, 0.0), 'Left': ('rod', 'Linstock', .25, -ff - fl * .2, 1, 0.0)},
                     curl={'Left': .9}, head=(D(-8), D(10)))
    c.A['Loader'].key(f, head=(D(-15), D(-4)))
    c.A['Sponger'].key(f, head=(D(15), D(-4)))
    return ready_tip


def fire_posts_clip(name, frames, loop):
    c = Clip(name, frames, loop, FIREP)
    tip = fire_ready(c, 0)
    return c, tip


def make_ready():
    c, tip = fire_posts_clip('Ready', 48, True)
    for i, a in enumerate(c.A.values()):
        breathe(a, 0, 47, .015 + .006 * i)
    c.props['Staff'].hold(47); c.props['Linstock'].hold(47)
    return c


def rim(hub, gy, theta, side_out):
    """A point on the outside of a wheel's rim, theta from the top towards the rear (rad)."""
    r = R_WHEEL * .93
    return Vector((hub.x + side_out * .07, hub.y + gy + math.sin(theta) * r, hub.z + math.cos(theta) * r))


def push_hands(hub, gy, th_hi, th_lo, side_out):
    """Both hands on the upper rear of the rim, pushing it forward and down (the wheel rolls forward)."""
    out = {}
    near = 'Left' if side_out < 0 else 'Right'    # the hand on the wheel's side takes the upper grip
    far = 'Right' if near == 'Left' else 'Left'
    for side, th in ((near, th_hi), (far, th_lo)):
        p = rim(hub, gy, th, side_out)
        palm = Vector((0, -math.cos(th), math.sin(th)))           # the rim's forward direction there
        fingers = Vector((-side_out, 0, 0)) - palm * .2 + Vector((0, 0, -.3))
        out[side] = ('wrist', p - fingers.normalized() * .07 + palm * -.035 + Vector((side_out * .03, 0, 0)), fingers, palm)
    return out


def make_fire():
    c, tip = fire_posts_clip('Fire', 166, False)
    S, L, V, F = (c.A[r] for r in ROLES)
    li = c.props['Linstock']; st = c.props['Staff']
    SHOT = 14
    x, y, yaw = READY['Firer']
    ff = fwd(yaw); fl = lateral(yaw)
    # the firer lunges, the match to the vent
    F.step('Left', 0, 9, Vector((x, y, 0)) + ff * .42 + fl * .12, yaw + .1)
    F.key(10, hips=(Vector((x, y, crew.HIP - .08)) + ff * .22, yaw, D(18), 0.0), chest=(D(-5), D(12), 0), head=(D(-5), D(18)))
    li.key(11, linstock_to(VENT + Vector((0, 0, .025)), VENT - (Vector((x, y, 1.15)) + ff * .45)))
    li.key(SHOT + 1, ease_kind='linear')
    # the shot: recoil, a kick of the barrel, the crew flinch and look down the range
    c.gun_y += [(SHOT, 0.0, 'linear'), (SHOT + 12, 1.0, 'out')]
    c.kick += [(SHOT, 0.0, 'linear'), (SHOT + 3, D(2.5), 'out'), (SHOT + 10, 0.0, 'smooth')]
    F.key(SHOT + 10, hips=(Vector((x, y, crew.HIP - .02)), yaw, D(-4), 0.0), chest=(D(10), D(-4), 0), head=(D(25), D(-5)))
    F.step('Left', SHOT + 2, SHOT + 10, Vector((x, y, 0)) + fl * .12, yaw + .12)
    li.key(SHOT + 12, linstock_to(Vector((x, y, 0)) + ff * .3 - fl * .3 + Vector((0, 0, 1.5)), UP * .8 + ff * .2))
    for r, a in (('Sponger', S), ('Loader', L), ('Ventsman', V)):
        h = hips_of(a, 0)
        a.key(SHOT, head=a.body_at_key(SHOT)['head'])
        a.key(SHOT + 4, hips=(h[0] + Vector((0, 0, -.03)), h[1], D(-5), h[3]), head=(D(18), D(-6)), chest=(D(8), D(-3), 0))
        a.key(SHOT + 16, hips=h, head=(0, D(-4)), chest=(0, 0, 0))
    # the run-up by hand: the firer (right wheel) and the loader (left wheel) stand just behind their
    # wheels, outside them, leaning in, both hands on the upper rear of the rim; two strokes of half a
    # metre each, the hands riding the rim as it turns, a regrip between
    HUB = {-1: HUB_R, 1: HUB_L}
    PUSH = {-1: Vector((HUB_R.x - .50, HUB_R.y + 1.0 + .88, 0)), 1: Vector((HUB_L.x + .55, HUB_L.y + 1.0 + .88, 0))}
    PY = {-1: D(12), 1: D(-12)}              # facing forward (-Y), turned a little in towards the wheel
    G0, G1, G2, G3 = 64, 82, 88, 106
    c.gun_y += [(G0, 1.0, 'smooth'), (G1, .52, 'smooth'), (G2, .47, 'linear'), (G3, 0.0, 'smooth')]
    TH_HI, TH_LO = D(12), D(58)
    # the firer plants his linstock (its iron spike) behind, then goes to the right wheel
    plant = Vector((-1.95, 1.55, 0))
    F.walk(SHOT + 12, 44, (-1.78, 1.30), D(150))
    li.carry(SHOT + 14, 40, F, linstock_side_of)
    li.key(48, crew.prop_matrix(plant, UP + Vector((0, .05, 0)), Vector((0, -1, 0))))
    F.key(40, hands={'Right': ('rod', 'Linstock', .95, -fwd(D(150)) + lateral(D(150)) * .3, 1, 0.0)})
    F.key(48, hips=(Vector((-1.78, 1.30, crew.HIP - .12)), D(150), D(25), 0.0), hands={'Right': ('rod', 'Linstock', .80, -fwd(D(150)), 1, 0.0)})
    F.key(52, hips=(Vector((-1.78, 1.30, crew.HIP)), D(150), 0.0, 0.0), hands={'Right': ('hang', 0.0, .06)})
    F.walk(52, 62, PUSH[-1], PY[-1])
    lfx, lfy, lfyaw = FIREP['Loader']
    L.walk(SHOT + 6, 38, (1.62, -0.80), D(170))       # round the left wheel
    L.walk(38, 60, PUSH[1], PY[1])
    for a, so in ((F, -1), (L, 1)):
        hub = HUB[so]; P0 = PUSH[so]
        lean = dict(chest=(D(-12 * so), D(16), 0), head=(D(-8 * so), D(-10)), curl={'Left': .6, 'Right': .6})
        a.key(64, hips=(Vector((P0.x, P0.y, crew.HIP - .10)), PY[so], D(22), 0.0), hands=push_hands(hub, 1.0, TH_HI, TH_LO, so), **lean)
        # stroke one: hands ride the rim
        for f in range(G0 + 3, G1 + 1, 3):
            gy = c.gun_at(f)[0]; turn = (1.0 - gy) / R_WHEEL
            a.key(f, hands=push_hands(hub, gy, TH_HI - turn, TH_LO - turn, so))
        a.walk(G0 + 2, G1, (P0.x, P0.y - .48), PY[so], step_len=.6, face_travel=False)
        a.key(G1, hips=(Vector((P0.x, P0.y - .48, crew.HIP - .10)), PY[so], D(22), 0.0))
        # regrip
        gy = c.gun_at(G2)[0]
        a.key(G1 + 3, hands={k: (v[0], v[1] + Vector((0, .08, .06)), v[2], v[3]) for k, v in push_hands(hub, gy, TH_HI, TH_LO, so).items()})
        a.key(G2, hands=push_hands(hub, gy, TH_HI, TH_LO, so))
        for f in range(G2 + 3, G3 + 1, 3):
            g = c.gun_at(f)[0]; turn = (gy - g) / R_WHEEL
            a.key(f, hands=push_hands(hub, g, TH_HI - turn, TH_LO - turn, so))
        a.walk(G2 + 2, G3, (P0.x, P0.y - 1.0), PY[so], step_len=.6, face_travel=False)
        a.key(G3, hips=(Vector((P0.x, P0.y - 1.0, crew.HIP - .10)), PY[so], D(22), 0.0))
        a.key(G3 + 6, hips=(Vector((P0.x, P0.y - 1.0, crew.HIP)), PY[so], 0.0, 0.0), chest=(0, 0, 0), head=(0, 0),
              hands={'Left': ('hang', 0, .06), 'Right': ('hang', 0, .06)}, curl={'Left': 0.0, 'Right': 0.0})
    # back to the loading posts, facing where they walk
    lx, ly, lyaw = READY['Loader']
    L.walk(G3 + 8, 128, (1.45, -1.35), D(160))
    L.walk(128, 152, (lx, ly), lyaw)
    F.walk(G3 + 8, 126, (-1.78, 1.30), D(150))
    F.key(126, hips=(Vector((-1.78, 1.30, crew.HIP)), D(150), 0.0, 0.0))
    F.key(130, hips=(Vector((-1.78, 1.30, crew.HIP - .12)), D(150), D(25), 0.0), hands={'Right': ('rod', 'Linstock', .80, -fwd(D(150)), 1, 0.0)})
    li.hold(130)
    F.key(134, hips=(Vector((-1.78, 1.30, crew.HIP)), D(150), 0.0, 0.0), hands={'Right': ('rod', 'Linstock', .95, -fwd(D(150)) + lateral(D(150)) * .3, 1, 0.0)})
    li.key(136, linstock_side_of(F.hips_at(134)))
    F.walk(136, 156, (x, y), yaw)
    li.carry(136, 165, F, linstock_side_of)
    vx, vy, vyaw = READY['Ventsman']
    V.walk(124, 140, (1.30, 0.62), D(120))   # behind the loader, round the back of the left wheel
    V.walk(140, 158, (vx, vy), vyaw)
    # the sponger turns back to face the gun
    sx, sy, syaw = READY['Sponger']
    S.walk(120, 138, (sx, sy), syaw)
    st.carry(118, 165, S, staff_side_of)
    settle(c, 165, {})
    c.events = {'shot': SHOT + 1}                 # 1-based: the recoil starts at key SHOT
    return c


CLIPS = {'Idle': make_idle, 'Load': make_load, 'Ready': make_ready, 'Fire': make_fire}
if __name__ == '__main__':
    want = K.args()[0].split(',') if K.args() else list(CLIPS)
    meta = {}
    for n in want:
        c = CLIPS[n]()
        c.build()
        nxt = {'Idle': ['Load'], 'Load': ['Ready', 'Fire'], 'Ready': ['Fire'], 'Fire': ['Load', 'Idle']}[n]
        meta[n] = dict(frames=c.frames, loop=c.loop, events=c.events, fps=K.FPS, next=nxt)
        print('CLIP', n, c.frames)
    rig.animation_data.action = bpy.data.actions[want[0]]
    (ROOT / 'battery-clips.json').write_text(json.dumps(meta, indent=1))
    K.save(ROOT / 'battery-animated.blend')
