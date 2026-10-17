"""Morale clips: wavering, rout, cheer, surrender, order arms.

Waver (shoulder arms -> crouched, musket clutched at port) and the Shaken loop; RoutTurn (about turn
into the run, root turns 180) and the RoutRun loop (musket trailed, looking back); Cheer (musket
raised overhead); Surrender (musket dropped, hands up) and the SurrenderIdle loop; OrderArms (butt
grounded by the right foot) and the OrderArmsIdle loop. All start from Walking@1 (== T.CARRY).
"""
import math


def author(k, T):
    V, Q, key, alter, clip, smooth = T.V, T.Q, T.key, T.alter, T.clip, T.smooth
    CARRY = T.CARRY

    def off_shoulder(K, dv):
        """K with the shouldered musket pulled clear of the shoulder by dv (world), same angle: taking the
        musket off (or putting it back on) the shoulder without sweeping it through the body."""
        g = CARRY['gun']; return alter(K, gun=('q', g[1], V(g[2]) + V(dv), g[3]))
    BARREL = lambda z: V((-.112, -.132, .310)).lerp(V((-.138, -.128, .772)), (z - .310) / (.772 - .310))   # gun-local barrel point

    def bake(K, extra, f):
        """K with the numbers extra(f) gives it, so a clip without that extra ends exactly on its frame f."""
        P = extra(f, dict(K))
        return alter(K, hips=P['hips'], chest=P['chest'], head=P['head'], feet=P['feet'])

    def loop_extra(period, hips_x=0., hips_yaw=0., lean=0., chest=0., head_yaw=0., head_pitch=0., bob=0.):
        """Small idle motion, exactly zero at frame 1 and at 1 + period."""
        def extra(f, P):
            w = 2 * math.pi * (f - 1) / period
            off, y, l, r = P['hips']
            P['hips'] = (V(off) + V((hips_x * math.sin(w), 0, bob * (math.cos(2 * w) - 1) / 2)), y + hips_yaw * math.sin(w), l + lean * math.sin(2 * w), r)
            cy, cl, cr = P['chest']; P['chest'] = (cy - .5 * hips_yaw * math.sin(w), cl + chest * math.sin(2 * w), cr)
            hy, hp, hr = P['head']; P['head'] = (hy + head_yaw * math.sin(w), hp + head_pitch * math.sin(2 * w), hr)
            return P
        return extra

    def feet_schedule(plan):
        """Feet from world-space waypoints {side: [(frame, (x, y, z), yaw, pitch), ...]}: a foot whose
        position does not change between waypoints stays exactly planted on the ground however the
        root turns; one that moves steps with a lift. Converted to the root frame every frame."""
        def at(side, f):
            pts = plan[side]
            if f <= pts[0][0]: return pts[0][1:]
            for (f0, p0, y0, t0), (f1, p1, y1, t1) in zip(pts, pts[1:]):
                if f0 <= f <= f1:
                    s = smooth((f - f0) / (f1 - f0)); p0, p1 = V(p0), V(p1)
                    if (p1 - p0).length < 1e-9: return p0, y0 + (y1 - y0) * s, t0 + (t1 - t0) * s
                    p = p0.lerp(p1, s); p.z += .040 * math.sin(math.pi * s)
                    return p, y0 + (y1 - y0) * s, t0 + (t1 - t0) * s
            return pts[-1][1:]

        def extra(f, P):
            root = P.get('root', 0); R = Q((0, 0, 1), -root); feet = {}
            for side in plan:
                p, yaw, pitch = at(side, f)
                feet[side] = (R @ V(p), yaw - root, pitch)
            P['feet'] = feet
            return P
        return extra

    # ------------------------------------------------------------------ order arms
    ORDER_FEET = {'Left': (V((.065, .005, .069)), .22, 0), 'Right': (V((-.060, .005, .069)), -.22, 0)}
    # the musket as Tripo modelled it (upright at the right side, lock forward), butt grounded
    order_gun = ('q', 'StockContact', (-.050, -.105, .025), Q((0, 0, 1), 0))
    ORDER = key(
        hips=(V((0, .004, -.010)), 0, 0, 0), head=(0, 0, 0), feet=ORDER_FEET, gun=order_gun,
        hands={'Right': ('gun', BARREL(.55), (1, .2, 0), (-.30, .12, .50), 'world'),
               'Left': ('hang', 0., (-1, 0, 0), (0, 0, 0), 'world')})
    order_grab = alter(CARRY, hands={'Right': ('gun', BARREL(.42), (1, 0, -.4), (-.25, -.05, .60), 'world')})
    order_side = alter(ORDER, gun=('q', 'StockContact', (-.040, -.125, .085), Q((0, 1, 0), .06)),
                       hips=(V((0, .002, -.011)), .03, 0, 0), head=(0, .05, 0),
                       hands={'Left': ('hang', .05, (-1, 0, 0), (0, 0, 0), 'world')})
    order_arms = clip('OrderArms', [
        (1, CARRY, {}),
        (8, order_grab, {'hand_arc': {'Right': (.02, -.04, .03)}}),
        (12, off_shoulder(order_grab, (-.030, -.110, .020)), {}),
        (17, order_side, {'pivot': BARREL(.42), 'arc': (-.03, -.06, 0), 'hand_arc': {'Left': (.02, -.03, .02)},
                          'feet': {'Right': (.1, .6), 'Left': (.4, .95)}}),
        (23, alter(order_side, gun=order_gun), {'ease': 'out'}),
        (30, ORDER, {'hand_arc': {'Left': (.03, 0, .02)}}),
    ])
    order_idle = clip('OrderArmsIdle', [(1, ORDER, {}), (49, ORDER, {'ease': 'linear'})],
                      extra=loop_extra(48, hips_x=.006, hips_yaw=.03, chest=.008, head_yaw=.10, head_pitch=.02))

    # ------------------------------------------------------------------ cheer
    # Musket held by the small of the stock on a near-straight right arm, so the whole musket and
    # bayonet stand above the head (the shape that reads from the RTS camera); left fist up; two pumps.
    UP = alter(CARRY, hips=(V((0, .010, -.008)), .02, -.03, 0), chest=(.05, -.10, 0), head=(0, -.30, 0),
               gun=('world', 'TriggerGrip', (-.150, -.020, .925), (.06, -.10, 1), (0, -1, 0)),
               hands={'Right': ('gun', 'TriggerGrip', (1, .2, 0), (-.40, .10, .85), 'world'),
                      'Left': ('free', (.190, -.060, 1.030), (-1, 0, 0), (.42, .05, .80), 'world')}, curl=1)
    UP2 = alter(UP, gun=('world', 'TriggerGrip', (-.145, -.030, .860), (.08, -.14, 1), (0, -1, 0)),
                hands={'Left': ('free', (.185, -.070, .960), (-1, 0, 0), (.42, .05, .76), 'world')},
                chest=(.04, -.06, 0), head=(0, -.22, 0))
    cheer_grab = alter(CARRY, hands={'Right': ('gun', BARREL(.36), (1, 0, -.4), (-.25, -.05, .62), 'world')})
    cheer = clip('Cheer', [
        (1, CARRY, {}),
        (7, cheer_grab, {'hand_arc': {'Right': (.02, -.04, .03)}}),
        (10, off_shoulder(cheer_grab, (-.030, -.110, .030)), {}),
        (15, UP, {'ease': 'out', 'pivot': 'TriggerGrip', 'arc': (-.02, -.03, .03), 'hand_arc': {'Left': (.04, -.10, .02)}}),
        (20, UP2, {}), (25, UP, {'ease': 'out'}), (30, UP2, {}), (34, UP, {'ease': 'out'}),
        (40, off_shoulder(cheer_grab, (-.030, -.110, .030)), {'pivot': 'TriggerGrip', 'arc': (-.02, -.03, .03), 'hand_arc': {'Left': (.04, -.10, .02)}}),
        (44, cheer_grab, {}),
        (51, CARRY, {'hand_arc': {'Right': (.02, -.04, .03)}}),
    ])

    # ------------------------------------------------------------------ surrender
    hands_up = {'Right': ('free', (-.165, -.050, .950), (0, -1, 0), (-.42, .06, .72), 'world'),
                'Left': ('free', (.180, -.050, .945), (0, -1, 0), (.42, .06, .72), 'world')}
    SURR_FEET = {'Left': (V((.075, .030, .069)), .20, 0), 'Right': (V((-.060, .035, .069)), -.20, 0)}
    lie_gun = ('world', 'StockContact', (.130, -.200, .027), (.35, -1, 0), (0, 0, 1))   # the butt stays where it landed
    SURR = key(hips=(V((0, .015, -.020)), 0, -.02, 0), chest=(0, .05, 0), head=(0, .12, 0), feet=SURR_FEET,
               gun=lie_gun, hands=hands_up, curl=-.45, curl_right=-.6)   # hands opened; the right hand is modelled as a grip and only half opens cleanly
    lift = alter(CARRY, gun=('world', 'CarryGrip', (.140, -.080, .530), (.25, -.55, .80), (-.3, -.9, 0)),
                 hands={'Left': ('gun', 'CarryGrip', (-1, 0, .1), (.30, .10, .45), 'world')}, head=(0, .25, 0))
    drop = alter(lift, gun=('world', 'CarryGrip', (.170, -.140, .420), (.25, -.60, .75), (-.3, -.9, 0)),
                 hands={'Left': ('free', (.150, -.090, .500), (0, -1, -.3), (.30, .10, .45), 'world')}, curl=.4)
    butt_down = alter(drop, gun=('world', 'StockContact', (.130, -.200, .028), (.30, -.75, .55), (0, -.4, .9)))
    surrender = clip('Surrender', [
        (1, CARRY, {}),
        (9, lift, {'pivot': 'CarryGrip'}),
        (12, drop, {'ease': 'linear', 'pivot': 'CarryGrip'}),
        (17, butt_down, {'ease': 'in', 'pivot': 'StockContact'}),
        (23, alter(SURR, hands=hands_up), {'ease': 'in', 'pivot': 'StockContact', 'feet': {'Right': (.2, .7), 'Left': (.5, 1)},
                                         'hand_arc': {'Left': (.05, -.05, .05), 'Right': (-.05, -.05, .05)}}),
        (30, SURR, {}),
    ])
    surrender_idle = clip('SurrenderIdle', [(1, SURR, {}), (41, SURR, {'ease': 'linear'})],
                          extra=loop_extra(40, hips_x=.004, chest=.012, head_yaw=.22, head_pitch=.04, bob=.006))

    # ------------------------------------------------------------------ waver / shaken
    # left hand on the side of the forestock, below the barrel line: on PortGrip itself the cuff
    # went through the stock (6 vertices inside); here 0, wrist 22 mm clear
    PORT_LEFT, PORT_PALM = (-.092, -.120, .420), (0, .8, .3)
    port_gun = ('chest', 'TriggerGrip', (-.060, -.150, .540), (.76, -.20, .63), (-.05, -.98, -.18))
    SHAKEN = key(hips=(V((0, .015, -.045)), -.10, .14, 0), chest=(-.05, .10, 0), head=(-.05, .05, 0),
                 feet={'Left': (V((.100, -.030, .069)), .20, 0), 'Right': (V((-.085, .045, .069)), -.30, 0)},
                 gun=port_gun, shrug=.25,
                 hands={'Right': ('gun', 'TriggerGrip', (1, 0, 0), (-.30, .08, .50), 'chest'),
                        'Left': ('gun', PORT_LEFT, PORT_PALM, (.28, -.05, .55), 'chest')})
    waver_grab = alter(CARRY, hands={'Right': ('gun', BARREL(.36), (1, 0, -.4), (-.25, -.05, .62), 'world')})
    waver = clip('Waver', [
        (1, CARRY, {}),
        (7, waver_grab, {'hand_arc': {'Right': (.02, -.04, .03)}}),
        (18, SHAKEN, {'pivot': 'TriggerGrip', 'arc': (0, -.05, .02), 'hand_arc': {'Left': (-.02, -.06, .04), 'Right': (-.06, -.04, -.03)},
                      'feet': {'Left': (.2, .7), 'Right': (.5, 1)}}),
    ])
    shaken = clip('Shaken', [(1, SHAKEN, {}), (49, SHAKEN, {'ease': 'linear'})],
                  extra=loop_extra(48, hips_x=.010, hips_yaw=.05, chest=.012, head_yaw=.60, head_pitch=.03))

    # ------------------------------------------------------------------ rout
    run = T.run_extra()
    trail_gun = ('chest', BARREL(.36), (-.125, -.040, .510), (-.08, -1, -.30), (-1, 0, 0))   # drooping: a flight, not a levelled charge
    def rout_key(f):
        """Running away: the musket trailed in the right hand, the left arm pumping against the left
        leg, a look back over the left shoulder in the second stride cycle."""
        arm = math.cos(2 * math.pi * (f - 1) / 16)       # +1: left arm back (left foot forward at frame 1)
        look = smooth(min(1, max(0, (f - 17) / 5))) * smooth(min(1, max(0, (31 - f) / 5)))
        left = V((.130, -.010, .520)) + V((.020, .110, -.020)) * arm - V((0, .060, -.050)) * (1 - arm) * .5
        return key(hips=(V((0, 0, 0)), 0, 0, 0), chest=(.30 * look, 0, 0), head=(1.25 * look, -.05 + .10 * look, 0),
                   gun=trail_gun, curl=1,
                   feet={'Left': (V((.075, 0, .069)), 0, 0), 'Right': (V((-.055, 0, .069)), 0, 0)},
                   hands={'Right': ('gun', BARREL(.36), (.8, -.2, .5), (-.22, .20, .55), 'chest'),
                          'Left': ('free', left, (-1, 0, 0), (.26, .16, .58), 'chest')})
    rout_run = clip('RoutRun', [(f, rout_key(f), {'ease': 'linear'}) for f in range(1, 34, 2)], extra=run)

    RR1 = bake(rout_key(1), run, 1)
    T1 = alter(CARRY, root=.45, hands={'Right': ('gun', BARREL(.40), (1, 0, -.4), (-.25, -.05, .60), 'world')},
               hips=(V((0, .005, -.020)), .10, .04, 0), head=(.35, .02, 0))
    T2 = alter(rout_key(1), root=1.9, hips=(V((0, -.005, -.030)), -.05, .10, 0), chest=(.05, .04, 0), head=(.10, 0, 0),
               hands={'Left': ('free', V((.150, -.020, .480)), (-1, 0, 0), (.26, .16, .58), 'chest')})
    END = T.rotate_key(RR1, math.pi)
    runR, runL = k.RUN_FOOT[8], k.RUN_FOOT[0]
    turn_feet = feet_schedule({
        'Left': [(1, (.085, k.WALK_HALF, .069), 0, 0), (7, (.105, .010, .069), 1.5, 0), (13, (.105, .010, .069), 1.5, 0),
                 (20, (-.075, -runL[0], runL[1]), math.pi, k.RUN_PITCH[0])],
        'Right': [(1, (-.065, -k.WALK_HALF, .069), 0, 0), (7, (-.065, -k.WALK_HALF, .069), 0, 0), (13, (-.010, .090, .069), 2.4, 0),
                  (16, (-.010, .090, .069), 2.4, 0), (20, (.055, -runR[0], runR[1]), math.pi, k.RUN_PITCH[8])],
    })
    rout_turn = clip('RoutTurn', [
        (1, CARRY, {}),
        (6, T1, {'hand_arc': {'Right': (.02, -.04, .03)}}),
        (9, off_shoulder(alter(T1, root=1.0), (-.030, -.110, .020)), {}),
        (13, T2, {'pivot': BARREL(.40), 'hand_arc': {'Left': (.03, -.05, .03)}}),
        (20, END, {'ease': 'linear'}),
    ], extra=turn_feet)

    table = {
        'Waver': dict(frames=18, loop=False, starts='Walking@1', ends='Shaken@1', reverse_to='Walking@1'),
        'Shaken': dict(frames=49, loop=True, starts='Waver@end', ends='Shaken@1'),
        'RoutTurn': dict(frames=20, loop=False, starts='Walking@1', ends='RoutRun@1', root_turn=180),
        'RoutRun': dict(frames=33, loop=True, starts='RoutTurn@end', ends='RoutRun@1', root_speed=round(k.RUN_SPEED, 4)),
        'Cheer': dict(frames=51, loop=False, starts='Walking@1', ends='Walking@1'),
        'Surrender': dict(frames=30, loop=False, starts='Walking@1', ends='SurrenderIdle@1'),
        'SurrenderIdle': dict(frames=41, loop=True, starts='Surrender@end', ends='SurrenderIdle@1'),
        'OrderArms': dict(frames=30, loop=False, starts='Walking@1', ends='OrderArmsIdle@1', reverse_to='Walking@1'),
        'OrderArmsIdle': dict(frames=49, loop=True, starts='OrderArms@end', ends='OrderArmsIdle@1'),
    }
    return [waver, shaken, rout_turn, rout_run, cheer, surrender, surrender_idle, order_arms, order_idle], table
