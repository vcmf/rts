"""Render the preview sequences at 12 fps, each from a three-quarter close-up and the RTS pitch:
  walk:  Walking x3              run: Running x4
  kneel, square: the kneeling fire and the kneeling square guard; drill, turns, steps, side, trail,
  trailrun, charge, chargerun (moves.py); falls ... crawl (falls.py); waver ... order (morale.py)
  fire:  MakeReady -> Present -> Aim x2 -> Fire -> Reload -> Present -> Aim -> Fire   (muzzle flash and smoke are preview-only)
  melee: GuardReady -> BayonetGuard -> BayonetThrust -> BayonetGuard -> ButtStroke -> BayonetGuard
Usage: blender -b -P pipeline/preview.py [-- walk run kneel fire melee]"""
import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy, json, sys, math
from pathlib import Path
from mathutils import Vector
ROOT = paths.work('infantry')
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'soldier-animated.blend'))
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'; scene.eevee.taa_render_samples = 16   # previews only; Cycles is ~8 s a frame
scene.render.resolution_x = scene.render.resolution_y = 480
clips = json.loads((ROOT / 'clips.json').read_text())['clips']
frames_of = lambda name: int(bpy.data.actions[name].frame_range[1])
SHOTS = {n: c['events']['fire'] for n, c in clips.items() if 'fire' in c.get('events', {})}   # frame of the shot
SEQ = {'walk': ['Walking'] * 3, 'run': ['Running'] * 4,
       'kneel': ['Kneel', 'KneelPresent', 'KneelAim', 'KneelAim', 'KneelFire', 'KneelReload', 'KneelPresent', 'KneelAim', 'KneelFire'],
       'square': ['Kneel', 'KneelGuardReady', 'KneelGuard', 'KneelGuard', 'KneelFall'],
       'drill': ['Halt', 'Stand', 'Stand'],
       'turns': ['TurnLeft', 'TurnLeft', 'TurnRight', 'AboutFace'],
       'steps': ['WalkBackward', 'WalkBackward', 'WalkBackward'],
       'side': ['Halt', 'SideStepLeft', 'SideStepLeft', 'SideStepRight', 'SideStepRight'],
       'trail': ['TrailArms', 'TrailWalk', 'TrailWalk', 'TrailWalk'],
       'trailrun': ['TrailRun'] * 4,
       'charge': ['LevelBayonets', 'ChargeWalk', 'ChargeWalk', 'ChargeWalk'],
       'chargerun': ['ChargeRun'] * 4,
       'falls': ['FallForward'], 'fallback': ['FallBackward'], 'crumple': ['FallCrumple'],
       'fallaim': ['Present', 'Aim', 'FallFromAim'],
       'flinch': ['Flinch', 'Flinch'], 'limp': ['LimpWalk'] * 2, 'crawl': ['Crawl'] * 3,
       'sit': ['SitWounded', 'WoundedSitting', 'WoundedSitting'],
       'waver': ['Waver', 'Shaken', 'Shaken'], 'rout': ['RoutTurn', 'RoutRun', 'RoutRun'],
       'cheer': ['Cheer'], 'surrender': ['Surrender', 'SurrenderIdle', 'SurrenderIdle'],
       'order': ['OrderArms', 'OrderArmsIdle', 'OrderArmsIdle'],
       'fire': ['MakeReady', 'Present', 'Aim', 'Aim', 'Fire', 'Reload', 'Present', 'Aim', 'Fire'],
       'melee': ['GuardReady', 'BayonetGuard', 'BayonetThrust', 'BayonetGuard', 'ButtStroke', 'BayonetGuard']}
which = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(SEQ)
for w in list(which):   # ad hoc sequence: name=ClipA,ClipB*3
    if '=' in w:
        n, spec = w.split('=', 1); SEQ[n] = [c for part in spec.split(',') for c in [part.split('*')[0]] * int(part.split('*')[1] if '*' in part else 1)]
        which[which.index(w)] = n

def material(name, color, emission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = color; p.inputs['Roughness'].default_value = 1
    if emission: p.inputs['Emission Color'].default_value = color; p.inputs['Emission Strength'].default_value = emission
    return m
smoke_mat = material('PreviewSmoke', (.72, .74, .78, 1)); flash_mat = material('PreviewFlash', (1, .55, .12, 1), 4)
puffs = []
for i in range(5):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1); o = bpy.context.object
    o.data.materials.append(smoke_mat); puffs.append(o)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1); flash = bpy.context.object; flash.data.materials.append(flash_mat)

# every sequence frame: (action, frame); clip joins share a pose, so the first frame of each later clip is skipped
for seq in which:
    timeline = []; turn = 0.   # clips with root_turn leave the root turned for the clips after them
    for i, name in enumerate(SEQ[seq]):
        timeline += [(name, f, turn) for f in range(1 if i == 0 else 2, frames_of(name) + 1)]
        turn += clips.get(name, {}).get('root_turn', 0)
    shots = {}   # sequence index of each shot -> muzzle position and direction
    for view, loc, scale in [('closeup', (1.9, -2.3, 1.5), 1.45), ('rts', (1.2, -2.0, 3.2), 1.5)]:
        scene.camera.location = loc; scene.camera.data.ortho_scale = scale
        scene.camera.rotation_euler = (Vector((0, -.12, .5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        out = ROOT / f'{seq}-{view}-frames'; out.mkdir(exist_ok=True)
        for old in out.glob('*.png'): old.unlink()
        last_shot = None
        for j, (name, f, turn) in enumerate(timeline):
            rig.rotation_euler.z = math.radians(turn)
            rig.animation_data.action = bpy.data.actions[name]; scene.frame_set(f)
            if SHOTS.get(name) == f:
                m = rig.matrix_world @ rig.pose.bones['BarrelMuzzle'].head
                d = (m - rig.matrix_world @ rig.pose.bones['ForeGrip'].head).normalized(); last_shot = (j, m, d)
            age = (j - last_shot[0]) / 24 if last_shot else 99
            flash.hide_render = not (0 <= age < 2 / 24)
            for i, o in enumerate(puffs):   # smoke drifts forward and up, grows and lingers about 1.5 s
                o.hide_render = not (0 <= age < 1.5)
                if not o.hide_render:
                    _, m, d = last_shot
                    o.location = m + d * (.05 * i + .35 * age ** .6) + Vector((.02 * i, .01 * i, .08 * age))
                    s = .03 + .015 * i + .09 * age ** .5; o.scale = (s, s * .85, s)
            if last_shot: flash.location = last_shot[1]; flash.scale = (.03, .03, .03)
            if j % 2: continue   # 24 fps animation, 12 fps preview
            scene.render.filepath = str(out / f'{j // 2:04}.png'); bpy.ops.render.render(write_still=True)
    print('PREVIEW', seq, len(timeline), 'frames')
