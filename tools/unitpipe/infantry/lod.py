"""Derive the game LODs from the built master and export the published clip set.

Same armature, same skin weights, same clips. The clips superseded by newer ones (SUPERSEDED) are
dropped before export; they stay in soldier-animated.blend for compare-accepted.py.

LOD0 is the v8 mesh as is (cinematic and close-up stills). LOD1 (close zoom) and LOD2 (far zoom)
are collapse-decimated copies of it, made before the armature deforms them, so the decimator
interpolates skin weights and UVs. Each LOD gets its own downsized texture and its own GLB.
Writes lods.json (triangles, vertices, texture size, GLB size) for validate-lod.py.
"""
import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy, json
from pathlib import Path
ROOT = paths.work('infantry')
SRC = ROOT / 'soldier-animated.blend'
# v6 clips replaced by Present/Aim/Fire, GuardReady/BayonetGuard/BayonetThrust and the kneel module
SUPERSEDED = ('Shooting', 'BayonetReady', 'BayonetAttack', 'KneelDown', 'KneelingShooting')
LODS = [('lod0', None, 2048), ('lod1', 1200, 512), ('lod2', 250, 128)]   # name, target triangles, texture px

bpy.ops.wm.open_mainfile(filepath=str(SRC))
for n in SUPERSEDED:   # no longer built since v12; still dropped if a build has them
    if n in bpy.data.actions: bpy.data.actions.remove(bpy.data.actions[n])
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
master = next(o for o in scene.objects if o.type == 'MESH' and o.name != 'PreviewGround')
tris = lambda me: sum(len(p.vertices) - 2 for p in me.polygons)
base_tris = tris(master.data)
material = master.data.materials[0]
image = next(n.image for n in material.node_tree.nodes if n.type == 'TEX_IMAGE')
report = {}

def triangulated_copy(name):
    o = master.copy(); o.data = master.data.copy(); o.name = o.data.name = 'soldier_' + name
    scene.collection.objects.link(o)
    return o

for name, target, px in LODS:
    o = master if target is None else triangulated_copy(name)
    if target is not None:
        dec = o.modifiers.new('Decimate', 'DECIMATE'); dec.decimate_type = 'COLLAPSE'
        dec.ratio = target / base_tris; dec.use_collapse_triangulate = True
        # The decimator must run on the rest mesh, before the armature deforms it.
        bpy.context.view_layer.objects.active = o
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_move_to_index(modifier='Decimate', index=0)
            bpy.ops.object.modifier_apply(modifier='Decimate')
        # Own material with a downsized copy of the painted texture.
        img = image.copy(); img.name = f'{image.name}_{px}'; img.scale(px, px); img.pack()
        mat = material.copy(); mat.name = f'{material.name}_{name}'
        next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE').image = img
        o.data.materials.clear(); o.data.materials.append(mat)
    report[name] = dict(triangles=tris(o.data), vertices=len(o.data.vertices), texture=px, object=o.name)
    print('LOD', name, report[name])

bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'soldier-lods.blend'))
for name, _, _ in LODS:
    o = bpy.data.objects[report[name]['object']]
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    out = ROOT / f'soldier-{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_animations=True,
                              export_animation_mode='ACTIONS', export_frame_range=False, export_force_sampling=True)
    report[name]['glb_bytes'] = out.stat().st_size
(ROOT / 'lods.json').write_text(json.dumps(report, indent=1))
print('LODS', json.dumps(report))
