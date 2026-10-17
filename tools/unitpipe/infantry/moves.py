"""Movement clips: standing, turning on the spot, stepping back and sideways, trail arms (skirmishers)
and the bayonet charge, authored with the drill toolkit (AUTHORING.md).

Gaits here are speed-locked: a stance foot moves at constant speed in the root frame for exactly
half the cycle, so moving the root at the clip's root_speed keeps it planted. Their first frame is
the exchange moment of the walk's stride (k.WALK_HALF), which is Walking frame 1 (CARRY's stance),
so they join the walk and the transitions exactly. The feet are k.walk_feet, the same as Walking.
"""
import math
from mathutils import Vector as V

FOOT_X = {'Left': .085, 'Right': -.065}


def author(k, T):
    key, alter, Q, smooth, clip = T.key, T.alter, T.Q, T.smooth, T.clip
    CARRY, carry_yaw = T.CARRY, T.carry_yaw
    acts, table = [], {}
    STRIDE = k.WALK_HALF   # half stride, as Walking

    def add(name, keys, extra=None, **entry):
        acts.append(clip(name, keys, extra=extra))
        table[name] = dict(frames=keys[-1][0], **entry)

    def speed(N, half):   # stance foot travels 2*half in N/2 frames
        return round(2 * half / (N / 2) * 24, 4)

    # ------------------------------------------------------------ gaits
    def gait(N, half=None, lift=.045, backward=False, sway=carry_yaw, bob=.006):
        """Speed-locked walk under the key's upper body. Deltas from the key are zero on frame 1, so the
        clip's first frame is exactly its key (feet: CARRY's stance)."""
        def extra(f, P):
            t = ((f - 1) % N) / N
            off, yaw, lean, roll = P['hips']
            P['hips'] = (off + V((0, 0, bob * (1 - math.cos(4 * math.pi * t)) / 2)),
                         yaw + sway * (math.cos(2 * math.pi * t) - 1), lean, roll)
            P['feet'] = k.walk_feet(t, STRIDE if half is None else half, lift, backward)
            return P
        return extra

    def run_gait():
        """T.run_extra, but as deltas from the key's hips so frame 1 is the key."""
        base = T.run_extra()
        def extra(f, P):
            off, yaw, lean, roll = P['hips']; cy, cl, cr = P['chest']
            P = base(f, P)
            o2, y2, l2, r2 = P['hips']
            P['hips'] = (V((off.x, o2.y, o2.z)), yaw + y2, l2, roll)
            return P
        return extra

    def swing_keys(K, N, side, a, b):
        """Loop keys (1, N/2+1, N+1) swinging the hanging free arm of K between angles a and b."""
        kind, _, palm, pole, space = K['hands'][side]
        Ka = alter(K, hands={side: (kind, a, palm, pole, space)})
        Kb = alter(K, hands={side: (kind, b, palm, pole, space)})
        return [(1, Ka, {}), (N // 2 + 1, Kb, {}), (N + 1, Ka, {})]

    # ------------------------------------------------------------ standing at shoulder arms
    STAND = key(
        hips=(V((0, 0, -.010)), 0, 0, 0), head=(0, 0, 0),
        feet={'Left': (V((.050, 0, .069)), .20, 0), 'Right': (V((-.040, 0, .069)), -.20, 0)},
        gun=('q', 'CarryGrip', V((.152, -.068, .525)), Q((1, 0, 0), -.28) @ Q((0, 1, 0), -.05)),
        hands={'Left': CARRY['hands']['Left'],
               'Right': ('hang', 0., (1, 0, 0), (0, 0, 0), 'world')})   # arm hanging straight
    add('Halt', [(1, CARRY, {}), (17, STAND, {'feet': {'Right': (0, .55), 'Left': (.45, 1)}, 'lift': .03})],
        loop=False, starts='Walking@1', ends='Stand@1', reverse_to='Walking@1')

    def stand_extra(f, P):   # one slow breath and a weight shift per 4 s loop; feet stay planted
        w = 2 * math.pi * (f - 1) / 96
        shift = V((.007 * math.sin(w), .002 * math.sin(2 * w), -.003 * (1 - math.cos(2 * w)) / 2))
        off, y, l, r = P['hips']; P['hips'] = (off + shift, y + .02 * math.sin(w), l, r - .015 * math.sin(w))
        cy, cl, cr = P['chest']; P['chest'] = (cy - .015 * math.sin(w), cl + .012 * (1 - math.cos(w)) / 2, cr + .02 * math.sin(w))
        hy, hp, hr = P['head']; P['head'] = (hy + .05 * math.sin(2 * w + .7) * math.sin(w / 2) ** 2, hp, hr)
        P['gun_post'] = lambda gun: (gun[0] + shift * .7, gun[1])
        return P
    add('Stand', [(1, STAND, {}), (97, STAND, {'ease': 'linear'})], extra=stand_extra,
        loop=True, starts='Halt@end', ends='Stand@1')

    # ------------------------------------------------------------ turns on the spot
    def turn(name, angle, steps, D=8):
        """Steps that turn CARRY's stance by angle (radians, + = left) about the root. Each step lifts
        one foot and puts it down at its stance position for the next root angle; the other stays
        planted (world). The last step brings the trailing foot up."""
        S0 = {sd: V(ft[0]) for sd, ft in CARRY['feet'].items()}
        lead = 'Left' if angle > 0 else 'Right'; other = 'Right' if lead == 'Left' else 'Left'
        plan = []   # (foot, root_from, root_to, world_from, world_to, yaw_from, yaw_to)
        where = {sd: (S0[sd].copy(), 0.) for sd in S0}
        for i in range(1, steps + 1):
            foot = lead if i % 2 else other
            r0, r1 = angle * (i - 1) / steps, angle * i / steps
            plan.append((foot, r0, r1, where[foot], (Q((0, 0, 1), r1) @ S0[foot], r1)))
            where[foot] = plan[-1][4]
        last = other if steps % 2 else lead
        plan.append((last, angle, angle, where[last], (Q((0, 0, 1), angle) @ S0[last], angle)))
        frames = len(plan) * D + 1

        def extra(f, P):
            i = min((f - 1) // D, len(plan) - 1); s = ((f - 1) - i * D) / D if f < frames else 1.
            e = smooth(s)
            foot, r0, r1, (p0, y0), (p1, y1) = plan[i]
            root = r0 + (r1 - r0) * e
            P['root'] = root
            feet = {}
            for sd in ('Left', 'Right'):
                if sd == foot:
                    wp = p0.lerp(p1, e) + V((0, 0, .03 * math.sin(math.pi * s))); wy = y0 + (y1 - y0) * e
                else:   # planted where its last step put it
                    wp, wy = next(((q1, z1) for (ft, _, _, _, (q1, z1)) in reversed(plan[:i]) if ft == sd), (S0[sd], 0.))
                feet[sd] = (T.planted(wp, root), wy - root, 0)
            P['feet'] = feet
            off, yaw, lean, roll = P['hips']
            P['hips'] = (off + V((0, 0, -.008 * math.sin(math.pi * s))), yaw, lean, roll)
            return P
        add(name, [(1, CARRY, {}), (frames, T.rotate_key(CARRY, angle), {'ease': 'linear'})], extra=extra,
            loop=False, starts='Walking@1', ends='Walking@1', root_turn=round(math.degrees(angle)))
    turn('TurnLeft', math.pi / 2, 2)
    turn('TurnRight', -math.pi / 2, 2)
    turn('AboutFace', math.pi, 4)

    # ------------------------------------------------------------ stepping back, in good order
    NB = 48   # 60 steps a minute backward: 0.6 m/s
    back_keys = swing_keys(CARRY, NB, 'Right', k.ARM_SWING, -.12)   # a short swing, against the legs
    add('WalkBackward', back_keys, extra=gait(NB, backward=True, lift=.035),
        loop=True, starts='Walking@1', ends='WalkBackward@1', root_speed=speed(NB, STRIDE),
        root_direction='back')

    # ------------------------------------------------------------ side steps from the stand
    NS, DS = 24, .04   # cycle frames, half of one foot's sideways travel

    def side_gait(direction):
        """Close step: the leading foot swings out while the trailing foot stands, then the trailing
        foot swings in while the leading foot stands. Stance feet move at constant speed against the
        direction of travel, so the root moves at root_speed sideways."""
        lead = 'Left' if direction > 0 else 'Right'
        start = {sd: STAND['feet'][sd][0].x for sd in ('Left', 'Right')}

        def extra(f, P):
            t = ((f - 1) % NS) / NS
            feet = {}
            for sd in ('Left', 'Right'):
                pos, fy, fp = STAND['feet'][sd]
                if sd == lead:   # swing first half (out by 2DS), stand second half (back to start)
                    if t < .5: s = t / .5; x = start[sd] + 2 * DS * direction * smooth(s); z = .069 + .03 * math.sin(math.pi * s)
                    else: s = (t - .5) / .5; x = start[sd] + 2 * DS * direction * (1 - s); z = .069
                else:            # stand first half (out by -2DS), swing second half (back to start)
                    if t < .5: s = t / .5; x = start[sd] - 2 * DS * direction * s; z = .069
                    else: s = (t - .5) / .5; x = start[sd] - 2 * DS * direction * (1 - smooth(s)); z = .069 + .03 * math.sin(math.pi * s)
                feet[sd] = (V((x, pos.y, z)), fy, fp)
            P['feet'] = feet
            off, yaw, lean, roll = P['hips']
            P['hips'] = (off + V((DS * direction * math.sin(2 * math.pi * t) * .4, 0, .004 * (1 - math.cos(4 * math.pi * t)) / 2)), yaw, lean, roll)
            return P
        return extra
    for name, d in (('SideStepLeft', 1), ('SideStepRight', -1)):
        add(name, [(1, STAND, {}), (NS + 1, STAND, {'ease': 'linear'})], extra=side_gait(d),
            loop=True, starts='Stand@1', ends=name + '@1', root_speed=speed(NS, 2 * DS) / 2,
            root_direction='left' if d > 0 else 'right')

    # ------------------------------------------------------------ trail arms (skirmishers)
    BAL = (-.098, -.126, .330)   # balance of the musket, on the stock below the barrel
    TRAIL = alter(CARRY,
        gun=('chest', BAL, (-.125, -.020, .470), (0, -1, .12), (0, 0, -1)),
        hands={'Right': ('gun', BAL, (1, 0, 0), (-.22, .15, .60), 'world'),
               'Left': ('hang', -k.ARM_SWING, (-1, 0, 0), (0, 0, 0), 'world')})   # forward: the left foot is back
    SEIZE = alter(CARRY,
        gun=('chest', 'CarryGrip', (.060, -.130, .540), (-.15, -.25, 1), (-.4, -1, 0)),
        hands={'Right': ('gun', BAL, (1, 0, 0), (-.26, .05, .52), 'chest'),
               'Left': ('gun', 'CarryGrip', (-.6, .5, 0), (.20, -.05, .50), 'chest')})
    add('TrailArms', [(1, CARRY, {}),
                      (9, SEIZE, {'pivot': 'CarryGrip', 'hand_arc': {'Right': (0, -.05, .03)}}),
                      (19, TRAIL, {'pivot': BAL, 'arc': (0, -.06, 0)})],
        loop=False, starts='Walking@1', ends='TrailWalk@1', reverse_to='Walking@1')
    NT = 32
    add('TrailWalk', swing_keys(TRAIL, NT, 'Left', -k.ARM_SWING, k.ARM_SWING), extra=gait(NT),
        loop=True, starts='TrailArms@end', ends='TrailWalk@1', root_speed=speed(NT, STRIDE))
    TRAIL_RUN = alter(TRAIL, gun=('chest', BAL, (-.125, -.030, .470), (0, -1, .40), (0, 0, -1)))   # level despite the run's lean
    add('TrailRun', [(1, TRAIL_RUN, {}), (k.RUN_FRAMES + 1, TRAIL_RUN, {'ease': 'linear'})], extra=run_gait(),
        loop=True, starts='TrailRun@1', ends='TrailRun@1', root_speed=round(k.RUN_SPEED, 4))

    # ------------------------------------------------------------ the bayonet charge
    LEVEL = alter(CARRY,
        hips=(V((0, 0, -.016)), carry_yaw - .30, .04, 0), chest=(-.32, .06, 0), head=(0, .03, 0),
        gun=('mix', 'TriggerGrip', (-.085, -.020, .500), (.05, -1, .14), (-1, 0, .40)),
        hands={'Right': ('gun', 'TriggerGrip', (1, 0, .2), (-.26, .15, .45), 'world'),
               'Left': ('gun', (-.080, -.120, .340), (-1, 0, .6), (.22, -.15, .40), 'world')})
    PORT = alter(CARRY,
        gun=('chest', 'CarryGrip', (.040, -.150, .560), (.05, -.45, .90), (-.6, -.6, 0)),
        hands={'Right': ('gun', 'TriggerGrip', (1, 0, .2), (-.26, .10, .48), 'world')})
    add('LevelBayonets', [(1, CARRY, {}),
                          (9, PORT, {'pivot': 'CarryGrip', 'hand_arc': {'Right': (0, -.04, .03)}}),
                          (19, LEVEL, {'pivot': 'TriggerGrip', 'hand_arc': {'Left': (.03, -.06, .02)}})],
        loop=False, starts='Walking@1', ends='ChargeWalk@1', reverse_to='Walking@1')
    NC = 24   # pas de charge: 120 steps a minute
    add('ChargeWalk', [(1, LEVEL, {}), (NC + 1, LEVEL, {'ease': 'linear'})], extra=gait(NC, sway=.05),
        loop=True, starts='LevelBayonets@end', ends='ChargeWalk@1', root_speed=speed(NC, STRIDE))
    add('ChargeRun', [(1, LEVEL, {}), (k.RUN_FRAMES + 1, LEVEL, {'ease': 'linear'})], extra=run_gait(),
        loop=True, starts='ChargeRun@1', ends='ChargeRun@1', root_speed=round(k.RUN_SPEED, 4))
    return acts, table
