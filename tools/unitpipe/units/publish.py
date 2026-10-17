"""Step 5: export the animated unit and its clip table to the published folder.

blender -b <unit>-animated.blend -P publish.py -- <battery|cavalry> <figure>
  -> output/figures/<figure>/<unit>.glb (one skin, every clip as a glTF animation at 24 fps), <folder>/clips.json
"""
import bpy, json, sys, shutil
from pathlib import Path
ROOT = Path(bpy.data.filepath).parent
unit, figure = sys.argv[sys.argv.index('--') + 1:][:2]
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import paths
out = paths.published(figure)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig)
clips = json.loads((ROOT / f'{unit}-clips.json').read_text())
for o in bpy.data.objects:
    o.select_set(o in (rig, mesh))
bpy.context.view_layer.objects.active = rig
for a in bpy.data.actions:          # only this unit's clips go out
    a.use_fake_user = a.name in clips
rig.animation_data.action = bpy.data.actions[next(iter(clips))]
for old in out.glob('*.glb'):     # nothing stale stays (videos are published by videos.sh)
    old.unlink()
glb = out / f'{unit}.glb'
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_frame_range=False, export_force_sampling=True)
tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
table = dict(figure=figure, unit=unit, m_per_unit=1.0, fps=24, facing='-Y in Blender, written as +Z in the glTF',
             triangles=tris, bones=len(rig.data.bones), clips=clips)
(out / 'clips.json').write_text(json.dumps(table, indent=1))
print('PUBLISHED', glb, glb.stat().st_size, 'bytes', tris, 'triangles', len(clips), 'clips')
