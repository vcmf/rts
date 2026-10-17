import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy,json
from pathlib import Path
root=paths.work('infantry')
bpy.ops.wm.open_mainfile(filepath=str(root/'source-inspected.blend'))
m=next(o for o in bpy.context.scene.objects if o.type=='MESH')
adj=[[] for v in m.data.vertices]
for e in m.data.edges:
    a,b=e.vertices;adj[a].append(b);adj[b].append(a)
seen=set(); comps=[]
for i in range(len(adj)):
    if i in seen:continue
    todo=[i];seen.add(i); ids=[]
    while todo:
        j=todo.pop(); ids.append(j)
        for k in adj[j]:
            if k not in seen:seen.add(k);todo.append(k)
    coords=[m.data.vertices[j].co for j in ids]
    comps.append(dict(count=len(ids),ids=ids,min=[min(c[k] for c in coords) for k in range(3)],max=[max(c[k] for c in coords) for k in range(3)]))
comps.sort(key=lambda x:-x['count'])
(root/'components.json').write_text(json.dumps(comps))
print(json.dumps([{k:v for k,v in c.items() if k!='ids'} for c in comps],indent=2))
