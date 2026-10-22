"""Hits, falls and the wounded, authored as key poses with the drill toolkit (see AUTHORING.md).

Falls start from the carry (Walking@1) or the aim (Aim@1): a jolt where the ball hits, the knees
give, the body falls with gravity (ease in), lands, bounces a little and settles. The last frame is
the lying-dead pose. The musket leaves the hands and lands on the ground beside the body.
"""
import bpy, math
from mathutils import Matrix

FLOOR = -.003   # lowest mesh point allowed; the source boot soles already sit about 2 mm below 0


def author(k, T):
    V, Q, key, alter = T.V, T.Q, T.key, T.alter

    def ground():
        """Lift the whole solved pose so no vertex is below FLOOR (never lowers it). Falls and lying
        poses are authored close to the ground; this removes what is left of a knee or a pack dipping
        into it, so the body rests on its lowest point."""
        bpy.context.view_layer.update()
        ev = k.mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        dz = FLOOR - min(v.co.z for v in ev.data.vertices)
        if dz <= 0: return 0.
        M = {p.name: p.matrix.copy() for p in k.rig.pose.bones}; L = Matrix.Translation((0, 0, dz)); depth = None
        for p in T.DEPTH:
            d = len(p.parent_recursive)
            if d != depth: bpy.context.view_layer.update(); depth = d
            p.matrix = L @ M[p.name]
        bpy.context.view_layer.update()
        return dz

    def head_q(*rots):
        """A head key from a rotation built as a product of (axis, angle) turns, applied right to left in
        the rest frame (face -Y, head up +Z). The key stores (yaw, pitch, roll) for Rz @ Rx @ Ry, which
        can express any rotation; this converts."""
        q = Q((0, 0, 1), 0)
        for axis, angle in rots: q = q @ Q(axis, angle)
        e = q.to_euler('YXZ'); return (e.z, e.x, e.y)
    X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)

    lifts = {}
    def clip(name, keys, extra=None):
        """T.clip, plus ground() on every frame."""
        T.contacts[name] = {}; T.name_now[0] = name; lifts[name] = {}

        def fn(f):
            for (f0, a, _), (f1, b, opts) in zip(keys, keys[1:]):
                if f0 <= f <= f1: break
            if f == f0 or f0 == f1: rec = T.solve(a, extra=extra, f=f)
            elif f == f1: rec = T.solve(b, extra=extra, f=f)
            else:
                traw = (f - f0) / (f1 - f0); t = T.EASE[opts.get('ease', 'smooth')](traw)
                rec = T.solve(a, b, t, traw, opts, extra, f)
            T.contacts[name][f] = rec
            lifts[name][f] = ground()
        return k.action(name, keys[-1][0], fn)
    CARRY, PRESENT = T.CARRY, T.PRESENT
    up = (0, 0, 1)

    def gun_on_ground(at, heading, flip=1):
        """Musket lying on its side on the ground: barrel along heading (world), lock side up or down."""
        return ('world', 'TriggerGrip', at, V(heading).normalized(), (0, 0, flip))

    def free(at, palm=up, pole=(0, 0, 0)):
        return ('free', at, palm, pole, 'world')

    # ================================================================ fall backward (hit in the chest)
    B_JOLT = alter(CARRY, hips=(V((0, .030, -.020)), .03, -.10, 0), chest=(-.03, -.20, 0), head=(.05, -.32, 0),
                   hands={'Right': ('relaxed', (-.23, .02, .60), (1, 0, 0), (-.25, .15, .70), 'world')})
    B_SIT = key(hips=(V((0, .150, -.250)), .10, -.45, 0), chest=(0, -.15, 0), head=(.10, -.25, .10),
                feet={'Left': (V((.090, .040, .069)), 0, 0), 'Right': (V((-.070, -.110, .069)), -.10, 0)},
                gun=('world', 'TriggerGrip', (-.22, -.12, .32), (-.4, -.5, .75), (0, .8, .5)),
                hands={'Left': free((.22, .02, .38), (0, -1, 0), (.35, .2, .5)),
                       'Right': free((-.24, .05, .42), (0, -1, 0), (-.35, .25, .5))})
    B_LIE = key(hips=(V((0, .300, -.375)), .30, -1.45, .05), chest=(.10, .35, 0), head=head_q((Z, .30), (X, -1.80), (Z, .90)),
                feet={'Left': (V((.140, -.120, .050)), .30, -1.0, (.14, -.02, .6)),
                      'Right': (V((-.120, -.050, .050)), -.40, -1.0, (-.12, .05, .6))},
                gun=gun_on_ground((-.32, -.05, .024), (-.35, -1, 0)),
                hands={'Left': free((.25, .45, .03), up, (.35, .45, .2)),
                       'Right': free((-.27, .40, .03), up, (-.35, .40, .2))})
    B_BOUNCE = alter(B_LIE, hips=(V((0, .300, -.363)), .30, -1.40, .05), chest=(.10, .25, 0), head=head_q((Z, .30), (X, -1.55), (Z, .90)))
    fall_back = clip('FallBackward', [
        (1, CARRY, {}),
        (4, B_JOLT, {'ease': 'out'}),
        (12, B_SIT, {'ease': 'in', 'lift': 0, 'feet': {'Right': (.2, .8)}}),
        (19, B_LIE, {'ease': 'in', 'lift': 0}),
        (22, B_BOUNCE, {'ease': 'out'}),
        (30, B_LIE, {}),
    ])

    # ================================================================ fall forward (onto the face)
    F_JOLT = alter(CARRY, hips=(V((0, .020, -.025)), .06, .15, 0), chest=(0, .20, 0), head=(.05, .35, 0),
                   hands={'Right': ('relaxed', (-.20, -.05, .52), (1, 0, 0), (-.22, .10, .62), 'world')})
    F_KNEES = key(hips=(V((0, -.020, -.200)), .10, .35, 0), chest=(0, .20, 0), head=(.10, .40, 0),
                  feet={'Left': (V((.090, .200, .060)), 0, 1.3, (.09, -1, .0)), 'Right': (V((-.070, .180, .060)), 0, 1.3, (-.07, -1, .0))},
                  gun=('world', 'TriggerGrip', (-.25, -.25, .25), (-.3, -.8, .5), (0, 0, 1)),
                  hands={'Left': free((.20, -.20, .25), (0, 1, 0), (.30, -.1, .4)),
                         'Right': free((-.22, -.20, .25), (0, 1, 0), (-.30, -.1, .4))})
    F_LIE = key(hips=(V((0, -.300, -.430)), .15, 1.45, 0), chest=(.10, .05, 0), head=head_q((Z, .15), (X, 1.50), (Z, 1.30)),
                feet={'Left': (V((.150, .120, .060)), .70, 1.2, (.15, .1, -.5)),
                      'Right': (V((-.100, .140, .060)), -.60, 1.2, (-.10, .1, -.5))},
                gun=gun_on_ground((-.33, -.55, .036), (-.2, -1, 0)),
                hands={'Left': free((.20, -.70, .03), (0, 0, -1), (.35, -.55, .3)),
                       'Right': free((-.20, -.25, .03), (0, 0, -1), (-.35, -.35, .3))})
    F_BOUNCE = alter(F_LIE, hips=(V((0, -.300, -.415)), .15, 1.40, 0), head=head_q((Z, .15), (X, 1.35), (Z, 1.30)))
    fall_fwd = clip('FallForward', [
        (1, CARRY, {}),
        (4, F_JOLT, {'ease': 'out'}),
        (12, F_KNEES, {'ease': 'in', 'lift': 0}),
        (19, F_LIE, {'ease': 'in', 'lift': 0}),
        (22, F_BOUNCE, {'ease': 'out'}),
        (30, F_LIE, {}),
    ])

    # ================================================================ crumple (knees give, falls on the right side)
    C_JOLT = alter(CARRY, hips=(V((0, .010, -.040)), .08, .12, 0), chest=(0, .15, -.05), head=(.08, .40, 0),
                   hands={'Right': ('relaxed', (-.17, -.08, .46), (1, 0, 0), (-.22, .05, .60), 'world')})
    C_SAG = key(hips=(V((0, .040, -.230)), .10, .20, -.10), chest=(0, .25, -.10), head=(.05, .45, -.10),
                feet={'Left': (V((.085, k.WALK_HALF, .069)), 0, 0), 'Right': (V((-.065, -.040, .069)), 0, 0)},
                gun=('world', 'TriggerGrip', (-.18, -.15, .28), (-.3, -.3, .9), (0, -1, 0)),
                hands={'Left': free((.15, -.12, .30), (-1, 0, 0), (.3, .1, .45)),
                       'Right': free((-.18, -.08, .32), (1, 0, 0), (-.3, .1, .45))})
    C_KNEEL = key(hips=(V((0, .040, -.200)), .10, .20, -.12), chest=(0, .30, -.10), head=(.05, .50, -.15),
                  feet={'Left': (V((.090, .210, .060)), 0, 1.3, (.09, -1, 0)), 'Right': (V((-.070, .190, .060)), 0, 1.3, (-.07, -1, 0))},
                  gun=('world', 'TriggerGrip', (-.25, -.30, .10), (-.6, -.8, .2), (0, 0, 1)),
                  hands={'Left': free((.10, -.15, .22), (-1, 0, 0), (.3, .0, .4)),
                         'Right': free((-.20, -.15, .20), (1, 0, 0), (-.3, .0, .4))})
    C_LIE = key(hips=(V((-.180, .050, -.400)), .30, .25, -1.40), chest=(.10, .35, 0), head=head_q((Z, .30), (Y, -1.45), (X, .50)),
                feet={'Left': (V((.040, -.200, .130)), 0, -.56, (-.12, -.7, .14)),
                      'Right': (V((.030, -.120, .140)), 0, -.56, (-.15, -.6, .140)) },
                gun=gun_on_ground((-.22, -.38, .015), (-1, -.4, 0), -1),
                hands={'Left': free((-.05, -.25, .10), (0, 0, -1), (.1, -.1, .4)),
                       'Right': free((-.35, -.15, .03), (0, 0, 1), (-.4, .1, .2))})
    C_BOUNCE = alter(C_LIE, hips=(V((-.180, .050, -.385)), .30, .25, -1.35))
    crumple = clip('FallCrumple', [
        (1, CARRY, {}),
        (5, C_JOLT, {'ease': 'out'}),
        (12, C_SAG, {'ease': 'in', 'lift': 0, 'feet': {'Right': (.3, .9)}}),
        (17, C_KNEEL, {'ease': 'in', 'lift': 0}),
        (24, C_LIE, {'ease': 'in', 'lift': 0}),
        (27, C_BOUNCE, {'ease': 'out'}),
        (34, C_LIE, {}),
    ])

    # ================================================================ fall from the aim (backward, twisting)
    A_JOLT = alter(PRESENT, hips=(V((0, .030, -.030)), -.45, -.05, 0), chest=(-.15, -.15, -.04), head=(.10, .05, -.20),
                   gun=('world', 'StockContact', (-.08, .02, .72), (.1, -1, .45), (-1, 0, .3)),
                   hands={'Right': free((-.16, -.02, .66), (1, 0, 0), (-.34, .10, .70)),
                          'Left': free((.05, -.15, .55), (0, 0, 1), (.25, -.05, .45))})
    A_SIT = key(hips=(V((0, .150, -.250)), -.20, -.50, 0), chest=(-.05, -.15, 0), head=(-.10, -.25, .10),
                feet={'Left': (V((.060, -.120, .069)), -.20, 0), 'Right': (V((-.090, .060, .069)), -1.0, 0)},
                gun=('world', 'TriggerGrip', (-.25, -.05, .35), (-.2, -.4, .9), (-1, 0, 0)),
                hands={'Left': free((.22, .00, .40), (0, -1, 0), (.35, .2, .5)),
                       'Right': free((-.24, .08, .45), (0, -1, 0), (-.35, .25, .5))})
    A_LIE = key(hips=(V((.020, .320, -.375)), -.25, -1.45, -.10), chest=(-.20, .50, 0), head=head_q((Z, -.25), (X, -1.85), (Z, -.90)),
                feet={'Left': (V((.080, -.100, .050)), -.10, -1.0, (.10, -.02, .6)),
                      'Right': (V((-.170, -.020, .050)), -.70, -1.0, (-.20, .05, .6))},
                gun=gun_on_ground((-.35, .20, .024), (-.6, -1, 0)),
                hands={'Left': free((.28, .38, .03), up, (.35, .45, .2)),
                       'Right': free((-.26, .52, .03), up, (-.35, .40, .2))})
    A_BOUNCE = alter(A_LIE, hips=(V((.020, .320, -.363)), -.25, -1.40, -.10), head=head_q((Z, -.25), (X, -1.60), (Z, -.90)))
    fall_aim = clip('FallFromAim', [
        (1, PRESENT, {}),
        (4, A_JOLT, {'ease': 'out'}),
        (12, A_SIT, {'ease': 'in', 'lift': 0, 'feet': {'Right': (.1, .7)}}),
        (19, A_LIE, {'ease': 'in', 'lift': 0}),
        (22, A_BOUNCE, {'ease': 'out'}),
        (30, A_LIE, {}),
    ])

    # ================================================================ flinch (a ball or shell lands close)
    DUCK = alter(CARRY, hips=(V((0, .020, -.045)), .02, .15, .06), chest=(.10, .16, 0), head=(-.30, .38, .15), shrug=.35,
                 feet={'Right': (V((-.080, -.040, .069)), -.25, 0)},
                 gun=('q', 'CarryGrip', V(CARRY['gun'][2]) + V((0, .015, -.040)), CARRY['gun'][3]),
                 hands={'Right': ('relaxed', (-.13, -.13, .62), (1, 0, 0), (-.26, .00, .55), 'world')})
    flinch = clip('Flinch', [
        (1, CARRY, {}),
        (4, DUCK, {'ease': 'snap', 'feet': {'Right': (0, .9)}, 'lift': .02}),
        (9, alter(DUCK, head=(-.25, .32, .12), chest=(.08, .14, 0)), {'ease': 'linear'}),
        (24, CARRY, {'feet': {'Right': (.3, .9)}, 'lift': .02}),
    ])

    # ================================================================ sit down wounded, then sit rocking
    STOOP = alter(CARRY, hips=(V((0, .030, -.160)), .05, .40, 0), chest=(0, .25, 0), head=(0, .45, 0),
                  gun=('world', 'CarryGrip', (.10, -.12, .36), (-.55, -.35, .76), (.3, .9, 0)),
                  hands={'Left': ('gun', 'CarryGrip', (-1, 0, .12), (.25, .05, .40), 'world'),
                         'Right': free((-.18, -.05, .30), (0, 0, -1), (-.3, .15, .45))})
    SQUAT = key(hips=(V((0, .080, -.270)), .05, .30, 0), chest=(0, .20, 0), head=(.05, .45, 0),
                feet={'Left': (V((.085, .020, .069)), .1, 0), 'Right': (V((-.065, -.040, .069)), -.1, 0)},
                gun=gun_on_ground((-.26, -.10, .024), (-.15, -1, 0)),
                hands={'Left': free((.16, -.12, .25), (0, 0, -1), (.3, .1, .4)),
                       'Right': free((-.18, .18, .03), (0, 0, -1), (-.3, .3, .3))})
    SIT = key(hips=(V((0, .140, -.330)), .10, -.10, 0), chest=(.10, .45, 0), head=(.20, .55, 0),
              feet={'Left': (V((.110, -.270, .060)), .10, -.9, (.12, -.07, .6)),
                    'Right': (V((-.080, -.120, .069)), -.10, 0, (-.10, -.05, .7))},
              gun=gun_on_ground((-.26, .00, .024), (-.10, -1, 0)),
              hands={'Left': free((.150, -.060, .130), (-1, 0, 0), (.30, .10, .30)),
                     'Right': free((.020, -.050, .160), (1, 0, -.3), (-.15, .10, .30))})
    sit_down = clip('SitWounded', [
        (1, CARRY, {}),
        (8, STOOP, {'ease': 'smooth', 'lift': 0}),
        (15, SQUAT, {'pivot': 'TriggerGrip', 'feet': {'Left': (.2, .8), 'Right': (.4, 1)}, 'lift': .02}),
        (24, alter(SIT, hips=(V((0, .140, -.320)), .10, -.12, 0)), {'ease': 'in', 'lift': 0}),
        (30, SIT, {'ease': 'out'}),
    ])

    def rock(f, P):   # breathing and rocking over the leg; period 48 frames
        w = 2 * math.pi * (f - 1) / 48
        cy, cl, cr = P['chest']; P['chest'] = (cy + .03 * math.sin(w), cl + .07 * math.sin(w), cr)
        hy, hp, hr = P['head']; P['head'] = (hy + .05 * math.sin(2 * w), hp + .06 * math.sin(w), hr)
        return P
    sitting = clip('WoundedSitting', [(1, SIT, {}), (49, SIT, {'ease': 'linear'})], extra=rock)

    # ================================================================ limp, the musket as a crutch
    # A cycle of LIMP_N frames at LIMP_V model units/s. In the root frame a planted foot (or the planted
    # musket butt) moves back at exactly LIMP_V, so nothing slides when the game moves the root.
    LIMP_N, LIMP_V = 40, .18
    cyc = LIMP_N / 24 * LIMP_V            # distance the root travels per cycle
    # (land phase, stance length) per foot; the left (hurt) leg bears weight for less time
    LIMB = {'Right': (0.0, .65, -.065, -.105, .040), 'Left': (.55, .48, .085, -.085, .030)}   # land, stance, x, land y, lift

    def foot_at(side, u):
        land, st, x, y0, lift = LIMB[side]
        t = (u - land) % 1
        if t < st: return V((x, y0 + cyc * t, .069)), 0.
        sw = (t - st) / (1 - st); e = smooth3(sw)
        return V((x, y0 + cyc * st * (1 - e), .069 + lift * math.sin(math.pi * sw))), sw
    def smooth3(x): return x * x * (3 - 2 * x)

    LIMP = key(hips=(V((0, .010, -.030)), .05, .18, 0), chest=(-.08, .12, -.04), head=(-.05, .30, 0),
               feet={'Left': (V((.085, 0, .069)), 0, 0), 'Right': (V((-.065, 0, .069)), 0, 0)},
               gun=('world', 'StockContact', (-.21, -.10, .025), (.03, .10, 1), (-1, 0, 0)),
               hands={'Right': ('gun', (-.127, -.130, .560), (.2, -1, 0), (-.30, .15, .55), 'world'),
                      'Left': ('free', (.115, -.045, .430), (-1, 0, 0), (.25, .10, .55), 'chest')})

    def limp_key(f):
        u = ((f - 1) % LIMP_N) / LIMP_N
        feet = {}
        for side in ('Left', 'Right'):
            pos, sw = foot_at(side, u); feet[side] = (pos, 0, (.25 if side == 'Right' else .05) * math.sin(math.pi * sw) if sw else 0.)
        # weight on the hurt leg: the body sags and leans onto the crutch
        lt = (u - LIMB['Left'][0]) % 1; load = math.sin(math.pi * lt / LIMB['Left'][1]) if lt < LIMB['Left'][1] else 0
        rt = (u - LIMB['Right'][0]) % 1; good = math.sin(math.pi * rt / LIMB['Right'][1]) if rt < LIMB['Right'][1] else 0
        off, yaw, lean, roll = LIMP['hips']
        hips = (off + V((-.012 * load, 0, -.018 * load + .010 * good)), yaw + .05 * math.cos(2 * math.pi * u), lean, roll - .06 * load)
        cy, cl, cr = LIMP['chest']
        # the crutch: the butt is planted (moving back with the ground) while the hurt leg bears weight
        land, st = LIMB['Left'][0] - .04, LIMB['Left'][1] + .08
        t = (u - land) % 1
        if t < st: by, bz = -.13 + cyc * t, .025
        else:
            sw = (t - st) / (1 - st); by, bz = -.13 + cyc * st * (1 - smooth3(sw)), .025 + .035 * math.sin(math.pi * sw)
        butt = V((-.215, by, bz)); top = V((-.200, -.050, .600 - .015 * load))
        return alter(LIMP, hips=hips, chest=(cy, cl + .04 * load, cr + .10 * load), feet=feet,
                     gun=('world', 'StockContact', butt, top - butt, (-1, 0, 0)))
    limpwalk = clip('LimpWalk', [(f, limp_key(f), {}) for f in range(1, LIMP_N + 2)])

    # ================================================================ crawl on hands and knees, dragging the musket
    CRAWL_N, CRAWL_V = 32, .12
    ccyc = CRAWL_N / 24 * CRAWL_V
    # diagonal pairs: left hand with right knee, right hand with left knee; (land phase, stance, x, land y, z)
    CL = {'LHand': (0.0, .70, .120, -.280, .030), 'RKnee': (.05, .70, -.075, .060, .060),
          'RHand': (.50, .70, -.140, -.280, .040), 'LKnee': (.55, .70, .085, .060, .060)}

    def part_at(name, u, lift):
        land, st, x, y0, z = CL[name]
        t = (u - land) % 1
        if t < st: return V((x, y0 + ccyc * t, z)), 0.
        sw = (t - st) / (1 - st)
        return V((x, y0 + ccyc * st * (1 - smooth3(sw)), z + lift * math.sin(math.pi * sw))), sw

    CRAWL = key(hips=(V((0, .080, -.262)), .0, 1.60, 0), chest=(0, .18, 0), head=(0, .80, 0),
                feet={'Left': (V((.085, .060, .060)), 0, 1.3, (.085, -1, -.3)), 'Right': (V((-.075, .060, .060)), 0, 1.3, (-.075, -1, -.3))},
                gun=gun_on_ground((-.17, -.15, .030), (0, -1, 0)),
                hands={'Left': free((.120, -.400, .030), (0, 0, -1), (.30, -.20, .25)),
                       'Right': ('gun', (-.127, -.130, .600), (0, 0, -1), (-.30, -.20, .25), 'world')})

    def crawl_key(f):
        u = ((f - 1) % CRAWL_N) / CRAWL_N
        feet = {}
        for side, part, x in (('Left', 'LKnee', .085), ('Right', 'RKnee', -.075)):
            pos, sw = part_at(part, u, .030)
            feet[side] = (pos + V((0, .20, 0)), 0, 1.3, (x, pos.y - 1, -.3))   # ankle behind the knee, shin on the ground
        lh, _ = part_at('LHand', u, .045); rh, _ = part_at('RHand', u, .030)
        off, yaw, lean, roll = CRAWL['hips']
        hips = (off + V((0, 0, .008 * math.cos(4 * math.pi * u))), yaw + .06 * math.sin(2 * math.pi * u), lean, roll + .04 * math.sin(2 * math.pi * u))
        cy, cl, cr = CRAWL['chest']
        # the right fist holds the barrel on the ground near the muzzle; the butt drags behind
        return alter(CRAWL, hips=hips, chest=(cy - .08 * math.sin(2 * math.pi * u), cl, cr - .04 * math.sin(2 * math.pi * u)), feet=feet,
                     gun=('world', (-.127, -.130, .600), rh, (.25, -1, 0), (0, 0, 1)),
                     hands={'Left': free(lh, (0, 0, -1), (.30, lh.y + .2, .25))})
    crawlclip = clip('Crawl', [(f, crawl_key(f), {}) for f in range(1, CRAWL_N + 2)])


    still = dict(loop=False, ends='still', lies=True)
    table = {
        'FallBackward': dict(frames=30, starts='Walking@1', **still),
        'FallForward': dict(frames=30, starts='Walking@1', **still),
        'FallCrumple': dict(frames=34, starts='Walking@1', **still),
        'FallFromAim': dict(frames=30, starts='Aim@1', **still),
        'Flinch': dict(frames=24, loop=False, starts='Walking@1', ends='Walking@1'),
        'SitWounded': dict(frames=30, loop=False, starts='Walking@1', ends='WoundedSitting@1'),
        'WoundedSitting': dict(frames=49, loop=True, starts='SitWounded@end', ends='WoundedSitting@1'),
        'LimpWalk': dict(frames=LIMP_N + 1, loop=True, starts='LimpWalk@1', ends='LimpWalk@1', root_speed=LIMP_V),
        'Crawl': dict(frames=CRAWL_N + 1, loop=True, starts='Crawl@1', ends='Crawl@1', root_speed=CRAWL_V),
    }
    print('GROUND LIFT (mm, frames over 5)', {n: {f: round(z * 1000) for f, z in v.items() if z > .005} for n, v in lifts.items()})
    return [fall_back, fall_fwd, crumple, fall_aim, flinch, sit_down, sitting, limpwalk, crawlclip], table
