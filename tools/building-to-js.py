# Export a building (a Tripo FBX with one baked colour texture, art bible §10) to the look page's data
# (docs/plans/active/buildings.md): positions in metres, normals (sharp past 30°), UV0 and a per-vertex role, into
# prototypes/buildings.data.js (window.BUILDINGS, one key a model), and the texture's value as fine detail into
# data/buildings/<model>-detail.png. Pack colours are never used (AGENTS.md): each face takes a role (wall, roof,
# timber, opening, accent) by the median colour of the texels under it, nearest in Lab to the model's reference colours
# (MODELS, below); the page paints each role from the palette. The detail keeps the texture's value only, each texel
# over its neighbourhood's mean (so it varies about 1: the fine courses and slates), stored as 128 = 1.
#
# Usage (from rts/; the zips are the owner's, in the git-ignored assets/buildings):
#   blender -b --python tools/building-to-js.py -- windmill assets/buildings/windmill.zip
#   blender -b --python tools/building-to-js.py -- house assets/buildings/house.zip
#   (a .fbx path works too; --analyse prints the texture's colour clusters instead; --render <png> saves the faces
#   painted by role, flat, for checking the classification)
import bpy, bmesh, json, math, os, sys, tempfile, zipfile
import numpy as np

ROLES = ['wall', 'roof', 'timber', 'opening', 'accent']   # the role ids are the indices (the page's building.frag)
# per model: its height or length in metres (the axis the model is fitted on), and reference colours (sRGB 0-255) per
# role, picked from the texture's clusters (--analyse); a role may list several
MODELS = {
    'windmill': {'fit': ('height', 15.0), 'refs': {
        'wall': [(191, 125, 65), (161, 105, 59), (212, 148, 87), (226, 170, 105)],
        'roof': [(122, 49, 29), (150, 62, 36), (100, 40, 26)],
        'timber': [(99, 64, 37), (114, 77, 47), (83, 51, 29), (66, 38, 21)],
        'opening': [(36, 24, 16), (24, 18, 14)],
    }, 'up': {'roof': (0.15, 1.01), 'wall': (-0.2, 0.75), 'opening': (-0.5, 0.5)}},
    'house': {'fit': ('length', 11.0), 'refs': {
        'wall': [(174, 154, 125), (188, 167, 138), (158, 139, 113), (201, 180, 151), (217, 197, 169)],
        'roof': [(90, 85, 78), (68, 65, 60), (114, 103, 88)],
        'timber': [(166, 104, 66), (140, 86, 54), (112, 84, 58)],
        'opening': [(39, 38, 35), (24, 24, 24)],
        'accent': [(166, 104, 66), (190, 128, 84), (140, 86, 54)],
    }, 'up': {'roof': (0.3, 1.01), 'wall': (-0.2, 0.55), 'opening': (-0.5, 0.5)},
       'zr': {'accent': (0.86, 1.01), 'timber': (-0.01, 0.86)}},
}
# 'up': per role the range of a face's normal's upward component it may take (a roof faces up, a wall stands): the
# colours alone do not split a shaded wall from a slate or a lit beam from a wall stone; 'zr': the range of a face's
# height, as a share of the model's, a role may take (the house's terracotta chimney pots: its frames are timber)
DETAIL_BOX, DETAIL_CLIP = 4, (0.6, 1.5)   # the detail's local mean: a 9-texel box at 512²; its range
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def srgb_to_lab(c):   # c: (..., 3) in 0..1
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.endswith('.zip'):
        tmp = tempfile.mkdtemp(prefix='building-'); zipfile.ZipFile(path).extractall(tmp)
        path = next(os.path.join(r, f) for r, _, fs in os.walk(tmp) for f in fs if f.lower().endswith('.fbx'))
    bpy.ops.import_scene.fbx(filepath=path)
    # one mesh: several (a part a node) joined into it, their transforms applied
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not meshes: raise SystemExit(f'{path}: no mesh')
    if len(meshes) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes: o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]; bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active if len(meshes) > 1 else meshes[0]
    imgs = {n.image for m in obj.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}
    if len(imgs) != 1: raise SystemExit(f'{path}: {len(imgs)} textures, one expected (a Tripo export bakes one)')
    img = imgs.pop(); w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(buf)
    px = buf.reshape(h, w, 4)[..., :3]   # rows from the bottom; the texture's sRGB values as stored
    return obj, img, px

