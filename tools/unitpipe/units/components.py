"""Loose parts of each inspected model -> components-<name>.json (ids, count, bounds)."""
import bpy, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unitkit
ROOT=unitkit.ROOT
name=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/f'{name}-inspected.blend'))
m=next(o for o in bpy.context.scene.objects if o.type=='MESH')
adj=[[] for v in m.data.vertices]
for e in m.data.edges:
    a,b=e.vertices; adj[a].append(b); adj[b].append(a)
seen=set(); comps=[]
for i in range(len(adj)):
    if i in seen: continue
    todo=[i]; seen.add(i); ids=[]
    while todo:
        j=todo.pop(); ids.append(j)
        for k in adj[j]:
            if k not in seen: seen.add(k); todo.append(k)
    co=[m.data.vertices[j].co for j in ids]
    comps.append(dict(count=len(ids), ids=ids, min=[round(min(c[k] for c in co),4) for k in range(3)], max=[round(max(c[k] for c in co),4) for k in range(3)]))
comps.sort(key=lambda x:-x['count'])
(ROOT/f'components-{name}.json').write_text(json.dumps(comps))
for i,c in enumerate(comps): print(i, c['count'], c['min'], c['max'])
