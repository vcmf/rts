"""Preview renders of a clip.

blender -b <unit>-animated.blend -P preview.py -- clip=Load out=<prefix> [frames=1,20,40|all] [cam=x,y,z,size,az,el]
  [res=640x360] [step=1] [follow=speed] [fx=battery]

Writes <prefix>.<frame>.png. follow=v moves the camera and the ground grid with a unit moving at v m/s
along -Y, so a gait is seen travelling (feet should stick to the grid). fx=battery adds a muzzle
flash and smoke at the clip's 'shot' event (preview only, not in the asset).
"""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector

kw = dict(a.split('=', 1) for a in sys.argv[sys.argv.index('--') + 1:])
sc = bpy.context.scene
rig = next(o for o in sc.objects if o.type == 'ARMATURE')
act = bpy.data.actions[kw['clip']]
rig.animation_data.action = act
if hasattr(rig.animation_data, 'action_slot') and act.slots:
    rig.animation_data.action_slot = act.slots[0]
n = int(act.frame_range[1])
sc.frame_start, sc.frame_end = 1, n
sc.render.engine = 'BLENDER_EEVEE'
rx, ry = map(int, kw.get('res', '640x360').split('x'))
sc.render.resolution_x, sc.render.resolution_y = rx, ry
sc.render.film_transparent = False
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .58, .62, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = .8
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.object
sun.rotation_euler = (math.radians(50), 0, math.radians(35)); sun.data.energy = 3.2; sun.data.angle = math.radians(3)
# ground with a 1 m grid
bpy.ops.mesh.primitive_plane_add(size=400); g = bpy.context.object
gm = bpy.data.materials.new('Ground'); gm.use_nodes = True
nt = gm.node_tree; bsdf = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexCoord'); ck = nt.nodes.new('ShaderNodeTexChecker')
ck.inputs['Scale'].default_value = 400
ck.inputs['Color1'].default_value = (.36, .40, .30, 1); ck.inputs['Color2'].default_value = (.32, .36, .27, 1)
nt.links.new(tc.outputs['UV'], ck.inputs['Vector']); nt.links.new(ck.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 1
g.data.materials.append(gm)
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam; cam.data.type = 'ORTHO'
x, y, z, size, az, el = map(float, kw.get('cam', '0,-0.5,0.8,7,35,30').split(','))
c0 = Vector((x, y, z)); A = math.radians(az); E = math.radians(el)
d = Vector((math.sin(A) * math.cos(E), -math.cos(A) * math.cos(E), math.sin(E)))
cam.data.ortho_scale = size
speed = float(kw.get('follow', 0))
mp = Path(bpy.data.filepath).parent
unit = Path(bpy.data.filepath).stem.split('-')[0]          # battery-animated.blend -> battery
table = mp / f'{unit}-clips.json'
meta = json.loads(table.read_text()) if table.exists() else {}
events = meta.get(kw['clip'], {}).get('events', {})


def place(frame):
    off = Vector((0, -speed * (frame - 1) / 24, 0))
    c = c0 + off
    cam.location = c + d * 20
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    rig.location = off


if kw.get('fx') == 'battery' and 'shot' in events:
    shot = events['shot'] + 1
    mz = Vector(json.loads((mp / 'battery-combined.json').read_text())['gun']['muzzle'])
    fl = bpy.data.materials.new('Flash'); fl.use_nodes = True
    b = fl.node_tree.nodes['Principled BSDF']; b.inputs['Emission Color'].default_value = (1, .7, .3, 1); b.inputs['Emission Strength'].default_value = 30
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=mz + Vector((0, -.5, 0))); flash = bpy.context.object; flash.data.materials.append(fl)
    sm = bpy.data.materials.new('Smoke'); sm.use_nodes = True
    b = sm.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (.82, .82, .8, 1); b.inputs['Roughness'].default_value = 1
    puffs = []
    import random
    random.seed(3)
    for i in range(14):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1); s = bpy.context.object; s.data.materials.append(sm)
        puffs.append((s, Vector((random.uniform(-.6, .6), -random.uniform(.5, 4.0), random.uniform(-.1, .7))), random.uniform(.25, .5)))
    def fx(frame):
        t = frame - shot
        flash.scale = (.25, .55, .25) if 0 <= t < 2 else (.0001,) * 3
        for s, o, r in puffs:
            if t < 0:
                s.scale = (.0001,) * 3; continue
            k = 1 - math.exp(-t / 6)
            s.location = mz + o * k + Vector((0, 0, t * .01))
            s.scale = (r * (.3 + 1.0 * k) * (1 if t < 60 else max(.0001, 1 - (t - 60) / 40)),) * 3
else:
    def fx(frame):
        pass

cycles = int(kw.get('cycles', 1))
loop_len = n - 1 if cycles > 1 else n          # loops: the last frame repeats the first
frames = range(1, loop_len * cycles + 1, int(kw.get('step', 1))) if kw.get('frames', 'all') == 'all' else [int(v) for v in kw['frames'].split(',')]
for f in frames:
    sc.frame_set((f - 1) % loop_len + 1); place(f); fx(f)
    sc.render.filepath = f"{kw['out']}.{f:04d}.png"
    bpy.ops.render.render(write_still=True)