def clusters(px, k=10):
    a = px[::4, ::4].reshape(-1, 3); rng = np.random.default_rng(1); c = a[rng.choice(len(a), k, replace=False)]
    for _ in range(40):
        l = ((a[:, None] - c[None]) ** 2).sum(-1).argmin(1)
        c = np.array([a[l == j].mean(0) if (l == j).any() else c[j] for j in range(k)])
    n = np.bincount(l, minlength=k)
    for j in np.argsort(-n): print('  ', tuple(int(v * 255) for v in c[j]), f'{n[j] / len(a) * 100:.1f}%')

def classify(cols, refs, up=None, nz=None, zr=None, hz=None):   # cols: (n, 3) 0..1 -> role ids; nz: each face's normal's up component, hz its height share
    names = [r for r in ROLES if r in refs]
    ref = np.array([c for r in names for c in refs[r]], dtype=np.float64) / 255; rid = np.array([ROLES.index(r) for r in names for _ in refs[r]])
    d = ((srgb_to_lab(cols)[:, None] - srgb_to_lab(ref)[None]) ** 2).sum(-1)
    if up and nz is not None:
        for j, r in enumerate(rid):
            rng = up.get(ROLES[r])
            if rng: d[:, j] += np.where((nz < rng[0]) | (nz > rng[1]), 1e6, 0)
    if zr and hz is not None:
        for j, r in enumerate(rid):
            rng = zr.get(ROLES[r])
            if rng: d[:, j] += np.where((hz < rng[0]) | (hz > rng[1]), 1e6, 0)
    return rid[d.argmin(1)]

