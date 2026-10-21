"""Bake a published figure into a unit data file for the look page's armies (docs/plans/active/armies-demo.md).

Run with Blender 5.2 on the figure pipeline's published GLBs (output/figures/<figure>/, docs/systems/figure-pipeline.md;
git-ignored, the owner's checkout):

  blender -b --python-exit-code 1 -P tools/bake-figure.py -- <figure dir> [data/figures/<figure>.unitdata]

e.g. blender -b --python-exit-code 1 -P tools/bake-figure.py -- ../rts/output/figures/fr-line-infantry

Deterministic: the same GLBs give the same bytes. Adapted from the crowd bench's bake (the branch look/l1a-crowd-bench,
its soldier bake), which read the trial's .blend: here the published soldier-lod1.glb and soldier-lod2.glb (the
same skeleton and clips in both, checked), the clips by ROLE (decision 0015: the page names roles, this file maps
them to the figure's clips; decision 0037's bindings come with the sim).

What it writes (little-endian): b'UNIT', u32 version (2), u32 header length, the header (JSON, UTF-8, padded to 4),
then the buffers the header lists, each at a 4-byte aligned offset:
- per LOD: positions and normals (f32 x3, metres, Babylon space: x, up, z), the colour role of each vertex (u8: the
  index of a role in the header's `palette`, which the page paints with an army's colours: a palette swap recolours
  a side), bone indices (u8 x4) and weights (f32 x4, at most four influences, summing to 1), indices (u16);
- the vertex animation texture: per baked step one row of (bones + 1) x 4 RGBA texels, each bone's skinning matrix
  (pose x inverse bind) column by column, as half floats; the last matrix of a row is the identity.
Space: the importer's Blender scene (Z up, -Y forward, model units) to Babylon metres (Y up, left-handed): p' = K p,
K the swap of y and z (a reflection, which also turns right-handed into left-handed) times the figure scale, so each
skinning matrix becomes K A K^-1; the triangles' winding is reversed to keep their outside out.
Steps: 12 a second (the art bible's stepped animation), every other frame of the 24 fps clips along a role's chain.
"""
import bpy, json, struct, sys
import numpy as np
from pathlib import Path
from mathutils import Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not args: raise SystemExit('usage: blender -b -P tools/bake-figure.py -- <figure dir> [out.unitdata]')
SRC = Path(args[0]).resolve()
OUT = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parent.parent / 'data' / 'figures' / f'{SRC.name}.unitdata'
VERSION = 2
FPS = 12                       # the art bible's stepped animation
CLIPS = json.loads((SRC / 'clips.json').read_text())
SOURCE_FPS = CLIPS['fps']
M_PER_UNIT = CLIPS['m_per_unit']
LODS = ['lod1', 'lod2']        # LOD0 (9,274 triangles) is for stills: a battalion of 400 at LOD1 is already 480 k
# the roles a formation's men can be given -> (the figure's clips played in order, loop). A chain's clips join on a
# shared pose (clips.json's starts/ends), kept once; a loop's last pose is its first. The root's speed comes from the
# first clip's root_speed (the page moves a marching man at it, so his planted feet stay put)
ROLES = {'halt': (['Stand'], True), 'march': (['Walking'], True), 'run': (['Running'], True),
         'fire': (['Present', 'Aim', 'Fire', 'Reload'], True)}
# the colour roles, in the order the page's palettes list them (src/look/world/armies.ts)
PALETTE_ROLES = ['coat', 'facings', 'white', 'dark', 'skin', 'leather', 'pack', 'wood', 'metal']
ROLE_IDS = {r: i for i, r in enumerate(PALETTE_ROLES)}

def load(lod):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = SRC / f'soldier-{lod}.glb'
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene = bpy.context.scene
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    mesh = next(o for o in scene.objects if o.type == 'MESH' and o.parent is rig)
    for o in (rig, mesh):
        assert max(abs(x - y) for r0, r1 in zip(o.matrix_world, Matrix.Identity(4)) for x, y in zip(r0, r1)) < 1e-5, f'{lod}: {o.name} is not at the origin with no rotation or scale'
    return scene, rig, mesh

K = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # Blender (x, y, z) -> Babylon (x, z, y)
S = Matrix.Diagonal((M_PER_UNIT, M_PER_UNIT, M_PER_UNIT, 1))
KS, KS_inv = S @ K, (S @ K).inverted()

def texture(mesh):
    image = next(n.image for n in mesh.material_slots[0].material.node_tree.nodes if n.type == 'TEX_IMAGE')
    W, H = image.size
    px = np.empty(W * H * 4, np.float32); image.pixels.foreach_get(px)
    return px.reshape(H, W, 4)[:, :, :3], W, H

def texel(px, W, H, uv):
    return px[min(H - 1, max(0, int(uv[1] * H))), min(W - 1, max(0, int(uv[0] * W)))]

