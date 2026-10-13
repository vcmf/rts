# Export the owner's pack grass (Grass_Large.blend, Grass_Small.blend) to data/meadow-grass.json, the meadow's
# clumps (docs/plans/active/l5c-meadow.md, src/look/meadow.ts). Run once per .blend, then merge:
#   blender -b --disable-autoexec <pack>/Blends/Grass_Large.blend --python tools/meadow-grass-export.py -- Grass_Large data/meadow-grass.json
#   blender -b --disable-autoexec <pack>/Blends/Grass_Small.blend --python tools/meadow-grass-export.py -- Grass_Small data/meadow-grass.json
# Writes, or updates in that file, the clump as a triangle list: positions (Y up, metres, the root at the origin in
# plan, the ground at y = 0), normals and the texture's v along the blade (0 root, 1 tip). Pack colours and
# textures are not used: the meadow's shader paints the grass.
import bpy, json, os, sys
name, out = sys.argv[sys.argv.index('--') + 1:][:2]
o = [o for o in bpy.data.objects if o.type == 'MESH'][0]
me = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh(); me.calc_loop_triangles(); uv = me.uv_layers.active.data
pos, nrm, v = [], [], []
for t in me.loop_triangles:
    for li in t.loops:
        l = me.loops[li]; p = o.matrix_world @ me.vertices[l.vertex_index].co; n = (o.matrix_world.to_3x3() @ l.normal).normalized()
        pos += [p.x, p.z, -p.y]; nrm += [round(n.x, 3), round(n.z, 3), round(-n.y, 3)]; v.append(round(uv[li].uv.y, 3))
xs, ys, zs = pos[0::3], pos[1::3], pos[2::3]
cx, cz, y0 = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2, min(ys)
pos = [round(p - (cx if i % 3 == 0 else y0 if i % 3 == 1 else cz), 4) for i, p in enumerate(pos)]
data = json.load(open(out)) if os.path.exists(out) else {}
data[name] = {'pos': pos, 'nrm': nrm, 'v': v}
data['source'] = "the owner's low-poly nature pack (Grass_Large.blend, Grass_Small.blend), exported by tools/meadow-grass-export.py; Y up, metres, the root at the origin; v: the texture coordinate along the blade (0 root, 1 tip)"
json.dump(data, open(out, 'w'), separators=(',', ':'))
print(f'{name}: {len(me.loop_triangles)} triangles into {out}')
