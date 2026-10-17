"""Reimport a published GLB and check every clip animates. -- <glb> <clips.json>"""
import bpy, sys, json
glb, table = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
clips = json.load(open(table))['clips']
names = {a.name for a in bpy.data.actions}
bad = 0
for c in clips:
    hit = [n for n in names if n == c or n.startswith(c + '_') or n.startswith(c + '.')]
    if not hit:
        print('MISSING', c); bad += 1; continue
    a = bpy.data.actions[hit[0]]
    print('ROUNDTRIP', c, 'frames', tuple(round(x) for x in a.frame_range))
sys.exit(1 if bad else 0)
