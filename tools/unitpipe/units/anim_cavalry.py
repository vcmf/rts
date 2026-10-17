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
from mathutils import Vector, Matrix
ROOT = Path(bpy.data.filepath).parent            # the work folder, where the combined blend is
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unitkit as K, biped
from horse import Horse, LEGS
from timeline import ease

D = math.radians
rig = bpy.data.objects['CavalryRig']; mesh = bpy.data.objects['CavalryMesh']
info = json.loads((ROOT / 'cavalry-combined.json').read_text())
grip0 = json.loads((ROOT / 'gunner-prep.json').read_text())['grip']
P = K.Poser(rig)
H = Horse(P, mesh)
R = biped.Biped(P, 'Rider:', 0.0)   # its own grip, from the gloved hand's bones
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


def rider(gait=None, t=0.0, sabre=False, lean=0.0, absorb=0.0):
    """Seat the rider on the saddle: hips over the seat, legs round the barrel, reins in the left hand."""
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
    pose['elbow'] = {'Left': Vector((.5, .8, -.4)), 'Right': Vector((.5, .8, -.4))}
    if not sabre:
        rest_hand = seat + Rs @ Vector((-.20, -.22, .10))
        pose['hands']['Right'] = ('wrist', rest_hand, Vector((.2, -1, -.6)), Vector((.6, 0, -.6)))
        pose['curl']['Right'] = .4
    return pose, Rs, seat


HIDE = Matrix.Diagonal((.001, .001, .001, 1))


def build_cycle(name, gait, sabre=False):
    g = GAITS[gait]; T = g['T']
    act = K.new_action(rig, name)
    for f in range(1, T + 2):
        t = ((f - 1) % T) / T
        P.reset()
        dz, pitch = horse_gait(g, t)
        lean = {'Walk': 0.0, 'Trot': D(4), 'Gallop': D(16)}[gait] + (D(4) if sabre else 0)
        absorb = -dz * (.6 if gait != 'Walk' else .3)
        pose, Rs, seat = rider(gait, t, sabre, lean, absorb)
        M = None
        if sabre:
            # the raised sabre, swaying with the stride (GallopCut starts and ends on this)
            sway = math.sin(2 * math.pi * t)
            st = dict(HIGH, G=HIGH['G'] + Vector((0, -.03 * sway, .02 * sway)), B=(HIGH['B'] + Vector((0, -.1 * sway, 0))).normalized())
            M = apply_sabre(pose, Rs, seat, st)
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
    act = K.new_action(rig, name)
    for f in range(1, frames + 1):
        t = (f - 1) / (frames - 1)
        P.reset()
        horse_stand(t)
        pose, Rs, seat = rider()
        pose['head'] = (D(12) * math.sin(2 * math.pi * t), D(-2))
        R.set_pose(pose)
        P.set('Sabre', HIDE)
        P.key_all(f)
    K.finish_action(rig, act, frames)
    return dict(frames=frames, loop=True, root_speed=0.0, fps=K.FPS)


# ------------------------------------------------------------------ the sabre
# A sabre state, in the saddle's frame (x = the horse's left, -y = forward, z up, from the seat):
# G the grip's centre, B the blade's direction, and the rider's chest (yaw + = to his left, lean,
# roll) and head. Clips are keyed lists of states, blended with an ease.
def S_(G, B, chest=(0, 0, 0), head=(0, D(-3)), lean=0.0, rise=0.0):
    return dict(G=Vector(G), B=Vector(B).normalized(), chest=chest, head=head, lean=lean, rise=rise)


