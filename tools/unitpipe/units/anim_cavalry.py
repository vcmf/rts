"""Step 4 for the cavalry: horse and rider gaits.

blender -b cavalry-combined.blend -P anim_cavalry.py [-- Clip,Clip]  ->  cavalry-animated.blend, cavalry-clips.json

Clips (24 fps, in place; root_speed moves the unit, the ruleset's paces):
  Idle         standing: weight shifts, the head and tail move
  Walk         4-beat walk, 1.7 m/s
  Trot         2-beat trot, 3.3 m/s
  Gallop       transverse gallop, right lead, 6.5 m/s
  GallopSabre  the gallop with the sabre drawn and raised high (the charge)
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
ROOT = Path(bpy.data.filepath).parent            # the work folder, where the combined blend is
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unitkit as K, biped
from arm import Arm, aim_wrist
from horse import Horse, LEGS
from timeline import ease

D = math.radians
rig = bpy.data.objects['CavalryRig']; mesh = bpy.data.objects['CavalryMesh']
info = json.loads((ROOT / 'cavalry-combined.json').read_text())
P = K.Poser(rig)
H = Horse(P, mesh)
R = biped.Biped(P, 'Rider:', 0.0)   # its own grip, from the gloved hand's bones
ARM = Arm(P, R, 'Right')
UP = Vector((0, 0, 1))

GAITS = {
    # T frames, v m/s, duty, leg phases, swing flexion front/hind, pastern fold, lift (m), bob (m, per cycle),
    # pitch (rad), neck nod (rad, per cycle), stance offset of the front and hind feet (m, + = ahead)
    'Walk':   dict(T=20, v=1.7, duty=.60, low=.07, phase=dict(HL=0.0, FL=.25, HR=.5, FR=.75), kf=D(70), kh=D(55), psi=D(55),
                   lift=.08, bob=(.018, 2), pitch=D(1.2), nod=(D(5), 2), tail=D(4), front=0.0, hind=0.0),
    'Trot':   dict(T=16, v=3.3, duty=.40, low=.06, phase=dict(HL=0.0, FR=0.0, HR=.5, FL=.5), kf=D(95), kh=D(60), psi=D(70),
                   lift=.07, bob=(.035, 2), pitch=D(1.0), nod=(D(2), 2), tail=D(12), front=0.0, hind=0.0),
    'Gallop': dict(T=13, v=6.5, duty=.28, low=.08, phase=dict(HL=0.0, HR=.11, FL=.40, FR=.52), kf=D(115), kh=D(80), psi=D(85),
                   lift=.10, bob=(.055, 1), pitch=D(5.0), nod=(D(7), 1), tail=D(25), front=0.0, hind=0.0),
}


def leg_state(g, leg, t):
    """Fetlock target, kappa, psi of a leg at cycle position t (0..1)."""
    T = g['T']; v = g['v']; duty = g['duty']
    S = v * duty * T / K.FPS                       # stance length: planted while the body passes over it
    # the stance centred under the shoulder (front, a little ahead) or the hip (hind, a little behind):
    # the front legs are nearly straight at rest, so this is where a long stance stays within reach
    d = H.leg[leg]; J0 = d['J'][0]; J3 = d['J'][3]
    off = (J3.y - (J0.y - .02)) if leg[0] == 'F' else (J3.y - (J0.y + .10))
    off += g['front'] if leg[0] == 'F' else g['hind']
    u = (t - g['phase'][leg]) % 1.0
    kmax = g['kf'] if leg[0] == 'F' else g['kh']
    x = {'FL': .16, 'FR': -.16, 'HL': .19, 'HR': -.19}[leg]
    if u < duty:
        p = u / duty
        s = off + S / 2 - S * p
        return H.stance_fetlock(leg, s, x), D(4) * math.sin(math.pi * p), 0.0
    q = (u - duty) / (1 - duty)
    # swing: a Hermite curve leaving and landing at the stance's speed, so the hoof meets the ground
    # with zero speed over it
    m = -S / duty * (1 - duty)
    h00, h10, h01, h11 = 2*q**3 - 3*q**2 + 1, q**3 - 2*q**2 + q, -2*q**3 + 3*q**2, q**3 - q**2
    s = h00 * (off - S / 2) + h10 * m + h01 * (off + S / 2) + h11 * m
    F = H.stance_fetlock(leg, s, x)
    # fold early, reach forward and open before landing; the hoof is lifted as it folds so the toe clears
    fold = math.sin(math.pi * min(1.0, q / .75)) if q < .75 else 0.0
    F.z += g['lift'] * math.sin(math.pi * q) ** .6 + .08 * fold
    return F, kmax * fold, g['psi'] * fold


def horse_gait(g, t):
    T = g['T']
    bamp, bper = g['bob']
    # body lowest as the legs bear weight (2 per cycle for walk/trot; once for the gallop, after the fore stance)
    dz = -g['low'] - bamp * math.cos(2 * math.pi * bper * (t - (.12 if bper == 2 else .55)))
    pitch = g['pitch'] * math.sin(2 * math.pi * (t - .25)) if bper == 1 else g['pitch'] * math.sin(4 * math.pi * t)
    back = D(3) * math.sin(2 * math.pi * (t - .1)) if bper == 1 else 0.0
    # lower the body until every planted leg reaches its hoof (two passes)
    states = {leg: leg_state(g, leg, t) for leg in LEGS}
    for _ in range(3):
        H.set_body(dz=dz, pitch=pitch, back=back)
        need = 0.0
        for leg in LEGS:
            F, k, psi = states[leg]
            if not is_stance(g, leg, t):
                continue
            over = H.overshoot(leg, F, k)
            need = max(need, over)
        if need <= 1e-4:
            break
        P.reset()
        dz -= need * 1.05
    namp, nper = g['nod']
    nod = namp * math.sin(2 * math.pi * nper * (t - .05))
    head_carriage = {'Walk': D(6), 'Trot': D(2), 'Gallop': D(14)}[[k for k, v in GAITS.items() if v is g][0]]
    H.set_neck(pitch=(head_carriage * .5 + nod * .3, head_carriage * .3 + nod * .4, head_carriage * .2 + nod * .3))
    H.set_tail(lift=g['tail'] - D(4) * math.sin(2 * math.pi * t), swing=D(4) * math.sin(2 * math.pi * t))
    for leg in LEGS:
        F, k, psi = states[leg]
        H.set_leg(leg, F, k, psi)
    return dz, pitch


def is_stance(g, leg, t):
    return (t - g['phase'][leg]) % 1.0 < g['duty']


def saddle_frame():
    return P.pb['Saddle'].matrix.copy()


# the right hand resting on the thigh: Idle's, and where the draws start and the returns end
REST_ARM = dict(az=5.0, el=-65.0, r=.95, sw=15.0, pron=30.0, flex=10.0, dev=0.0)
ELBOW_REST = Vector((.5, .8, -.4))


def rider(gait=None, t=0.0, lean=0.0, absorb=0.0):
    """Seat the rider on the saddle: hips over the seat, legs round the barrel, reins in the left hand (the
    right hand is the caller's: rest_hand or a weapon)."""
    S = saddle_frame()
    Rs = S.to_3x3() @ P.rest['Saddle'].to_3x3().inverted()
    seat = S.to_translation()
    # the hips: on the seat, partly following the horse's pitch, the bounce absorbed
    hips = seat + Rs @ Vector((0, .02, .17 + absorb))
    yaw = 0.0
    hw = info['horse']['barrel_half_width']
    feet = {}
    for side, s in (('Left', 1), ('Right', -1)):
        ankle = seat + Rs @ Vector((s * (hw + .06), .02, -.50))
        feet[side] = (ankle, 0.0, D(10))
    knees = {side: seat + Rs @ Vector((s * (hw + .35), -.55, -.10)) for side, s in (('Left', 1), ('Right', -1))}
    reins = seat + Rs @ Vector((.03, -.36, .28))
    pose = dict(hips=(hips, yaw, D(4) + lean, 0.0), chest=(0, D(3) + lean * .5, 0), head=(0, -lean * .6 - D(3)),
                feet=feet, knee=knees, hands={}, curl={'Left': .7})
    pose['hands']['Left'] = ('wrist', reins + Vector((.05, .07, 0)), Vector((-.4, -1, -.2)), Vector((-.3, 0, -1)))
    pose['elbow'] = {'Left': ELBOW_REST.copy(), 'Right': ELBOW_REST.copy()}
    return pose, Rs, seat


HIDE = Matrix.Diagonal((.001, .001, .001, 1))


def rest_hand(pose):
    """The right hand resting on the thigh, posed by the arm (REST_ARM) so the wrist stays straight at any
    gait or lean. Seats the rider first (the shoulder must be where the chest puts it)."""
    R.set_pose(pose)
    Rc = chest_rot(pose)
    wrist, elbow, f, n, t, Rh = ARM.solve(REST_ARM, Rc)
    pose['hands']['Right'] = ('resolved', wrist, Rh)
    pose['elbow']['Right'] = elbow_pole(Rc, elbow)
    pose['curl']['Right'] = .4
    return wrist, Rh


def elbow_pole(Rc, elbow):
    """The solved elbow as Biped's pole for the right arm (in the chest's frame, x mirrored)."""
    vl = Rc.inverted() @ (elbow - ARM.shoulder())
    return Vector((-vl.x, vl.y, vl.z))


def build_cycle(name, gait, sabre=False):
    g = GAITS[gait]; T = g['T']
    if sabre:
        resolve(HIGH, 'Sabre')
    R._grips.clear()
    act = K.new_action(rig, name)
    for f in range(1, T + 2):
        t = ((f - 1) % T) / T
        P.reset()
        dz, pitch = horse_gait(g, t)
        lean = {'Walk': 0.0, 'Trot': D(4), 'Gallop': D(16)}[gait] + (D(4) if sabre else 0)
        absorb = -dz * (.6 if gait != 'Walk' else .3)
        pose, Rs, seat = rider(gait, t, lean, absorb)
        M = None
        if not sabre:
            rest_hand(pose)
        if sabre:
            # the raised sabre, swaying with the stride (GallopCut starts and ends on this)
            sway = math.sin(2 * math.pi * t)
            hi = _RESOLVED[(id(HIGH), 'Sabre')][1]
            st = dict(hi, el=hi['el'] + 3.0 * sway, az=hi['az'] - 1.5 * sway)
            M, _ = apply_sabre(pose, Rs, seat, st)
        R.set_pose(pose)
        if sabre:
            P.set('Sabre', M); P.set('Rider:Hilt', P.pb['Rider:Hilt'].matrix @ HIDE)
        else:
            P.set('Sabre', HIDE)
        P.key_all(f)
    K.finish_action(rig, act, T + 1)
    return dict(frames=T + 1, loop=True, root_speed=g['v'], fps=K.FPS, note='frame %d equals frame 1' % (T + 1))


def horse_stand(t=0.0, amp=1.0, react=None):
    """The standing horse at idle phase t (0..1, t = 0 and 1 are the same pose); amp scales the idle
    motion; react = dict(roll, yaw, nod, toss, tail, dz) adds a reaction (zero at both ends of a clip)."""
    r = react or {}
    dz = -.006 * math.sin(2 * math.pi * t * 2) * amp - .02 + r.get('dz', 0.0)
    roll = D(1.0) * math.sin(2 * math.pi * t) * amp + r.get('roll', 0.0)
    targets = {}
    for leg in LEGS:
        d = H.leg[leg]; J0 = d['J'][0]; J3 = d['J'][3]
        x = {'FL': .16, 'FR': -.16, 'HL': .19, 'HR': -.19}[leg]
        off = (J3.y - (J0.y - .02)) if leg[0] == 'F' else (J3.y - (J0.y + .10))
        targets[leg] = H.stance_fetlock(leg, off, x)
    for _ in range(3):
        P.reset()
        H.set_body(dz=dz, roll=roll, pitch=r.get('pitch', 0.0))
        need = max(H.overshoot(leg, F) for leg, F in targets.items())
        if need <= 1e-4:
            break
        dz -= need * 1.05
    look = D(10) * math.sin(2 * math.pi * t) * math.sin(math.pi * t) * amp + r.get('yaw', 0.0)
    nod = r.get('nod', 0.0)
    H.set_neck(pitch=(D(4) + D(3) * math.sin(2 * math.pi * t) * amp + nod * .4, D(3) + nod * .3,
                      D(2) - D(4) * math.sin(4 * math.pi * t) * .5 * amp + nod * .3 + r.get('toss', 0.0)), yaw=look)
    H.set_tail(lift=-D(3) + r.get('tail', 0.0), swing=D(10) * math.sin(2 * math.pi * 3 * t) * math.sin(math.pi * t) * amp)
    for leg in LEGS:
        H.set_leg(leg, targets[leg], 0.0, 0.0)


def build_idle(name='Idle', frames=96):
    R._grips.clear()
    act = K.new_action(rig, name)
    for f in range(1, frames + 1):
        t = (f - 1) / (frames - 1)
        P.reset()
        horse_stand(t)
        pose, Rs, seat = rider()
        pose['head'] = (D(12) * math.sin(2 * math.pi * t), D(-2))
        rest_hand(pose)
        R.set_pose(pose)
        P.set('Sabre', HIDE)
        P.key_all(f)
    K.finish_action(rig, act, frames)
    return dict(frames=frames, loop=True, root_speed=0.0, fps=K.FPS)


# ------------------------------------------------------------------ the weapons
# Weapon poses are arm states (arm.py): the wrist about the shoulder (az + to his right, el + up, r a share of
# the arm's reach), the elbow's swivel, the forearm's turn (pron + palm down), the wrist's bend (flex, dev);
# plus the rider's chest (yaw + = to his left, lean, roll), head, lean and rise. The weapon follows the fist,
# so the wrist stays within what a wrist can do. Clips are keyed lists of states, blended number by number,
# which moves the hand on arcs about the shoulder.
def A_(az, el, r, sw=20, pron=0, flex=0, dev=0, tilt=18, chest=(0, 0, 0), head=(0, D(-3)), lean=0.0, rise=0.0):
    """An arm state. tilt: how far the sabre's hilt is rolled in the fingers towards the line of the forearm
    (18 the hammer grip of a cut, about 60 for the point)."""
    return dict(az=float(az), el=float(el), r=float(r), sw=float(sw), pron=float(pron), flex=float(flex), dev=float(dev),
                tilt=float(tilt), chest=chest, head=head, lean=lean, rise=rise)


# the sabre: on guard, raised for the charge, the cuts (wind-up over the shoulder, over the top, the blow,
# the follow-through), the point and the head parry
def W_(az, el, r, sw, blade, up=None, **kw):
    """An arm state whose forearm turn and wrist bend are solved (aim_wrist) to point the weapon along `blade`
    (the saddle's frame: +x the horse's left, -y forward, +z up)."""
    st = A_(az, el, r, sw=sw, **kw)
    st['blade'] = tuple(blade); st['up'] = tuple(up) if up else None
    return st


GUARD = W_(22, -12, .74, 25, (-.2, -.7, .7), chest=(D(-6), D(4), 0))
HIGH = W_(12, 58, .9, 30, (0, -.35, 1), chest=(D(-4), D(2), 0))
WIND_R = W_(40, 70, .5, 70, (-.3, .8, -.5), chest=(D(18), D(-4), D(-4)), head=(D(-20), D(-2)))
OVER_R = W_(30, 75, .8, 45, (-.2, .3, .95), chest=(D(4), 0, D(-6)), head=(D(-22), D(2)))
CUT_R_MID = W_(35, 20, .95, 25, (-.4, -.8, .4), chest=(D(-14), D(8), D(-6)), head=(D(-25), D(8)), rise=.04)
CUT_R_END = W_(35, -40, .96, 15, (-.5, -.8, -.25), chest=(D(-28), D(14), D(-14)), head=(D(-30), D(18)), lean=D(6), rise=.06)
FOLLOW_R = W_(70, -65, .9, 15, (-.3, .3, -.9), chest=(D(-30), D(10), D(-12)), head=(D(-30), D(15)), rise=.03)
WIND_L = W_(-38, 35, .5, 30, (-.5, .8, .3), chest=(D(-22), D(-2), D(-4)), head=(D(10), 0))
OVER_L = W_(-18, 58, .72, 40, (.2, .2, 1), chest=(D(-6), D(4), 0), head=(D(14), D(2)))
CUT_L_MID = W_(-14, 20, .9, 30, (.7, -.6, .3), chest=(D(10), D(10), D(4)), head=(D(20), D(8)), rise=.04)
CUT_L_END = W_(-30, -25, .92, 25, (.8, -.5, -.2), chest=(D(34), D(16), D(10)), head=(D(30), D(18)), lean=D(6), rise=.06)
FOLLOW_L = W_(-45, -40, .8, 30, (.6, .2, -.75), chest=(D(36), D(12), D(10)), head=(D(28), D(14)), rise=.03)
THRUST_BACK = W_(28, -25, .55, 15, (0, -1, .1), tilt=60, chest=(D(14), D(-2), 0), head=(D(-4), D(4)))
THRUST_OUT = W_(15, 0, .95, 20, (-.1, -1, -.05), tilt=60, chest=(D(-16), D(18), 0), head=(D(-6), D(10)), lean=D(14), rise=.06)
PARRY = W_(30, 70, .76, 50, (1, -.1, .1), chest=(D(-4), D(-4), 0), head=(0, D(-12)))
PARRY_HIT = dict(PARRY, el=PARRY['el'] - 5.0, r=PARRY['r'] - .05, chest=(D(-4), D(-8), 0), head=(0, D(-8)))

# the pistol: the ready (muzzle up before the shoulder), the aim (arm out to the front right, wrist straight,
# the lock on top: the chest turns the 25 degrees, the arm points along it), the kick (the hand thrown up and back)
READY_P = W_(18, 6, .45, 8, (0, -.15, 1), up=(0, 1, .2), chest=(D(-6), D(2), 0), head=(D(-6), D(-3)))
AIM_P = W_(5, 4, .97, 10, (-.5, -.87, .03), up=(0, 0, 1), chest=(D(-25), D(6), 0), head=(D(-24), D(2)), lean=D(4))
RECOIL_P = W_(7, 13, .86, 20, (-.45, -.75, .5), up=(0, .4, .9), chest=(D(-23), D(2), 0), head=(D(-22), D(-2)), lean=D(1))
SHOT_P = 3                                      # FirePistol's shot frame (1-based, as every event)
SHOULDER_R = Vector((-.20, .02, .62))           # where the right shoulder sits over the seat (the draws' wrist side)


def chest_rot(pose):
    pos, yaw, lean, roll = pose['hips']
    cy, cl, cr = pose['chest']
    return biped.body_rot(yaw, lean, roll) @ biped.body_rot(cy, cl, cr)


def apply_arm(pose, Rs, seat, st, weapon):
    """Pose the right arm from an arm state and put the weapon in its fist. Returns (weapon matrix, wrist,
    hand rotation): the last two let a draw blend into the state."""
    pose['chest'] = (st['chest'][0], pose['chest'][1] + st['chest'][1], st['chest'][2])
    pose['head'] = st['head']
    h = pose['hips']
    pose['hips'] = (h[0] + Rs @ Vector((0, 0, st['rise'])), h[1], h[2] + st['lean'], h[3])
    R.set_pose(pose)                                  # the shoulder, where the chest put it
    Rc = chest_rot(pose)
    wrist, elbow, f, n, t, Rh = ARM.solve(st, Rc)
    pose['hands']['Right'] = ('resolved', wrist, Rh)
    pose['elbow']['Right'] = elbow_pole(Rc, elbow)
    pose['curl']['Right'] = .95
    M = ARM.sabre(wrist, f, n, t, D(st['tilt'])) if weapon == 'Sabre' else ARM.pistol(wrist, f, n, t)
    return M, wrist, Rh


def blend_state(a, b, t):
    """Blend two arm states number by number (angles, reach, the rider's chest and head)."""
    out = {}
    for k, va in a.items():
        if k in ('blade', 'up'):
            continue
        vb = b[k]
        if isinstance(va, tuple):
            out[k] = tuple(x + (y - x) * t for x, y in zip(va, vb))
        else:
            out[k] = va + (vb - va) * t
    return out


_RESOLVED = {}
_POSING = [False]       # resolve() resets the rig: it must not run in the middle of a frame


def resolve(st, weapon):
    """An arm state with its wrist solved for its blade target (once per state, cached). Call it before
    posing frames: solving resets the rig."""
    if 'blade' not in st:
        return st
    key = (id(st), weapon)
    if key not in _RESOLVED:
        if _POSING[0]:
            raise RuntimeError('resolve() of an unsolved state while posing a frame')
        P.reset(); horse_stand(0, 0)
        pose, Rs, seat = rider()
        pose['chest'] = (st['chest'][0], pose['chest'][1] + st['chest'][1], st['chest'][2])
        h = pose['hips']; pose['hips'] = (h[0], h[1], h[2] + st['lean'], h[3])
        R.set_pose(pose)
        up = Rs @ Vector(st['up']) if st.get('up') else None
        out = aim_wrist(ARM, st, chest_rot(pose), weapon, Rs @ Vector(st['blade']), up)
        out = {k: v for k, v in out.items() if k not in ('blade', 'up')}
        _RESOLVED[key] = (st, out)        # the state is held so its id stays unique
        P.reset()
    return _RESOLVED[key][1]


def matching_state(pose, wrist, blade, weapon, sw=25.0, up=None, chest=(0, 0, 0), head=(0, D(-3)), lean=0.0):
    """The arm state whose wrist is at `wrist`, its elbow swivelled by sw, and whose weapon points along `blade`
    (world) with its z axis towards `up`, with the rider's chest and head given: where a draw's pull ends, so the
    rest of the draw blends arm state to arm state."""
    Rc = chest_rot(pose)
    d = Rc.inverted() @ (wrist - ARM.shoulder())
    L = ARM.l1 + ARM.l2
    r = d.length / L; d.normalize()
    az = math.degrees(math.atan2(d.x * ARM.out, -d.y)); el = math.degrees(math.asin(max(-1, min(1, d.z))))
    st = A_(az, el, r, sw=sw, chest=chest, head=head, lean=lean)
    return aim_wrist(ARM, st, Rc, weapon, blade, up, swing=0)     # the elbow stays where the pull put it


def varied(st, weapon, **delta):
    """A solved state with small changes: numbers are added to, tuples (chest, head) replaced; its wrist stays
    the solved one, so a breath or a settle does not turn the hand."""
    out = dict(resolve(st, weapon))
    for k, v in delta.items():
        out[k] = v if isinstance(v, tuple) else out[k] + v
    return out


def state_at(keys, f):
    """keys: [(frame, state, ease)], the ease shaping the segment that ends at that key."""
    if f <= keys[0][0]:
        return keys[0][1]
    for (fa, a, _), (fb, b, e) in zip(keys, keys[1:]):
        if f <= fb:
            return blend_state(a, b, ease(e, (f - fa) / max(1e-9, fb - fa)))
    return keys[-1][1]


def sabre_matrix(G, B, Rs):
    side = Rs @ Vector((1, 0, 0))
    y = B; x = side - y * side.dot(y)
    if x.length < 1e-4:
        x = Rs @ Vector((0, 1, 0)) - y * (Rs @ Vector((0, 1, 0))).dot(y)
    x.normalize(); z = x.cross(y)
    M = Matrix((x, y, z)).transposed().to_4x4(); M.translation = G
    return M




def apply_sabre(pose, Rs, seat, st):
    """The sabre in the right fist for this arm state; returns (its matrix, the hilt hidden)."""
    return apply_arm(pose, Rs, seat, st, 'Sabre')[0], True


def apply_pistol(pose, Rs, seat, st):
    """The pistol in the right fist for this arm state; returns (its matrix, False)."""
    return apply_arm(pose, Rs, seat, st, 'Pistol')[0], False


def hilt_frame():
    """The scabbard's mouth and its direction (into the scabbard), as the rider sits and the scabbard hangs now."""
    pb = P.pb['Rider:Scabbard']
    return pb.head.copy(), (pb.tail - pb.head).normalized()


def swing_scabbard(q, drop=0.0):
    """Swing the scabbard on its slings: the rotation q (world) about its mouth, then a slide of `drop` along
    itself, away from the mouth's rest. From where it hangs at rest, whatever it did before."""
    P.pb['Rider:Scabbard'].matrix_basis = Matrix.Identity(4); P.update()
    M = P.pb['Rider:Scabbard'].matrix.copy(); h = M.to_translation()
    d = q @ (P.pb['Rider:Scabbard'].tail - h).normalized()
    P.set('Rider:Scabbard', Matrix.Translation(h + d * drop) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ M)


def stand_clip(name, frames, keys=None, weapon='Sabre', loop=False, react=None, stand_amp=0.0, events=None, draw=None):
    """A standing clip with a weapon in the right hand: keyed states (state_at), or its draw (draw='out') or
    its return (draw='in'). react(t) adds a reaction of the horse, zero at both ends."""
    apply = apply_sabre if weapon == 'Sabre' else apply_pistol
    draw_fn = draw_pose if weapon == 'Sabre' else draw_pistol_pose
    if keys:
        keys = [(f, resolve(st, weapon), e) for f, st, e in keys]     # wrists solved before any frame is posed
    resolve(GUARD if weapon == 'Sabre' else READY_P, weapon)          # where a draw ends
    R._grips.clear(); _SEAM.clear()
    act = K.new_action(rig, name)
    _POSING[0] = True
    for f in range(1, frames + 1):
        t = (f - 1) / (frames - 1)
        P.reset()
        horse_stand(t if stand_amp else 0.0, stand_amp, react(t) if react else None)
        pose, Rs, seat = rider()
        pose['head'] = (0, D(-2))
        if draw:
            R.set_pose(pose)                 # seat him first: the scabbard hangs from his hips, the shoulder sits
            M, hide_hilt = draw_fn(pose, Rs, seat, f - 1 if draw == 'out' else frames - f)
        else:
            M, hide_hilt = apply(pose, Rs, seat, state_at(keys, f - 1))
        R.set_pose(pose)
        if weapon == 'Sabre':
            P.set('Sabre', M if M is not None else HIDE)
            if hide_hilt:
                P.set('Rider:Hilt', P.pb['Rider:Hilt'].matrix @ HIDE)
        else:
            P.set('Pistol', M)
            P.set('Sabre', HIDE)
        P.key_all(f)
    _POSING[0] = False
    K.finish_action(rig, act, frames)
    return dict(frames=frames, loop=loop, root_speed=0.0, fps=K.FPS, events=events or {})


def pistol_clip(name, frames, keys, **kw):
    return stand_clip(name, frames, keys, weapon='Pistol', **kw)


def reach_hand(pose, k, w1, R1, pole1):
    """The right hand from its resting place to a grip (k 0..1), without a jump where the grip takes over: wrist,
    rotation and elbow are blended to exactly the grip's."""
    w0, R0 = rest_hand(pose)
    pose['elbow']['Right'] = pose['elbow']['Right'].lerp(pole1, k)
    pose['hands']['Right'] = ('resolved', w0.lerp(w1, k), R0.to_quaternion().slerp(R1.to_quaternion(), k).to_matrix())


# Where a draw's straight pull hands over to arm states: the pull's last pose (the hand on the weapon, the
# weapon on its scabbard's or holster's line) and the matching arm state, which differ a little (the state is
# searched on a grid, the reach is capped). The difference is applied in full at the hand-over and fades to
# nothing at the guard or the ready, so neither the hand nor the weapon nor the elbow jumps. Solved once per clip.
_SEAM = {}


def seam(pose, Rs, weapon, wrist_a, Rh_a, M_a, pole_a, blade, chest, head, lean=0.0):
    """The pull's last pose (wrist_a, Rh_a, the weapon M_a, the elbow pole_a), the pose set as at the pull's
    end: returns the matching state and the differences to fade."""
    if 'out' not in _SEAM:
        R.set_pose(pose)
        Rc = chest_rot(pose)
        st = matching_state(pose, wrist_a, blade, weapon, sw=_SEAM['elbow']['sw'], up=M_a.col[2].to_3d(),
                            chest=chest, head=head, lean=lean)
        wrist, elbow, f, n, t, Rh = ARM.solve(st, Rc)
        hand = lambda w, r: Matrix.Translation(w) @ r.to_4x4()
        _SEAM['out'] = dict(state=st, dw=wrist_a - wrist, dq=(Rh_a @ Rh.inverted()).to_quaternion(),
                            rel_a=hand(wrist_a, Rh_a).inverted() @ M_a,
                            dpole=pole_a - elbow_pole(Rc, elbow))
    return _SEAM['out']


def apply_seamed(pose, Rs, seat, sm, target, k, weapon):
    """The arm state blended from the seam's to `target` (k 0..1), the seam's differences faded out by k."""
    M_b, wrist, Rh = apply_arm(pose, Rs, seat, blend_state(sm['state'], target, k), weapon)
    rel_b = (Matrix.Translation(wrist) @ Rh.to_4x4()).inverted() @ M_b     # the weapon in the hand, as the state holds it
    w = 1.0 - k
    wrist = wrist + sm['dw'] * w
    Rh = Quaternion().slerp(sm['dq'], w).to_matrix() @ Rh
    pose['hands']['Right'] = ('resolved', wrist, Rh)
    pose['elbow']['Right'] = pose['elbow']['Right'] + sm['dpole'] * w
    a, b = rel_b, sm['rel_a']
    rel = Matrix.LocRotScale(a.to_translation().lerp(b.to_translation(), w),
                             a.to_quaternion().slerp(b.to_quaternion(), w), None)
    return Matrix.Translation(wrist) @ Rh.to_4x4() @ rel


DRAW_T = dict(reach=8, grab=10, out=20, guard=30)
CLEAR = .03                       # how far the sabre's tip is out of the scabbard where the pull ends (`drawn`)
SWING_AIM = Vector((0, -.10, .10))  # the scabbard's mouth turns to point here (from the right shoulder, the chest's frame)
SWING_MAX = D(70)
DROP_MAX = .20                    # how far the scabbard may slide down its slings
REACH_END = .92                   # the wrist's distance from the shoulder where the pull ends, as a share of the arm
PULL_S = dict(chest=(D(28), D(8), 0), head=(D(20), D(14)))      # the rider as the pull starts...
PULL_S_END = dict(chest=(D(8), D(8), 0), head=(D(10), D(6)))    # ...and ends


def sabre_hand(pose, Rs, seat, grip, d):
    """The right hand round the sabre's grip, the blade along d, the elbow where the wrist bends least (the pose
    seated with its chest). Returns (wrist, hand rotation, elbow pole)."""
    Rc = chest_rot(pose)
    wdir = (seat + Rs @ SHOULDER_R) - grip
    w, Rh, _ = R.natural_grip('Right', grip, d, wdir, pose, memory=('Right', 'grip'))
    e = ARM.easiest_elbow(w, Rh @ ARM.f0, Rc, _SEAM.setdefault('elbow', {}))
    pose['elbow']['Right'] = elbow_pole(Rc, e)
    w, Rh, _ = R.natural_grip('Right', grip, d, wdir, pose, memory=('Right', 'grip'))   # for the elbow it takes
    return w, Rh, pose['elbow']['Right'].copy()


def scabbard_swing(pose, base, pull):
    """How the scabbard moves on its slings for the draw (once per clip): its mouth turned towards a point before
    the right shoulder and, where the arm is still too short for the blade (Tripo's arms are), slid down along
    itself, so the hand can pull the whole blade out. Returns (rotation, drop)."""
    if 'swing' not in _SEAM:
        c, hd = pose['chest'], pose['head']
        set_body(pose, base, PULL_S_END); R.set_pose(pose)
        mouth, d = hilt_frame()
        sh = ARM.shoulder()
        aim = sh + chest_rot(pose) @ SWING_AIM
        q = (-d).rotation_difference((aim - mouth).normalized())
        q = Quaternion(q.axis, min(q.angle, SWING_MAX))
        d1 = q @ d
        far = lambda drop: (pull(mouth + d1 * drop, d1, 1.0) - sh).length
        lo, hi = 0.0, DROP_MAX              # the grip's distance from the shoulder falls as the scabbard drops
        for _ in range(30):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if far(mid) > REACH_END * (ARM.l1 + ARM.l2) else (lo, mid)
        _SEAM['swing'] = (q, hi)
        pose['chest'], pose['head'] = c, hd; R.set_pose(pose)
    return _SEAM['swing']


def set_body(pose, base, a, b=None, k=0.0, lean0=None):
    """The rider's chest and head (and lean, for the pistol) at k between two body states (chest lean on top of
    `base`)."""
    b = b or a
    L = lambda x, y: tuple(p + (q - p) * k for p, q in zip(x, y))
    c = L(a['chest'], b['chest']); pose['chest'] = (c[0], base + c[1], c[2]); pose['head'] = L(a['head'], b['head'])
    if lean0 is not None:
        h = pose['hips']; la = a.get('lean', 0.0); pose['hips'] = (h[0], h[1], lean0 + la + (b.get('lean', 0.0) - la) * k, h[3])


def draw_pose(pose, Rs, seat, fr):
    """The draw, frame fr (0 = Idle's pose, DRAW_T['guard'] = the guard). The blade lies in the scabbard; the
    scabbard swings forward on its slings as the hand pulls the blade straight out along it, then the arm carries
    the blade over to the guard while the scabbard falls back. Returns (sabre matrix, hilt hidden)."""
    T = DRAW_T
    L_SAB = info['sabre']['length']
    base = pose['chest'][1]
    pull = lambda mouth, d, k: mouth - d * (.085 + (L_SAB - .085 + CLEAR) * k)   # the grip, from the hilt to the tip clear
    if fr < T['grab']:
        # the right hand crosses the body to the hilt at the left hip, the chest turning to it
        k = ease('smooth', fr / T['grab'])
        set_body(pose, base, dict(chest=(0, 0, 0), head=(0, D(-2))), PULL_S, k)
        R.set_pose(pose)
        mouth, d = hilt_frame()
        kr = ease('smooth', min(1.0, fr / T['reach']))
        rest_pole = pose['elbow']['Right']
        w1, R1, pole1 = sabre_hand(pose, Rs, seat, pull(mouth, d, 0.0), d)
        pose['elbow']['Right'] = rest_pole
        reach_hand(pose, kr, w1, R1, pole1)
        pose['curl']['Right'] = .4 + .55 * kr
        return None, False
    q, drop = scabbard_swing(pose, base, pull)
    if fr < T['out']:
        # out along the scabbard as it swings
        t = (fr - T['grab']) / (T['out'] - T['grab'])
        k = ease('in', t); ks = ease('smooth', t)
        set_body(pose, base, PULL_S, PULL_S_END, k)
        R.set_pose(pose)
        swing_scabbard(Quaternion().slerp(q, ks), drop * ks)
        mouth, d = hilt_frame()
        grip = pull(mouth, d, k)
        w, Rh, pole = sabre_hand(pose, Rs, seat, grip, d)
        pose['hands']['Right'] = ('resolved', w, Rh)
        pose['curl']['Right'] = .95
        return sabre_matrix(grip, d, Rs), True
    # (the drawn event is here: the tip has just cleared) from the end of the pull to the guard, arm state to
    # arm state, the seam faded out, the scabbard falling back
    k = ease('smooth', (fr - T['out']) / (T['guard'] - T['out']))
    if 'out' not in _SEAM:
        set_body(pose, base, PULL_S_END)
        R.set_pose(pose)
        swing_scabbard(q, drop)
        mouth, d = hilt_frame()
        G = pull(mouth, d, 1.0)
        w_a, R_a, pole_a = sabre_hand(pose, Rs, seat, G, d)
        seam(pose, Rs, 'Sabre', w_a, R_a, sabre_matrix(G, d, Rs), pole_a, d, PULL_S_END['chest'], PULL_S_END['head'])
        pose['chest'] = (0, base, 0)
    M = apply_seamed(pose, Rs, seat, _SEAM['out'], resolve(GUARD, 'Sabre'), k, 'Sabre')
    swing_scabbard(Quaternion().slerp(q, 1.0 - k), drop * (1.0 - k))
    return M, True


def fight_react(t):
    """The horse in a melee: turning a little, tossing its head, tail switching (zero at both ends)."""
    env = math.sin(math.pi * t)
    return dict(yaw=D(10) * math.sin(2 * math.pi * 2 * t) * env, roll=D(2) * math.sin(2 * math.pi * 3 * t) * env,
                toss=D(-10) * max(0.0, math.sin(2 * math.pi * 4 * t)) * env, nod=D(6) * math.sin(2 * math.pi * 3 * t + 1) * env,
                tail=D(10) * env, dz=-.015 * env)


def reaction(t0, t1, **peak):
    """A reaction of the horse between clip fractions t0 and t1, peaking half way (zero outside)."""
    def r(t):
        if not (t0 <= t <= t1):
            return {}
        e = math.sin(math.pi * (t - t0) / (t1 - t0))
        return {k: v * e for k, v in peak.items()}
    return r


def jolt(t0, t1, amount):
    """A short reaction of the horse around a blow: a roll of `amount`, the head tossed."""
    return reaction(t0, t1, roll=amount, toss=-D(8), nod=D(4))


def cut_keys(side):
    if side == 'R':
        return [(0, GUARD, 'smooth'), (7, WIND_R, 'out'), (9, OVER_R, 'in'), (11, CUT_R_MID, 'linear'), (14, CUT_R_END, 'linear'), (20, FOLLOW_R, 'out'), (28, GUARD, 'smooth')]
    return [(0, GUARD, 'smooth'), (7, WIND_L, 'out'), (9, OVER_L, 'in'), (11, CUT_L_MID, 'linear'), (14, CUT_L_END, 'linear'), (20, FOLLOW_L, 'out'), (28, GUARD, 'smooth')]


THRUST_KEYS = [(0, GUARD, 'smooth'), (7, THRUST_BACK, 'out'), (11, THRUST_OUT, 'snap'), (15, THRUST_OUT, 'linear'), (24, GUARD, 'smooth')]
PARRY_KEYS = [(0, GUARD, 'smooth'), (5, PARRY, 'snap'), (8, PARRY_HIT, 'out'),
              (11, PARRY, 'smooth'), (20, GUARD, 'smooth')]


def shift(keys, df):
    return [(f + df, s_, e) for f, s_, e in keys]


def fight_keys():
    """A melee: cut right, parry, thrust, cut left, back to the guard (loop)."""
    k = shift(cut_keys('R'), 0)[:-1] + [(28, GUARD, 'smooth'), (32, GUARD, 'smooth')]
    k += shift(PARRY_KEYS[1:], 32)
    k += shift(THRUST_KEYS[1:], 52)
    k += [(80, GUARD, 'smooth')] + shift(cut_keys('L')[1:], 80)
    k += [(116, GUARD, 'smooth')]
    return k


def gallop_cut(name='GallopCut'):
    """A cut down to the right at the gallop, over two strides, from and back to the raised sabre."""
    g = GAITS['Gallop']; T = g['T']; N = 2 * T
    hi0 = HIGH
    keys = [(0, hi0, 'smooth'), (7, dict(WIND_R, chest=(D(16), D(-2), D(-4)), head=(D(-15), 0)), 'out'),
            (9, OVER_R, 'in'),
            (11, dict(CUT_R_MID, rise=.03), 'linear'),
            (14, dict(CUT_R_END, lean=D(4), rise=.05), 'linear'),
            (19, dict(FOLLOW_R, rise=0.0), 'out'),
            (N, hi0, 'smooth')]
    keys = [(f, resolve(st, 'Sabre'), e) for f, st, e in keys]
    R._grips.clear()
    act = K.new_action(rig, name)
    for f in range(1, N + 2):
        t = ((f - 1) % T) / T
        P.reset()
        dz, pitch = horse_gait(g, t)
        lean = D(16) + D(4)
        pose, Rs, seat = rider('Gallop', t, lean, -dz * .6)
        st = state_at(keys, f - 1)
        # the stride's sway of the raised sabre (as in GallopSabre) where the state is the raised one
        sway = math.sin(2 * math.pi * t)
        w = 1.0 - min(1.0, min(f - 1, N - (f - 1)) / 5.0)
        st = dict(st, el=st['el'] + 3.0 * sway * w, az=st['az'] - 1.5 * sway * w)
        M, _ = apply_sabre(pose, Rs, seat, st)
        R.set_pose(pose)
        P.set('Sabre', M); P.set('Rider:Hilt', P.pb['Rider:Hilt'].matrix @ HIDE)
        P.key_all(f)
    K.finish_action(rig, act, N + 1)
    return dict(frames=N + 1, loop=False, root_speed=g['v'], fps=K.FPS, events={'hit': 14 + 1})


def build_draw(name, weapon, reverse=False):
    """Draw or return a weapon. Events, the same for both weapons: `drawn` where it clears its scabbard or
    holster, `sheathed` / `holstered` from where it is fully back in."""
    T = DRAW_T if weapon == 'Sabre' else DRAW_P
    n = T['guard' if weapon == 'Sabre' else 'ready'] + 1
    m = stand_clip(name, n, weapon=weapon, draw='in' if reverse else 'out')
    m['events'] = {'drawn': T['out'] + 1} if not reverse else {('sheathed' if weapon == 'Sabre' else 'holstered'): n - T['grab']}
    return m


DRAW_P = dict(reach=9, grab=11, out=17, ready=27)
# the rider leans to the holster as he reaches, then sits back and turns his right shoulder back as he pulls the
# pistol up out of it (the holster points at the shoulder: pulled straight, the hand would end in it)
REACH_P = dict(chest=(D(-10), D(16), D(-6)), head=(D(-10), D(16)), lean=D(8))
PULL_P_END = dict(chest=(D(-22), D(-4), D(-6)), head=(D(-12), D(6)), lean=D(-6))


def pistol_hand(pose, M):
    """The right hand on the pistol at M (the aim's grip), the elbow where the wrist bends least (the pose seated
    with its chest). Returns (wrist, hand rotation, elbow pole)."""
    Rc = chest_rot(pose)
    w, Rh = ARM.hand_on_pistol(M)
    e = ARM.easiest_elbow(w, Rh @ ARM.f0, Rc, _SEAM.setdefault('elbow', {}))
    return w, Rh, elbow_pole(Rc, e)


def draw_pistol_pose(pose, Rs, seat, fr):
    """From Idle's pose (fr 0) to READY_P (fr DRAW_P['ready']): reach down to the butt, out of the holster
    along it, up to the ready. The hand holds the pistol with the aim's grip (arm.py) throughout, worked back
    from the pistol while the pistol leads. Returns (the pistol's matrix, False)."""
    T = DRAW_P
    base = pose['chest'][1]; lean0 = pose['hips'][2]
    held = P.pb['Pistol'].matrix.copy()          # its rest: in the holster, as the horse stands now
    axis = held.col[1].to_3d().normalized()      # the barrel, down into the holster
    if fr < T['grab']:
        k = ease('smooth', fr / T['grab'])
        set_body(pose, base, dict(chest=(0, 0, 0), head=(0, D(-2))), REACH_P, k, lean0)
        kr = ease('smooth', min(1.0, fr / T['reach']))
        R.set_pose(pose)
        rest_pole = pose['elbow']['Right']
        w1, R1, pole1 = pistol_hand(pose, held)
        pose['elbow']['Right'] = rest_pole
        reach_hand(pose, kr, w1, R1, pole1)
        pose['curl']['Right'] = .4 + .55 * kr
        return held, False
    out_of = lambda k: held.to_translation() - axis * (.30 * k)
    if fr < T['out']:
        k = ease('in', (fr - T['grab']) / (T['out'] - T['grab']))
        M = held.copy(); M.translation = out_of(k)
        set_body(pose, base, REACH_P, PULL_P_END, ease('smooth', (fr - T['grab']) / (T['out'] - T['grab'])), lean0)
        R.set_pose(pose)
        w, Rh, pose['elbow']['Right'] = pistol_hand(pose, M)
        pose['hands']['Right'] = ('resolved', w, Rh)
        pose['curl']['Right'] = .95
        return M, False
    # from the end of the pull to the ready, arm state to arm state, the seam faded out
    k = ease('smooth', (fr - T['out']) / (T['ready'] - T['out']))
    if 'out' not in _SEAM:
        h = pose['hips']
        set_body(pose, base, PULL_P_END, lean0=lean0)
        M_out = held.copy(); M_out.translation = out_of(1.0)
        R.set_pose(pose)
        w_a, R_a, pole_a = pistol_hand(pose, M_out)
        seam(pose, Rs, 'Pistol', w_a, R_a, M_out, pole_a, axis, PULL_P_END['chest'], PULL_P_END['head'], lean=PULL_P_END['lean'])
        pose['chest'] = (0, base, 0); pose['hips'] = h
    return apply_seamed(pose, Rs, seat, _SEAM['out'], resolve(READY_P, 'Pistol'), k, 'Pistol'), False


def shot_react(t0, t1):
    """The horse starts at the shot: head up, a step of the body."""
    return reaction(t0, t1, toss=D(-14), nod=D(-6), roll=D(-2), dz=.01)


def aim_sway(t):
    """The held aim breathes: a little drift of the wrist about the shoulder (zero at both ends)."""
    s1 = math.sin(2 * math.pi * t); c = math.sin(4 * math.pi * t)
    aim = resolve(AIM_P, 'Pistol')
    return dict(aim, az=aim['az'] + .6 * c, el=aim['el'] + .8 * s1)


CLIPS = {'Idle': lambda: build_idle(), 'Walk': lambda: build_cycle('Walk', 'Walk'), 'Trot': lambda: build_cycle('Trot', 'Trot'),
         'Gallop': lambda: build_cycle('Gallop', 'Gallop'), 'GallopSabre': lambda: build_cycle('GallopSabre', 'Gallop', sabre=True),
         'DrawSabre': lambda: build_draw('DrawSabre', 'Sabre'),
         'SheatheSabre': lambda: build_draw('SheatheSabre', 'Sabre', reverse=True),
         'IdleSabre': lambda: stand_clip('IdleSabre', 49, [(0, GUARD, 'smooth'), (24, varied(GUARD, 'Sabre', el=-3.0, head=(D(8), D(-2))), 'smooth'), (48, GUARD, 'smooth')],
                                         loop=True, stand_amp=.5),
         'SabreCutRight': lambda: stand_clip('SabreCutRight', 29, cut_keys('R'), react=jolt(.4, .75, D(-3)), events={'hit': 14 + 1}),
         'SabreCutLeft': lambda: stand_clip('SabreCutLeft', 29, cut_keys('L'), react=jolt(.4, .75, D(3)), events={'hit': 14 + 1}),
         'SabreThrust': lambda: stand_clip('SabreThrust', 25, THRUST_KEYS, react=jolt(.35, .7, D(-2)), events={'hit': 11 + 1}),
         'SabreParry': lambda: stand_clip('SabreParry', 21, PARRY_KEYS, react=jolt(.3, .65, D(2)), events={'parry': 8 + 1}),
         'SabreFight': lambda: stand_clip('SabreFight', 117, fight_keys(), loop=True, react=fight_react,
                                          events={'hit': [14 + 1, 63 + 1, 94 + 1], 'parry': 40 + 1}),
         'GallopCut': lambda: gallop_cut(),
         'DrawPistol': lambda: build_draw('DrawPistol', 'Pistol'),
         'HolsterPistol': lambda: build_draw('HolsterPistol', 'Pistol', reverse=True),
         'ReadyPistol': lambda: pistol_clip('ReadyPistol', 49, [(0, READY_P, 'smooth'), (24, varied(READY_P, 'Pistol', el=-3.0), 'smooth'),
                                                                 (48, READY_P, 'smooth')], loop=True, stand_amp=.5),
         'PresentPistol': lambda: pistol_clip('PresentPistol', 13, [(0, READY_P, 'smooth'), (12, AIM_P, 'smooth')]),
         'LowerPistol': lambda: pistol_clip('LowerPistol', 13, [(0, AIM_P, 'smooth'), (12, READY_P, 'smooth')]),
         'AimPistol': lambda: pistol_clip('AimPistol', 37, [(f, aim_sway(f / 36), 'linear') for f in range(0, 37)], loop=True),
         'FirePistol': lambda: pistol_clip('FirePistol', 25, [(0, AIM_P, 'smooth'), (SHOT_P - 1, AIM_P, 'linear'), (SHOT_P + 2, RECOIL_P, 'snap'),
                                                             (SHOT_P + 8, varied(RECOIL_P, 'Pistol', el=4.0, r=-.03), 'out'), (24, READY_P, 'smooth')],
                                           react=shot_react(.08, .5), events={'shot': SHOT_P})}
NEXT = {'Idle': ['DrawSabre', 'DrawPistol'], 'DrawSabre': ['IdleSabre', 'SabreCutRight', 'SabreCutLeft', 'SabreThrust', 'SabreParry', 'SabreFight'],
        'IdleSabre': ['SabreCutRight', 'SabreCutLeft', 'SabreThrust', 'SabreParry', 'SabreFight', 'SheatheSabre'],
        'SabreCutRight': ['IdleSabre', 'SabreCutLeft', 'SabreThrust'], 'SabreCutLeft': ['IdleSabre', 'SabreCutRight'],
        'SabreThrust': ['IdleSabre', 'SabreParry'], 'SabreParry': ['IdleSabre', 'SabreCutRight'],
        'SabreFight': ['IdleSabre', 'SheatheSabre'], 'SheatheSabre': ['Idle'],
        'GallopSabre': ['GallopCut'], 'GallopCut': ['GallopSabre'],
        'DrawPistol': ['ReadyPistol', 'PresentPistol', 'HolsterPistol'], 'ReadyPistol': ['PresentPistol', 'HolsterPistol'],
        'PresentPistol': ['AimPistol', 'FirePistol', 'LowerPistol'], 'AimPistol': ['FirePistol', 'LowerPistol'],
        'LowerPistol': ['ReadyPistol', 'PresentPistol', 'HolsterPistol'], 'FirePistol': ['ReadyPistol', 'PresentPistol', 'HolsterPistol'],
        'HolsterPistol': ['Idle']}
if __name__ == '__main__':
    want = K.args()[0].split(',') if K.args() else list(CLIPS)
    meta = {}
    for n in want:
        H.clamps = 0; H.worst = 0.0
        meta[n] = CLIPS[n]()
        if n in NEXT:
            meta[n]['next'] = NEXT[n]
        print('CLIP', n, meta[n]['frames'], 'legs out of reach in', H.clamps, 'solves, worst %.1f cm' % (H.worst * 100))
    rig.animation_data.action = bpy.data.actions[want[0]]
    (ROOT / 'cavalry-clips.json').write_text(json.dumps(meta, indent=1))
    K.save(ROOT / 'cavalry-animated.blend')
