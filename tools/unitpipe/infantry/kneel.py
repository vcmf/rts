"""Kneeling: the front rank kneeling to fire and load, the kneeling square guard, and a fall.

Chain: Walking@1 -> Kneel -> KneelPresent -> KneelAim (loop) -> KneelFire -> KneelReload -> KneelPresent ...
Standing up is Kneel played backwards. KneelGuardReady/KneelGuard: the square's kneeling front rank,
butt on the ground, bayonet up at a horse's chest. KneelFall: shot while kneeling, falls and lies.

The kneeling keys are the standing drill keys (T.READY, T.PRESENT, T.LOAD, T.CAST) with the body
lowered onto the right knee: chest-space targets follow the chest; world-space poles and targets are
lowered here.
"""
import math


def author(k, T):
    V, Q, key, alter, clip = T.V, T.Q, T.key, T.alter, T.clip
    DZ = -.255   # how far world-space hand poles and targets drop when kneeling

    def lowered(K, dz=DZ):
        """K with its world-space targets and poles dropped by dz (chest-space ones follow the body)."""
        out = dict(K)
        hands = {}
        for side, (kind, where, palm, pole, space) in K['hands'].items():
            if space == 'world':
                pole = V(pole) + V((0, 0, dz))
                if kind in ('free', 'relaxed'): where = V(where) + V((0, 0, dz))
            hands[side] = (kind, where, palm, pole, space)
        out['hands'] = hands
        g = K['gun']
        if g[0] == 'world': out['gun'] = (g[0], g[1], V(g[2]) + V((0, 0, dz)), g[3], g[4])
        elif g[0] == 'q': out['gun'] = ('q', g[1], V(g[2]) + V((0, 0, dz)), g[3])
        return out

    # Right knee on the ground, toes tucked under (foot near vertical); left foot forward, flat, its
    # shin near vertical. The knee pole points the right knee down and forward onto the ground.
    KSTANCE = {'Left': (V((.075, -.200, .069)), -.20, 0),
               'Right': (V((-.070, .290, .105)), -.15, .90, V((-.070, -.30, -.60)))}
    KHIPS = V((0, .030, -.272))

    KREADY = alter(lowered(T.READY), hips=(KHIPS, -.42, .05, 0), feet=KSTANCE)
    KPRESENT = alter(lowered(T.PRESENT), hips=(KHIPS + V((0, -.010, -.004)), -.52, .10, 0), feet=KSTANCE)
    KLOAD = alter(lowered(T.LOAD), hips=(KHIPS + V((0, -.005, 0)), -.42, .10, 0), feet=KSTANCE)
    # Loading kneeling: butt on the ground ahead of the left knee, the musket leaning back toward the
    # right shoulder so the muzzle and the drawn ramrod stay within the arm's reach.
    KCAST = alter(lowered(T.CAST), hips=(KHIPS + V((0, 0, .027)), -.30, .10, 0), feet=KSTANCE,
                  gun=('world', 'StockContact', (.323, -.478, .043), (-.568, .512, .645), (-1, 0, 0)))   # fitted: grips 35-90% of reach, muzzle and bayonet outside the right shoulder

    # ---------------------------------------------------------------- kneel down
    KMID = alter(T.CARRY, hips=(V((0, .015, -.120)), -.22, .05, 0), head=(-.05, .02, 0),
                 feet={'Left': (V((.075, -.150, .069)), -.15, 0), 'Right': (V((-.068, .130, .075)), -.08, .30)},
                 gun=('chest', 'CarryGrip', (.050, -.150, .600), (-.05, -.10, 1), (-.2, -1, 0)),
                 hands={'Right': ('gun', 'TriggerGrip', (.6, .2, 0), (-.26, .05, .52), 'chest'),
                        'Left': ('gun', 'CarryGrip', (-.6, .5, 0), (.20, -.05, .50), 'chest')})
    kneel = clip('Kneel', [
        (1, T.CARRY, {}),
        (11, KMID, {'pivot': 'CarryGrip', 'feet': {'Left': (.0, .6), 'Right': (.2, 1.)}, 'hand_arc': {'Right': (0, -.04, .03)}}),
        (24, KREADY, {'hand_arc': {'Left': (.03, -.05, .02)}, 'feet': {'Right': (0, .8)}, 'lift': .0}),
    ])

    # ---------------------------------------------------------------- fire
    present = clip('KneelPresent', [
        (1, KREADY, {}),
        (11, KPRESENT, {'arc': (0, -.02, .02), 'pivot': (-.108, -.132, .29)}),
    ])
    aim = clip('KneelAim', [(1, KPRESENT, {}), (25, KPRESENT, {'ease': 'linear'})], extra=T.aim_extra)
    fire = clip('KneelFire', [
        (1, KPRESENT, {}),
        (12, KPRESENT, {'ease': 'linear'}),
        (28, KLOAD, {'pivot': (-.112, -.132, .42)}),
    ], extra=T.fire_extra)
    # The swing to the cast pivots about the butt, so the butt travels straight to the ground. After the
    # rod is home the right hand lets go; the left hand slides the butt along the ground in front of the
    # left toe and stands the musket up (UPRIGHT), so the butt never sweeps through the left shin, then
    # raises it to the ready where the right hand takes the grip again.
    UPRIGHT = alter(KREADY, gun=('world', 'StockContact', (-.050, -.360, .050), (0, .40, .92), (-1, 0, 0)),
                    hands={'Right': ('free', (-.130, -.120, .560), (1, 0, 0), (-.28, .08, .50), 'chest'),
                           'Left': ('gun', (-.120, -.131, .450), (-1, .2, 0), (.24, -.02, .45), 'chest')})
    # The cast goes the same way in reverse: the butt is first set down in front of the left toe
    # (CASTMID, right hand free), then slid along the ground to the cast position.
    CASTMID = alter(KCAST, gun=('world', 'StockContact', (-.050, -.360, .050), (0, .40, .92), (-1, 0, 0)),
                    hands={'Right': ('free', (-.130, -.120, .560), (1, 0, 0), (-.28, .08, .50), 'chest'),
                           'Left': ('gun', (-.120, -.131, .450), (-1, .2, 0), (.24, -.02, .45), 'chest')})
    keys = T.reload_keys(KLOAD, KCAST, KREADY, cast_opts={'pivot': 'StockContact'})
    assert keys[-2][0] == 252 and keys[-1][0] == 272
    i94 = next(i for i, kk in enumerate(keys) if kk[0] == 94)
    assert keys[i94 - 1][0] == 70
    keys = keys[:i94] + [(82, CASTMID, {'pivot': 'StockContact'})] + keys[i94:]
    keys = keys[:-1] + [(262, UPRIGHT, {'pivot': 'StockContact'}), (272, KREADY, {'hand_arc': {'Right': (0, -.03, .02)}})]
    reload = clip('KneelReload', keys)

    # ---------------------------------------------------------------- square guard
    KGUARD = alter(KREADY, hips=(KHIPS + V((0, -.010, 0)), -.35, .12, 0), chest=(-.05, .10, 0), head=(.02, .10, 0),
                   gun=('world', 'StockContact', (-.092, .149, .026), (.017, -.681, .732), (-1, 0, .3)),   # fitted
                   hands={'Right': ('gun', (-.085, -.128, .300), (1, 0, .3), (-.30, .10, .30), 'world'),
                          'Left': ('gun', (-.108, -.130, .500), (-1, 0, .6), (.22, -.15, .25), 'world')})

    def guard_extra(f, P):   # breathing and a small wander of the point about the grounded butt; period 32
        w = 2 * math.pi * (f - 1) / 32
        cy, cl, cr = P['chest']; P['chest'] = (cy + .010 * math.sin(w), cl + .012 * math.sin(2 * w), cr)

        def post(gun):
            o, q = gun; piv = V(T.A['StockContact']); p = T.gun_point(gun, piv)
            dq = Q((0, 0, 1), .025 * math.sin(w)) @ Q((1, 0, 0), .015 * math.sin(2 * w))
            q2 = dq @ q; return p - q2 @ (piv - T.grip0), q2
        P['gun_post'] = post
        return P
    guard_ready = clip('KneelGuardReady', [(1, KREADY, {}), (16, KGUARD, {'pivot': 'TriggerGrip', 'arc': (0, -.03, .02)})])
    guard = clip('KneelGuard', [(1, KGUARD, {}), (33, KGUARD, {'ease': 'linear'})], extra=guard_extra)

    # ---------------------------------------------------------------- fall
    # Hit: jerks back still holding the musket; lets go and it drops forward to the ground; the body
    # sags and topples onto its left side and lies with the legs bent forward.
    HIT = alter(KREADY, hips=(KHIPS + V((0, .030, .008)), -.36, -.14, .04), chest=(.06, -.20, .05), head=(-.05, -.38, .10))
    GROUND_GUN = ('world', 'StockContact', (.050, -.330, .018), (.25, -.97, 0), (0, 0, 1))
    DROP = alter(HIT, hips=(KHIPS + V((.020, .040, -.010)), -.30, -.05, .25), chest=(.08, .05, .12), head=(.05, -.10, .30),
                 gun=GROUND_GUN,
                 hands={'Right': ('free', (-.150, -.120, .380), (1, 0, 0), (-.30, .10, .40), 'chest'),
                        'Left': ('free', (.170, -.120, .380), (-1, 0, 0), (.30, .10, .40), 'chest')})
    SLUMP = alter(DROP, hips=(V((.150, .040, -.300)), -.30, .15, .85), chest=(.05, .20, .15), head=(.05, .20, .90),
                  feet={'Left': (V((.120, -.180, .066)), .10, 0, V((.40, -.50, .10))),
                        'Right': (V((.020, .240, .090)), .00, .60, V((.30, -.40, -.20)))},
                  hands={'Right': ('free', (.050, -.250, .200), (0, 0, -1), (-.10, .10, .40), 'world'),
                         'Left': ('free', (.350, -.150, .080), (0, 0, -1), (.40, .10, .30), 'world')})
    LIE = alter(SLUMP, hips=(V((.320, .050, -.364)), -.30, .20, 1.50), chest=(.05, .25, .10), head=(.0, .25, 1.50),
                feet={'Left': (V((.260, -.200, .055)), .30, -.20, V((.40, -.70, .05))),
                      'Right': (V((.310, -.050, .160)), .30, -.20, V((.45, -.70, .25)))},
                hands={'Right': ('free', (.330, -.300, .140), (0, 0, -1), (.40, .10, .40), 'world'),
                       'Left': ('free', (.420, -.380, .040), (0, 0, -1), (.60, .10, .20), 'world')})
    fall = clip('KneelFall', [
        (1, KREADY, {}),
        (4, HIT, {'ease': 'out'}),
        (9, DROP, {'ease': 'in'}),
        (16, SLUMP, {'ease': 'in'}),
        (22, LIE, {'ease': 'in'}),
        (30, alter(LIE, chest=(.05, .27, .10), head=(.0, .27, 1.52)), {'ease': 'out'}),
    ])

    return [kneel, present, aim, fire, reload, guard_ready, guard, fall], {
        'Kneel': dict(frames=24, loop=False, starts='Walking@1', ends='KneelPresent@1|KneelGuardReady@1|KneelFall@1', reverse_to='Walking@1'),
        'KneelPresent': dict(frames=11, loop=False, starts='Kneel@end|KneelReload@end', ends='KneelAim@1', reverse_to='Kneel@end', aim=[6, 11]),
        'KneelAim': dict(frames=25, loop=True, starts='KneelPresent@end', ends='KneelAim@1', aim=[1, 25]),
        'KneelFire': dict(frames=28, loop=False, starts='KneelPresent@end|KneelAim@1', ends='KneelReload@1', events={'fire': T.SHOT}, aim=[1, 12]),
        'KneelReload': dict(frames=272, loop=False, starts='KneelFire@end', ends='KneelPresent@1', ramrod=True,
                            events={'rod_drawn': 144, 'rammed': 181, 'rod_returned': 252}),
        'KneelGuardReady': dict(frames=16, loop=False, starts='Kneel@end', ends='KneelGuard@1', reverse_to='Kneel@end'),
        'KneelGuard': dict(frames=33, loop=True, starts='KneelGuardReady@end', ends='KneelGuard@1'),
        'KneelFall': dict(frames=30, loop=False, starts='Kneel@end', ends='still', events={'down': 22}, lies=True),
    }