SHOULDER_R = Vector((-.20, .02, .62))
GUARD = S_((-.24, -.40, .56), (0, -.55, .85), chest=(D(-6), D(4), 0))
HIGH = S_((-.22, -.18, 1.02), (0, -.45, 1), chest=(D(-4), D(2), 0))
WIND_R = S_((-.14, .04, .96), (.15, .85, -.25), chest=(D(18), D(-4), D(-4)), head=(D(-20), D(-2)))
OVER_R = S_((-.26, -.10, 1.0), (-.25, -.15, 1), chest=(D(4), D(0), D(-6)), head=(D(-22), D(2)))
CUT_R_MID = S_((-.46, -.36, .74), (-.6, -.65, .3), chest=(D(-14), D(8), D(-6)), head=(D(-25), D(8)), rise=.04)
CUT_R_END = S_((-.55, -.28, .26), (-.45, -.35, -.8), chest=(D(-28), D(14), D(-14)), head=(D(-30), D(18)), lean=D(6), rise=.06)
FOLLOW_R = S_((-.50, .02, .30), (-.25, .55, -.75), chest=(D(-30), D(10), D(-12)), head=(D(-30), D(15)), rise=.03)
WIND_L = S_((-.32, -.02, .96), (-.55, .55, .45), chest=(D(-22), D(-2), D(-4)), head=(D(10), D(0)))
OVER_L = S_((-.18, -.26, .98), (.15, -.3, 1), chest=(D(-6), D(4), 0), head=(D(14), D(2)))
CUT_L_MID = S_((-.06, -.52, .76), (.7, -.6, .2), chest=(D(10), D(10), D(4)), head=(D(20), D(8)), rise=.04)
CUT_L_END = S_((.30, -.48, .40), (.7, -.15, -.7), chest=(D(34), D(16), D(10)), head=(D(30), D(18)), lean=D(6), rise=.06)
FOLLOW_L = S_((.22, -.20, .32), (.35, .45, -.8), chest=(D(36), D(12), D(10)), head=(D(28), D(14)), rise=.03)
THRUST_BACK = S_((-.26, -.06, .58), (0, -1, .06), chest=(D(14), D(-2), 0), head=(D(-4), D(4)))
THRUST_OUT = S_((-.24, -.72, .62), (0, -1, -.03), chest=(D(-16), D(18), 0), head=(D(-6), D(10)), lean=D(14), rise=.06)
PARRY = S_((-.24, -.26, .96), (1, -.25, .12), chest=(D(-4), D(-4), 0), head=(0, D(-12)))


def blend_state(a, b, t):
    return dict(G=a['G'].lerp(b['G'], t), B=a['B'].slerp(b['B'], t) if hasattr(a['B'], 'slerp') else a['B'].lerp(b['B'], t).normalized(),
                chest=tuple(x + (y - x) * t for x, y in zip(a['chest'], b['chest'])),
                head=tuple(x + (y - x) * t for x, y in zip(a['head'], b['head'])),
                lean=a['lean'] + (b['lean'] - a['lean']) * t, rise=a['rise'] + (b['rise'] - a['rise']) * t)


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
    """Put the sabre in the right hand for this state; returns the sabre bone's matrix."""
    G = seat + Rs @ st['G']; B = (Rs @ st['B']).normalized()
    sh = seat + Rs @ SHOULDER_R
    pose['hands']['Right'] = ('grip', G, B, sh - G)
    pose['curl']['Right'] = .95
    pose['elbow']['Right'] = Vector((.7, .3, -.5))
    pose['chest'] = (st['chest'][0], pose['chest'][1] + st['chest'][1], st['chest'][2])
    pose['head'] = st['head']
    h = pose['hips']
    pose['hips'] = (h[0] + Rs @ Vector((0, 0, st['rise'])), h[1], h[2] + st['lean'], h[3])
    return sabre_matrix(G, B, Rs)


def hilt_frame():
    """The scabbard's mouth and its direction (into the scabbard), as the rider sits now."""
    pb = P.pb['Rider:Hilt']
    Rh = pb.matrix.to_3x3() @ P.rest['Rider:Hilt'].to_3x3().inverted()
    sc = info['rider']['scabbard']
    d = (Vector(sc['tip']) - Vector(sc['mouth'])).normalized()
    return pb.head.copy(), (Rh @ d).normalized()


def sabre_clip(name, frames, keys, loop=False, react=None, stand_amp=0.0, events=None, draw=None):
    """A standing clip with the sabre: keys of sabre states; react(t) -> horse reaction dict;
    draw = (frames, reverse) for drawing it from (or returning it to) the scabbard."""
    act = K.new_action(rig, name)
    for f in range(1, frames + 1):
        t = (f - 1) / (frames - 1)
        P.reset()
        horse_stand(t if stand_amp else 0.0, stand_amp, react(t) if react else None)
        pose, Rs, seat = rider()
        pose['head'] = (0, D(-2))
        fr = f - 1 if not (draw and draw[1]) else frames - f
        M, hide_hilt, st = None, True, None
        if draw:
            R.set_pose(pose)                 # seat him first: the scabbard hangs from his hips
            M, hide_hilt = draw_pose(pose, Rs, seat, fr, keys)
        else:
            st = state_at(keys, f - 1)
            M = apply_sabre(pose, Rs, seat, st)
        R.set_pose(pose)
        P.set('Sabre', M if M is not None else HIDE)
        if hide_hilt:
            P.set('Rider:Hilt', P.pb['Rider:Hilt'].matrix @ HIDE)
        P.key_all(f)
    K.finish_action(rig, act, frames)
    return dict(frames=frames, loop=loop, root_speed=0.0, fps=K.FPS, events=events or {})


DRAW_T = dict(reach=8, grab=10, out=20, guard=30)


