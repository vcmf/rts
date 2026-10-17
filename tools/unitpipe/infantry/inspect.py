import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy, json
from pathlib import Path
ROOT = paths.work('infantry')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(next(paths.source('french-army', 'line-infantry-trial').glob('*.fbx'))))
report = []
for o in bpy.context.scene.objects:
    d = dict(name=o.name, type=o.type, location=list(o.location), rotation=list(o.rotation_euler), scale=list(o.scale), dimensions=list(o.dimensions))
    if o.type == 'ARMATURE':
        d['bones'] = [dict(name=b.name, parent=b.parent.name if b.parent else None, head=list(b.head_local), tail=list(b.tail_local), matrix=[list(r) for r in b.matrix_local]) for b in o.data.bones]
    if o.type == 'MESH':
        d['vertices']=len(o.data.vertices)
        d['groups']=[g.name for g in o.vertex_groups]
        d['modifiers']=[dict(type=m.type, object=m.object.name if m.type=='ARMATURE' and m.object else None) for m in o.modifiers]
    report.append(d)
(ROOT/'inspection.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source-inspected.blend'))
