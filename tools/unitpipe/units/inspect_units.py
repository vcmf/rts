"""Import each Tripo FBX in assets/tripo/<army>/<name>/ and print its objects, bones and sizes."""
import bpy, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unitkit
ROOT = unitkit.ROOT
out = {}
for d in sorted(unitkit.src('').iterdir()):
    if not d.is_dir(): continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(next(d.glob('*.fbx'))))
    rep = []
    for o in bpy.context.scene.objects:
        r = dict(name=o.name, type=o.type, parent=o.parent.name if o.parent else None, loc=[round(v,4) for v in o.location], rot=[round(v,4) for v in o.rotation_euler], scale=[round(v,4) for v in o.scale], dims=[round(v,4) for v in o.dimensions])
        if o.type=='ARMATURE':
            r['bones']=[(b.name, b.parent.name if b.parent else None, [round(v,3) for v in b.head_local], [round(v,3) for v in b.tail_local]) for b in o.data.bones]
        if o.type=='MESH':
            r['verts']=len(o.data.vertices); r['tris']=sum(len(p.vertices)-2 for p in o.data.polygons)
            r['groups']=len(o.vertex_groups); r['mods']=[m.type for m in o.modifiers]
            import mathutils
            ws=[o.matrix_world@v.co for v in o.data.vertices]
            r['world_min']=[round(min(w[i] for w in ws),3) for i in range(3)]
            r['world_max']=[round(max(w[i] for w in ws),3) for i in range(3)]
        rep.append(r)
    out[d.name]=rep
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'{d.name}-inspected.blend'))
(ROOT/'inspection.json').write_text(json.dumps(out, indent=1))