def draw_pose(pose, Rs, seat, fr, _keys):
    """The draw, frame fr (0 = Idle's pose, DRAW_T['guard'] = the guard). Returns (sabre matrix, hilt hidden)."""
    T = DRAW_T
    mouth, d = hilt_frame()
    rest_hand = seat + Rs @ Vector((-.20, -.22, .10))
    L_SAB = info['sabre']['length']
    if fr < T['grab']:
        # the right hand crosses the body to the hilt at the left hip
        k = ease('smooth', fr / T['grab'])
        grip_pt = mouth - d * .085
        w = rest_hand.lerp(grip_pt, k)
        if fr < T['reach']:
            pose['hands']['Right'] = ('wrist', w, Vector((.2, -1, -.6)), Vector((.6, 0, -.6)))
        else:
            pose['hands']['Right'] = ('grip', grip_pt, -d, (seat + Rs @ SHOULDER_R) - grip_pt)
            pose['curl']['Right'] = .95
        pose['chest'] = (D(28) * k, pose['chest'][1] + D(8) * k, 0); pose['head'] = (D(20) * k, D(-2) + D(16) * k)
        return None, False
    if fr < T['out']:
        # out along the scabbard, up and forward
        k = ease('in', (fr - T['grab']) / (T['out'] - T['grab']))
        grip_pt = mouth - d * (.085 + L_SAB * k)
        pose['hands']['Right'] = ('grip', grip_pt, -d, (seat + Rs @ SHOULDER_R) - grip_pt)
        pose['curl']['Right'] = .95
        pose['chest'] = (D(28) - D(20) * k, pose['chest'][1] + D(8), 0); pose['head'] = (D(20) - D(10) * k, D(14) - D(8) * k)
        pose['elbow']['Right'] = Vector((.4, .6, -.2))
        return sabre_matrix(grip_pt, -d, Rs), True
    # from the end of the draw to the guard
    k = ease('smooth', (fr - T['out']) / (T['guard'] - T['out']))
    G_out = mouth - d * (.085 + L_SAB)
    out = dict(G=Rs.inverted() @ (G_out - seat), B=(Rs.inverted() @ -d).normalized(), chest=(D(8), D(8), 0), head=(D(10), D(6)), lean=0.0, rise=0.0)
    st = blend_state(out, GUARD, k)
    return apply_sabre(pose, Rs, seat, st), True


def fight_react(t):
    """The horse in a melee: turning a little, tossing its head, tail switching (zero at both ends)."""
    env = math.sin(math.pi * t)
    return dict(yaw=D(10) * math.sin(2 * math.pi * 2 * t) * env, roll=D(2) * math.sin(2 * math.pi * 3 * t) * env,
                toss=D(-10) * max(0.0, math.sin(2 * math.pi * 4 * t)) * env, nod=D(6) * math.sin(2 * math.pi * 3 * t + 1) * env,
                tail=D(10) * env, dz=-.015 * env)


def jolt(t0, t1, amount):
    """A short reaction of the horse around a blow, between clip fractions t0 and t1."""
    def r(t):
        if not (t0 <= t <= t1):
            return {}
        e = math.sin(math.pi * (t - t0) / (t1 - t0))
        return dict(roll=amount * e, toss=-D(8) * e, nod=D(4) * e)
    return r


def cut_keys(side):
    if side == 'R':
        return [(0, GUARD, 'smooth'), (7, WIND_R, 'out'), (9, OVER_R, 'in'), (11, CUT_R_MID, 'linear'), (14, CUT_R_END, 'linear'), (20, FOLLOW_R, 'out'), (28, GUARD, 'smooth')]
    return [(0, GUARD, 'smooth'), (7, WIND_L, 'out'), (9, OVER_L, 'in'), (11, CUT_L_MID, 'linear'), (14, CUT_L_END, 'linear'), (20, FOLLOW_L, 'out'), (28, GUARD, 'smooth')]