def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    name, path = args[0], args[1]; cfg = MODELS[name]
    obj, img, px = load(path)
    if '--analyse' in args: print(name, img.size); clusters(px); return
    h, w = px.shape[:2]
    me = obj.data; bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    obj.data.transform(obj.matrix_world); obj.matrix_world.identity()
    uvl = me.uv_layers.active.data
    # the role per face: the median of 7 texels under its UV triangle (its centroid, its corners pulled in, its edges)
    bary = np.array([[1/3, 1/3, 1/3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45]])
    nf = len(me.polygons); cols = np.zeros((nf, 3))
    for f in me.polygons:
        uv = np.array([uvl[li].uv[:] for li in f.loop_indices]); s = bary @ uv
        xi = np.clip((s[:, 0] % 1) * w, 0, w - 1).astype(int); yi = np.clip((s[:, 1] % 1) * h, 0, h - 1).astype(int)
        cols[f.index] = np.median(px[yi, xi], 0)
    nz = np.array([f.normal.z for f in me.polygons]); fz = np.array([f.center.z for f in me.polygons])
    hz = (fz - fz.min()) / max(fz.max() - fz.min(), 1e-6)
    role = classify(cols, cfg['refs'], cfg.get('up'), nz, cfg.get('zr'), hz)
    print(name, 'faces', nf, {ROLES[r]: int((role == r).sum()) for r in range(len(ROLES)) if (role == r).any()})
    if '--render' in args: render(obj, role, args[args.index('--render') + 1]); return
    # the fit: Blender's Z up; the model to its height, or its length along x
    co = np.array([v.co[:] for v in me.vertices]); lo, hi = co.min(0), co.max(0)
    axis, size = cfg['fit']; k = size / ((hi[2] - lo[2]) if axis == 'height' else (hi[0] - lo[0]))
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    # sharp past 30°: the corner normals, split where the faces meet at more than that
    for p in me.polygons: p.use_smooth = True
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    if 'FINISHED' not in bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30)): raise SystemExit('the sharp edges (shade smooth by angle) failed')
    cn = me.corner_normals
    pos, nrm, uvs, rol, idx, key = [], [], [], [], [], {}
    for f in me.polygons:
        for li in f.loop_indices:
            vi = me.loops[li].vertex_index; n = cn[li].vector; u = uvl[li].uv
            kk = (vi, round(n[0], 2), round(n[1], 2), round(n[2], 2), round(u[0], 4), round(u[1], 4), int(role[f.index]))
            if kk not in key:
                key[kk] = len(rol); c = me.vertices[vi].co
                # Blender Z-up -> Babylon Y-up (x, z, y), as tools/blend-to-js.py; centred on the footprint, the base at 0
                pos += [round((c.x - cx) * k, 3), round((c.z - lo[2]) * k, 3), round((c.y - cy) * k, 3)]
                nrm += [round(n[0], 2), round(n[2], 2), round(n[1], 2)]
                uvs += [round(u[0], 4), round(u[1], 4)]; rol.append(int(role[f.index]))
            idx.append(key[kk])
    p3 = np.array(pos).reshape(-1, 3)
    data = {'pos': pos, 'nrm': nrm, 'uv': uvs, 'role': rol, 'idx': idx, 'min': p3.min(0).round(3).tolist(), 'max': p3.max(0).round(3).tolist()}
    print(name, 'verts', len(rol), 'tris', len(idx) // 3, 'size m', (p3.max(0) - p3.min(0)).round(2).tolist())
    # the detail: the texture's value over its local mean (a box of DETAIL_BOX texels round it), so only the fine
    # value (stone courses, slates, planks) is kept, whatever the region: a texel's role guessed by its colour flipped
    # between neighbours on the windmill's brown tower (mortar read as timber) and blotched it. Clipped to DETAIL_CLIP
    # (512² is enough for a value detail: each texel the mean of its st × st block, no aliasing)
    st = max(1, w // 512); hh, ww = h // st * st, w // st * st
    small = px[:hh, :ww].reshape(hh // st, st, ww // st, st, 3).mean((1, 3)); sh_, sw_ = small.shape[:2]
    val = small @ np.array([0.2126, 0.7152, 0.0722])
    k_ = DETAIL_BOX; pad = np.pad(val, k_, mode='edge'); c_ = pad.cumsum(0).cumsum(1); c_ = np.pad(c_, ((1, 0), (1, 0)))
    n_ = 2 * k_ + 1; loc = (c_[n_:, n_:] - c_[:-n_, n_:] - c_[n_:, :-n_] + c_[:-n_, :-n_]) / (n_ * n_)
    det = np.clip(val / np.maximum(loc, 1e-3), *DETAIL_CLIP)
    det8 = np.clip(det * 128, 0, 255).astype(np.uint8)
    out_dir = os.path.join(REPO, 'data', 'buildings'); os.makedirs(out_dir, exist_ok=True)
    im = bpy.data.images.new(name + '-detail', sw_, sh_, alpha=False); g = det8.astype(np.float32) / 255
    im.pixels[:] = np.dstack([g, g, g, np.ones_like(g)]).ravel(); im.filepath_raw = os.path.join(out_dir, name + '-detail.png'); im.file_format = 'PNG'; im.save()
    # the data file: one key a model, the others kept (the models are exported one by one)
    out = os.path.join(REPO, 'prototypes', 'buildings.data.js'); allm = {}
    if os.path.exists(out):
        t = open(out).read(); allm = json.loads(t[t.index('{'):t.rindex('}') + 1])
    allm[name] = data
    with open(out, 'w') as f:
        f.write('// generated by tools/building-to-js.py from the owner\'s Tripo models (assets/buildings, git-ignored)\n')
        f.write('window.BUILDINGS=' + json.dumps(allm, separators=(',', ':')) + ';\n')
    print('wrote', out, os.path.getsize(out), 'bytes;', im.filepath_raw)

def render(obj, role, out):
    cols = [(0.85, 0.75, 0.55, 1), (0.75, 0.15, 0.1, 1), (0.35, 0.2, 0.1, 1), (0.05, 0.05, 0.05, 1), (0.2, 0.6, 0.9, 1)]
    mats = []
    for r, c in enumerate(cols):
        m = bpy.data.materials.new(ROLES[r]); m.diffuse_color = c; mats.append(m)
    me = obj.data; me.materials.clear()
    for m in mats: me.materials.append(m)
    for f in me.polygons: f.material_index = int(role[f.index])
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
    sc.render.resolution_x = 900; sc.render.resolution_y = 600
    sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.8, 0.8, 0.8)
    import mathutils
    cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    cam.type = 'ORTHO'; cam.ortho_scale = 1.6
    for k, (az, el) in enumerate([(35, 25), (215, 25), (35, 70)]):
        a, e = math.radians(az), math.radians(el); d = 3
        co.location = (d * math.cos(e) * math.sin(a), -d * math.cos(e) * math.cos(a), 0.45 + d * math.sin(e))
        co.rotation_euler = (mathutils.Vector((0, 0, 0.45)) - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = out.replace('.png', f'-{k}.png'); bpy.ops.render.render(write_still=True)

main()