def texel_role(rgb):
    # the crowd bench's colour test, retuned to the published figure's texture (measured over its 512² texels: its red
    # runs to hue 25 and its navy to a saturation of 0.12, both below the trial's cuts): the navy before the dark (a
    # coat in shadow is still the coat), the reds before the skin (the skin lighter and less saturated)
    r, g, b = rgb
    mx, mn = max(r, g, b), min(r, g, b); v = mx; s = 0 if mx == 0 else (mx - mn) / mx; d = mx - mn or 1e-9
    hue = (((g - b) / d) % 6 if mx == r else (b - r) / d + 2 if mx == g else (r - g) / d + 4) * 60
    if 195 < hue < 275 and s > .12 and v > .05: return 'coat'
    if (hue < 24 or hue > 335) and s > .4 and v > .22: return 'facings'
    if ((s < .3 and 28 < hue < 75) or s < .12) and v > .5: return 'white'
    if v < .3 and s < .4: return 'dark'
    if 14 < hue < 42 and .18 < s < .55 and v > .5: return 'skin'
    return 'leather'

def tri_role(me, groups, vi, co, rgb):
    """A triangle's role: its first corner's weights decide the musket (its triangles are wholly the musket's), its
    centre co (model units, Z up, the back at +y) the pack, the texel at its centre the rest."""
    w = {groups[g.group]: g.weight for g in me.vertices[vi].groups}
    if w.get('Musket', 0) + w.get('Ramrod', 0) > .5:
        mx, mn = max(rgb), min(rgb)
        return 'metal' if mx > .45 and (mx - mn) / max(mx, 1e-9) < .25 else 'wood'
    if co.y > .075 and co.z > .55: return 'pack'   # the pack and blanket roll on the back
    role = texel_role(rgb)
    return 'dark' if role in ('skin', 'leather') and co.z > .885 else role   # above the brim: the shako, black

# ---- the skeleton and the animation, from LOD1's scene (LOD2's is checked to be the same)
scene, rig, mesh = load(LODS[0])
assert scene.render.fps == SOURCE_FPS and scene.render.fps_base == 1, f'the scene runs at {scene.render.fps} fps, not {SOURCE_FPS}'
bones = [b.name for b in rig.data.bones if b.use_deform]
assert len(bones) < 255, 'bone indices are stored as bytes'
pb = [rig.pose.bones[n] for n in bones]
inv_bind = [rig.data.bones[n].matrix_local.inverted() for n in bones]
if rig.animation_data is None: rig.animation_data_create()

def pose(action, frame):
    ad = rig.animation_data; ad.action = action
    if hasattr(ad, 'action_slot') and getattr(action, 'slots', None) and len(action.slots): ad.action_slot = action.slots[0]
    scene.frame_set(frame)
    return [p.matrix.copy() for p in pb]

rows, ranges, start = [], {}, 0
step = SOURCE_FPS // FPS
for rname, (clips, loop) in ROLES.items():
    timeline = []   # (action, frame at 24 fps), each join kept once
    for i, c in enumerate(clips):
        a = bpy.data.actions[c]; end = int(a.frame_range[1])
        assert int(a.frame_range[0]) == 1 and end == CLIPS['clips'][c]['frames'], f'{c}: frames {tuple(a.frame_range)}, clips.json {CLIPS["clips"][c]["frames"]}'
        timeline += [(a, f) for f in range(1 if i == 0 else 2, end + 1)]
    for i, c in enumerate(clips[1:]):   # a clip starts on the pose the one before it ends on
        last = pose(bpy.data.actions[clips[i]], int(bpy.data.actions[clips[i]].frame_range[1])); first = pose(bpy.data.actions[c], 1)
        gap = max(abs(x - y) for m0, m1 in zip(last, first) for r0, r1 in zip(m0, m1) for x, y in zip(r0, r1))
        assert gap < 1e-4, f'{rname}: {c} does not start where {clips[i]} ends (gap {gap})'
    span = len(timeline) - 1
    assert span % step == 0, f'{rname}: {span} frames at {SOURCE_FPS} fps is not a whole number of 1/{FPS} s steps'
    steps = span // step
    for s in range(steps + 1):   # every other source frame: the first and last poses exact (a loop's closing pose too)
        a, f = timeline[s * step]
        row = np.zeros(((len(bones) + 1), 16), np.float32)
        for b, (m, ib) in enumerate(zip(pose(a, f), inv_bind)):
            k = KS @ (m @ ib) @ KS_inv
            row[b] = [k[r][c] for c in range(4) for r in range(4)]   # column by column
        row[len(bones)] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        rows.append(row)
    if loop:
        gap = float(np.abs(rows[-1] - rows[-1 - steps]).max())
        assert gap < 1e-4, f'{rname} does not close: its last pose differs from its first by {gap}'
    speed = (CLIPS['clips'][clips[0]].get('root_speed') or 0) * M_PER_UNIT
    ranges[rname] = dict(start=start, end=start + steps, loop=loop, clips=clips, seconds=round(span / SOURCE_FPS, 4), speed=round(speed, 4))
    start += steps + 1