THRUST_KEYS = [(0, GUARD, 'smooth'), (7, THRUST_BACK, 'out'), (11, THRUST_OUT, 'snap'), (15, THRUST_OUT, 'linear'), (24, GUARD, 'smooth')]
PARRY_KEYS = [(0, GUARD, 'smooth'), (5, PARRY, 'snap'), (8, S_(PARRY['G'] + Vector((0, .04, -.05)), PARRY['B'], (D(-4), D(-8), 0), (0, D(-8))), 'out'),
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
    keys = [(0, hi0, 'smooth'), (7, S_((-.12, .06, 1.0), (.1, .9, -.1), chest=(D(16), D(-2), D(-4)), head=(D(-15), 0)), 'out'),
            (9, OVER_R, 'in'),
            (11, S_((-.48, -.40, .78), (-.6, -.7, .2), chest=(D(-16), D(10), D(-8)), head=(D(-25), D(10)), rise=.03), 'linear'),
            (14, S_((-.56, -.26, .30), (-.45, -.3, -.8), chest=(D(-26), D(16), D(-14)), head=(D(-30), D(18)), lean=D(4), rise=.05), 'linear'),
            (19, S_((-.48, .06, .36), (-.2, .6, -.75), chest=(D(-26), D(10), D(-10)), head=(D(-25), D(10))), 'out'),
            (N, hi0, 'smooth')]
    act = K.new_action(rig, name)
    for f in range(1, N + 2):
        t = ((f - 1) % T) / T
        P.reset()
        dz, pitch = horse_gait(g, t)
        lean = D(16) + D(4)
        pose, Rs, seat = rider('Gallop', t, True, lean, -dz * .6)
        st = state_at(keys, f - 1)
        # the stride's sway of the raised sabre (as in GallopSabre) where the state is the raised one
        sway = math.sin(2 * math.pi * t)
        w = 1.0 - min(1.0, min(f - 1, N - (f - 1)) / 5.0)
        st = dict(st, G=st['G'] + Vector((0, -.03 * sway, .02 * sway)) * w,
                  B=(st['B'] + Vector((0, -.1 * sway, 0)) * w).normalized())
        M = apply_sabre(pose, Rs, seat, st)
        R.set_pose(pose)
        P.set('Sabre', M); P.set('Rider:Hilt', P.pb['Rider:Hilt'].matrix @ HIDE)
        P.key_all(f)
    K.finish_action(rig, act, N + 1)
    return dict(frames=N + 1, loop=False, root_speed=g['v'], fps=K.FPS, events={'hit': 13})


def build_draw(name, reverse=False):
    n = DRAW_T['guard'] + 1
    m = sabre_clip(name, n, None, draw=(n, reverse))
    m['events'] = {'drawn': DRAW_T['grab']} if not reverse else {'sheathed': n - 1 - DRAW_T['grab']}
    return m


CLIPS = {'Idle': lambda: build_idle(), 'Walk': lambda: build_cycle('Walk', 'Walk'), 'Trot': lambda: build_cycle('Trot', 'Trot'),
         'Gallop': lambda: build_cycle('Gallop', 'Gallop'), 'GallopSabre': lambda: build_cycle('GallopSabre', 'Gallop', sabre=True),
         'DrawSabre': lambda: build_draw('DrawSabre'),
         'SheatheSabre': lambda: build_draw('SheatheSabre', reverse=True),
         'IdleSabre': lambda: sabre_clip('IdleSabre', 49, [(0, GUARD, 'smooth'), (24, S_(GUARD['G'] + Vector((0, .02, -.02)), GUARD['B'], GUARD['chest'], (D(8), D(-2))), 'smooth'), (48, GUARD, 'smooth')],
                                         loop=True, stand_amp=.5),
         'SabreCutRight': lambda: sabre_clip('SabreCutRight', 29, cut_keys('R'), react=jolt(.4, .75, D(-3)), events={'hit': 13}),
         'SabreCutLeft': lambda: sabre_clip('SabreCutLeft', 29, cut_keys('L'), react=jolt(.4, .75, D(3)), events={'hit': 13}),
         'SabreThrust': lambda: sabre_clip('SabreThrust', 25, THRUST_KEYS, react=jolt(.35, .7, D(-2)), events={'hit': 11}),
         'SabreParry': lambda: sabre_clip('SabreParry', 21, PARRY_KEYS, react=jolt(.3, .65, D(2)), events={'parry': 8}),
         'SabreFight': lambda: sabre_clip('SabreFight', 117, fight_keys(), loop=True, react=fight_react,
                                          events={'hit': [13, 63, 93], 'parry': 40}),
         'GallopCut': lambda: gallop_cut()}
NEXT = {'Idle': ['DrawSabre'], 'DrawSabre': ['IdleSabre', 'SabreCutRight', 'SabreCutLeft', 'SabreThrust', 'SabreParry', 'SabreFight'],
        'IdleSabre': ['SabreCutRight', 'SabreCutLeft', 'SabreThrust', 'SabreParry', 'SabreFight', 'SheatheSabre'],
        'SabreCutRight': ['IdleSabre', 'SabreCutLeft', 'SabreThrust'], 'SabreCutLeft': ['IdleSabre', 'SabreCutRight'],
        'SabreThrust': ['IdleSabre', 'SabreParry'], 'SabreParry': ['IdleSabre', 'SabreCutRight'],
        'SabreFight': ['IdleSabre', 'SheatheSabre'], 'SheatheSabre': ['Idle'],
        'GallopSabre': ['GallopCut'], 'GallopCut': ['GallopSabre']}
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