vat = np.stack(rows).astype(np.float16).view(np.uint16)
print('BAKE vat', len(rows), 'steps x', len(bones) + 1, 'matrices')

# ---- the LOD meshes
lods, blobs = [], []
for lod in LODS:
    if lod != LODS[0]:
        scene, rig2, mesh = load(lod)
        assert [b.name for b in rig2.data.bones if b.use_deform] == bones, f'{lod}: not the same skeleton as {LODS[0]}'
    px, W, H = texture(mesh)
    me = mesh.data.copy(); me.calc_loop_triangles()
    groups = {g.index: g.name for g in mesh.vertex_groups}
    bone_of = {n: i for i, n in enumerate(bones)}
    uvl = me.uv_layers.active.data
    key_of, verts, idx, area = {}, [], [], {}
    for tri in me.loop_triangles:
        # one role per triangle, read at its centre: flat colour regions with crisp edges (a vertex shared by triangles
        # of different roles is split)
        uv = sum((uvl[li].uv for li in tri.loops), uvl[tri.loops[0]].uv * 0) / 3
        co = sum((me.vertices[me.loops[li].vertex_index].co for li in tri.loops), me.vertices[0].co * 0) / 3
        role = tri_role(me, groups, me.loops[tri.loops[0]].vertex_index, co, texel(px, W, H, uv))
        area[role] = area.get(role, 0) + tri.area
        for li in tri.loops:
            vi = me.loops[li].vertex_index; k = (vi, role)
            if k not in key_of: key_of[k] = len(verts); verts.append(k)
            idx.append(key_of[k])
    n = len(verts); assert n < 65536
    pos = np.zeros((n, 3), np.float32); nor = np.zeros((n, 3), np.float32); rol = np.zeros(n, np.uint8)
    bi = np.zeros((n, 4), np.uint8); bw = np.zeros((n, 4), np.float32); counts = {}
    for j, (vi, role) in enumerate(verts):
        v = me.vertices[vi]
        pos[j] = (KS @ v.co.to_4d()).xyz
        nor[j] = (K.to_3x3() @ v.normal).normalized()
        rol[j] = ROLE_IDS[role]; counts[role] = counts.get(role, 0) + 1
        inf = sorted(((g.weight, bone_of[groups[g.group]]) for g in v.groups if groups[g.group] in bone_of and g.weight > 1e-4), reverse=True)[:4]
        tot = sum(w for w, _ in inf); assert tot > 0, f'{lod}: vertex {vi} has no deform weight'
        for k_, (w, b) in enumerate(inf): bi[j, k_] = b; bw[j, k_] = w / tot
    tris = np.array(idx, np.uint16).reshape(-1, 3)[:, ::-1].copy()   # the reflection reverses the winding: back
    h = float(pos[:, 1].max() - pos[:, 1].min())
    assert 1.6 < h < 2.6, f'{lod}: the figure is {h:.2f} m tall (with its musket), not a man'
    tot_a = sum(area.values()); share = {r: round(a / tot_a, 3) for r, a in sorted(area.items(), key=lambda x: -x[1])}
    lods.append(dict(name=lod, vertices=n, triangles=len(tris), roles=counts, areas=share))
    blobs += [pos, nor, rol, bi, bw, tris]
    bpy.data.meshes.remove(me)
    print('BAKE', lod, n, 'vertices', len(tris), 'triangles', round(h, 3), 'm, surface by role', share)

# ---- write
header = dict(version=VERSION, fps=FPS, mPerUnit=M_PER_UNIT, bones=bones, lods=lods, ranges=ranges,
              vat=dict(width=(len(bones) + 1) * 4, height=len(rows), halfFloat=True),
              palette=PALETTE_ROLES, source=SRC.name, buffers=[])
payload = b''; off = 0
def add(arr, label):
    global payload, off
    b = arr.tobytes(); pad = (-len(b)) % 4
    header['buffers'].append(dict(name=label, offset=off, bytes=len(b), type=str(arr.dtype)))
    payload += b + b'\0' * pad; off += len(b) + pad
for lod, i in zip(lods, range(0, len(blobs), 6)):
    for arr, k in zip(blobs[i:i + 6], ['positions', 'normals', 'roles', 'boneIndices', 'boneWeights', 'indices']):
        add(arr, f"{lod['name']}.{k}")
add(vat, 'vat')
hj = json.dumps(header, separators=(',', ':'), sort_keys=True).encode()
hj += b' ' * ((-len(hj)) % 4)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(b'UNIT' + struct.pack('<II', VERSION, len(hj)) + hj + payload)
print('BAKE wrote', OUT, OUT.stat().st_size, 'bytes')
