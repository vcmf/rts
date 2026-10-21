# Export a building (a Tripo FBX with one baked colour texture, art bible §10) to the look page's data
# (docs/plans/done/buildings.md): positions in metres, normals (sharp past 30°), UV0 and a per-vertex role, into
# prototypes/buildings.data.js (window.BUILDINGS, one key a model), and the texture's value as fine detail into
# data/buildings/<model>-detail.png. Pack colours are never used (AGENTS.md): each face takes a role (wall, roof,
# timber, opening, accent) by the median colour of the texels under it, nearest in Lab to the model's reference colours
# (MODELS, below); the page paints each role from the palette. The detail keeps the texture's value only, each texel
# over its neighbourhood's mean (so it varies about 1: the fine courses and slates), stored as 128 = 1, with a neutral
# block (value 1) the generated faces take. Each model is cut to about MODELS[...]['tris'] triangles (the flat regions
# dissolved within a role and a UV island, then collapsed; the export fails if the cut smears the detail: SMEAR_MAX),
# the windmill's lattice sails made again first as four solid blades on stocks (sails; MODELS['windmill']['sails']),
# and centred on its base (the footprint: BASE_BAND).
#
# Usage (from rts/; the zips are the owner's, in the git-ignored assets/buildings):
#   blender -b --python tools/building-to-js.py -- windmill assets/buildings/windmill.zip
#   blender -b --python tools/building-to-js.py -- house assets/buildings/house.zip
#   (a .fbx path works too; --analyse prints the texture's colour clusters instead; --render <png> saves three views
#   of the model as cut, painted by role, flat, for checking the classification, and with --full the model before the
#   cut; with --tex the views textured with its own texture, for checking the UVs)
import bpy, bmesh, json, math, os, sys, tempfile, zipfile
import numpy as np

ROLES = ['wall', 'roof', 'timber', 'opening', 'accent']   # the role ids are the indices (the page's building.frag)
# per model: its height or length in metres (the axis the model is fitted on), and reference colours (sRGB 0-255) per
# role, picked from the texture's clusters (--analyse); a role may list several
MODELS = {
    'windmill': {'fit': ('height', 15.0), 'tris': 2300, 'refs': {
        'wall': [(191, 125, 65), (161, 105, 59), (212, 148, 87), (226, 170, 105)],
        'roof': [(122, 49, 29), (150, 62, 36), (100, 40, 26)],
        'timber': [(99, 64, 37), (114, 77, 47), (83, 51, 29), (66, 38, 21)],
        'opening': [(36, 24, 16), (24, 18, 14)],
    }, 'up': {'roof': (0.15, 1.01), 'wall': (-0.2, 0.75), 'opening': (-0.5, 0.5)},
       # the lattice sails (sails(), the model's units): a loose part in the plane y `plane`, thinner across it than
       # `thin`, and either longer than `long` or off the tower's front column (|x| over `column`, or its centre's height
       # out of `window_z`: the tower's windows lie in that plane too); the new stock's width and depth, the blade's start
       # along the arm (a share), its offset to the side, width and depth
       'sails': {'plane': (-0.2, -0.155), 'thin': 0.03, 'long': 0.08, 'column': 0.12, 'window_z': (0.45, 0.72),
                 'stock': (0.012, 0.010), 'blade': (0.22, 0.026, 0.048, 0.004)}},
    'house': {'fit': ('length', 11.0), 'tris': 2300, 'refs': {
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
LIGHT_MARGIN = 0.018   # the light UVs' islands apart, a share of the square (smart project's margin)
# the light atlas's tile as the bake fills it (src/look/building-light.ts: TILE - 2 INSET texels a side) and the least
# gap between two islands' texels there (its MIN_GAP: a read at its MAX_LOD stays in its island's half of the gap):
# the export fails under it (the texels any part of a face touches, as the bake's points and lines draw them)
LIGHT_TEXELS = 252; LIGHT_MIN_GAP = 5
SMEAR_MAX = 0.02   # the share of the surface the cut may smear (smear) before the export fails
BASE_BAND = 0.06   # the base band the model is centred on, a share of its height
DISSOLVE_DEG = 4   # the planar dissolve's angle: faces flatter than this to each other merge (within a role)
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
    if '--render' in args and '--full' in args: render(obj, role, args[args.index('--render') + 1], img if '--tex' in args else None); return
    # the triangles cut to about cfg['tris'] (about 26 cm a triangle at the source: two or three pixels at the default
    # zoom, under one wide, so the GPU likely shaded each pixel several times: an estimate, the bench measures it): the
    # roles as materials first, so no face of one
    # role merges with another's; the windmill's lattice sails, which no cut keeps, made again as solid blades (sails)
    before = {ROLES[r]: int((role == r).sum()) for r in range(len(ROLES)) if (role == r).any()}
    set_roles(obj, role)
    smear0 = smear(obj)
    # the windmill's lattice taken out and measured first (its arms), the cut, then the solid blades built on the cut
    # mesh (a cut after them flattened their thin boxes: their faces checked once built, so built last)
    plan = sails_find(obj, cfg['sails']) if cfg.get('sails') else None
    decimate(obj, cfg['tris'] - (SAIL_TRIS if plan else 0))
    if plan: sails_build(obj, cfg['sails'], *plan); triangulate(obj)
    me = obj.data; uvl = me.uv_layers.active.data   # (the mesh's layers made again by the cut: read them anew)
    role = np.array([f.material_index for f in me.polygons])
    after = {ROLES[r]: int((role == r).sum()) for r in range(len(ROLES)) if (role == r).any()}
    print(name, 'tris', sum(before.values()), '->', len(me.polygons), 'by role', before, '->', after)
    sm = smear(obj); print(name, f'smear (the surface share whose texel density strays 4x from the median): {smear0:.3f} -> {sm:.3f}')
    if sm > SMEAR_MAX: raise SystemExit(f'{name}: the cut smeared {sm:.3f} of the surface\'s detail (over {SMEAR_MAX})')
    if '--render' in args: render(obj, role, args[args.index('--render') + 1], img if '--tex' in args else None); return
    # the fit: Blender's Z up; the model to its height, or its length along x
    co = np.array([v.co[:] for v in me.vertices]); lo, hi = co.min(0), co.max(0)
    axis, size = cfg['fit']; k = size / ((hi[2] - lo[2]) if axis == 'height' else (hi[0] - lo[0]))
    # centred on its footprint: the base band's middle (its lowest BASE_BAND of the height), not the whole box, which
    # the sails reach out of one side (the instance's origin is the footprint's centre: the paving, the ground's
    # samples, the occlusion blob)
    bb = co[co[:, 2] <= lo[2] + BASE_BAND * (hi[2] - lo[2])]; cx, cy = (bb[:, 0].min() + bb[:, 0].max()) / 2, (bb[:, 1].min() + bb[:, 1].max()) / 2
    light_uvs(obj)   # (the light bake's UVs, a second layer, first: its edit mode would leave the corner normals stale)
    # sharp past 30°: the corner normals, split where the faces meet at more than that
    for p in me.polygons: p.use_smooth = True
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    if 'FINISHED' not in bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30)): raise SystemExit('the sharp edges (shade smooth by angle) failed')
    cn = me.corner_normals
    uv2 = me.uv_layers['light'].data; uvl = me.uv_layers[0].data   # (the light bake's UVs; the detail's the first layer)
    pos, nrm, uvs, uv2s, rol, idx, key = [], [], [], [], [], [], {}
    for f in me.polygons:
        for li in f.loop_indices:
            vi = me.loops[li].vertex_index; n = cn[li].vector; u = uvl[li].uv; u2 = uv2[li].uv
            kk = (vi, round(n[0], 2), round(n[1], 2), round(n[2], 2), round(u[0], 4), round(u[1], 4), round(u2[0], 4), round(u2[1], 4), int(role[f.index]))
            if kk not in key:
                key[kk] = len(rol); c = me.vertices[vi].co
                # Blender Z-up -> Babylon Y-up (x, z, y), as tools/blend-to-js.py; centred on the footprint, the base at 0
                pos += [round((c.x - cx) * k, 3), round((c.z - lo[2]) * k, 3), round((c.y - cy) * k, 3)]
                nrm += [round(n[0], 2), round(n[2], 2), round(n[1], 2)]
                uvs += [round(u[0], 4), round(u[1], 4)]; uv2s += [round(u2[0], 4), round(u2[1], 4)]; rol.append(int(role[f.index]))
            idx.append(key[kk])
    p3 = np.array(pos).reshape(-1, 3)
    b1 = p3[p3[:, 1] < 1.0]; bc = ((b1[:, 0].min() + b1[:, 0].max()) / 2, (b1[:, 2].min() + b1[:, 2].max()) / 2)
    print(name, 'base (under 1 m) centred at', np.round(bc, 3))
    if max(abs(bc[0]), abs(bc[1])) > 0.02: raise SystemExit(f'{name}: the base is centred at {bc}, not on the origin')
    gap = light_gap(np.array(uv2s).reshape(-1, 2), p3, np.array(idx).reshape(-1, 3))
    print(name, 'light UVs: the least gap between two islands', gap, 'texels')
    if gap < LIGHT_MIN_GAP: raise SystemExit(f'{name}: two light-UV islands {gap} texels apart (under {LIGHT_MIN_GAP}: raise LIGHT_MARGIN)')
    data = {'pos': pos, 'nrm': nrm, 'uv': uvs, 'uv2': uv2s, 'role': rol, 'idx': idx, 'min': p3.min(0).round(3).tolist(), 'max': p3.max(0).round(3).tolist()}
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

def set_roles(obj, role):   # each face's role as its material index (a material a role)
    me = obj.data; me.materials.clear()
    for r in ROLES: me.materials.append(bpy.data.materials.get('role_' + r) or bpy.data.materials.new('role_' + r))
    for f in me.polygons: f.material_index = int(role[f.index])

def decimate(obj, target):
    # first the flat regions dissolved (walls, roof planes, the tower's courses: within DISSOLVE_DEG, never across a
    # role or a UV seam), then collapsed to the target. Each face keeps its role (its material) through the collapse, so
    # no triangle is of two roles; the borders and the UV seams are not held: Tripo's atlas puts 94-96 % of the vertices
    # on a seam and its parts leave open edges everywhere, and held they kept the cut from cutting (the house 8,277 to
    # 7,682 with the seams held, 6,478 with the role borders and open edges). What the collapse does to the detail is
    # measured instead (smear, printed and bounded in main: the surface share whose texel density strays 4x) and seen
    # (--render --tex). Triangles at the end. Deterministic (Blender's modifiers, no randomness)
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    m = obj.modifiers.new('dissolve', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(DISSOLVE_DEG); m.delimit = {'MATERIAL', 'UV'}
    bpy.ops.object.modifier_apply(modifier=m.name); triangulate(obj)
    n = len(obj.data.polygons)
    if n > target:
        m = obj.modifiers.new('collapse', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = target / n; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
    triangulate(obj)

def light_uvs(obj):
    # the light bake's UVs (src/look/building-light.ts: a 256² tile an instance): Blender's smart UV project into a
    # second layer, the islands LIGHT_MARGIN apart (a few texels of the tile: its dilation fills them) and scaled to fill
    # the square; the detail's UVs (the first layer) untouched
    me = obj.data
    if len(me.uv_layers) > 1: raise SystemExit('the model already has a second UV layer')
    layer = me.uv_layers.new(name='light'); me.uv_layers.active = layer
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    r = bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=LIGHT_MARGIN, area_weight=0.0, correct_aspect=True, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    if 'FINISHED' not in r: raise SystemExit('the light UVs (smart project) failed')
    me.uv_layers.active = me.uv_layers[0]
    l2 = me.uv_layers['light'].data; u = np.array([l2[i].uv[:] for i in range(len(l2))])
    if u.min() < -1e-4 or u.max() > 1 + 1e-4: raise SystemExit(f'the light UVs leave the square ({u.min()}, {u.max()})')

def light_gap(uv, pos, idx, n=LIGHT_TEXELS, most=LIGHT_MIN_GAP + 3):
    # the least Chebyshev distance, in texels of an n² tile, between texels of two light-UV islands (the faces joined by
    # a shared corner: the same position and light UV), each face's texels all those its triangle touches; most if none
    # nearer (test/buildings.test.ts measures the same)
    par = np.arange(len(uv))
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    def join(a, b):
        a, b = find(a), find(b)
        if a != b: par[a] = b
    for a, b, c in idx: join(a, b); join(b, c)
    first = {}
    for i, k in enumerate(map(tuple, np.round(np.hstack([uv * 1e4, pos * 1e4])).astype(np.int64))):
        if k in first: join(i, first[k])
        else: first[k] = i
    lab = np.array([find(i) for i in range(len(uv))])
    img = -np.ones((n, n), np.int64); gap = most
    for t in idx:
        P = uv[t] * n; x0, y0 = np.clip(np.floor(P.min(0)).astype(int), 0, n - 1); x1, y1 = np.clip(np.floor(P.max(0)).astype(int), 0, n - 1)
        X, Y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1)); hit = np.ones(X.shape, bool)
        # (a texel [X, X+1] × [Y, Y+1] touches the triangle unless an edge's line has all its corners outside: with the
        # bounding box, the separating axes of a box and a triangle)
        area = (P[1, 0] - P[0, 0]) * (P[2, 1] - P[0, 1]) - (P[2, 0] - P[0, 0]) * (P[1, 1] - P[0, 1])
        if area != 0:
            for k in range(3):
                A, B = P[k], P[(k + 1) % 3]
                out = np.ones(X.shape, bool)
                for cx, cy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                    out &= ((B[0] - A[0]) * (Y + cy - A[1]) - (B[1] - A[1]) * (X + cx - A[0])) * np.sign(area) < 0
                hit &= ~out
        ys, xs = Y[hit], X[hit]; old = img[ys, xs]
        if ((old >= 0) & (old != lab[t[0]])).any(): return 0
        img[ys, xs] = lab[t[0]]
    for dy in range(-most + 1, most):
        for dx in range(-most + 1, most):
            d = max(abs(dx), abs(dy))
            if d == 0 or d >= gap: continue
            a = img[max(0, dy):n + min(0, dy), max(0, dx):n + min(0, dx)]; b = img[max(0, -dy):n + min(0, -dy), max(0, -dx):n + min(0, -dx)]
            if ((a >= 0) & (b >= 0) & (a != b)).any(): gap = d
    return gap

def smear(obj):
    # the share of the surface whose texel density (UV area over area) strays more than 4x from the model's median: a
    # cut that stretches a face over a UV seam smears the detail there (faces with no UV area, the generated sails on
    # the neutral texel, left out)
    me = obj.data; uvl = me.uv_layers.active.data; a3, au = [], []
    for f in me.polygons:
        if len(f.loop_indices) < 3: continue
        uv = [uvl[li].uv for li in f.loop_indices]; u0 = uv[0]
        au.append(sum(abs((uv[i][0] - u0[0]) * (uv[i + 1][1] - u0[1]) - (uv[i + 1][0] - u0[0]) * (uv[i][1] - u0[1])) for i in range(1, len(uv) - 1)) / 2); a3.append(f.area)
    a3, au = np.array(a3), np.array(au); ok = (a3 > 1e-9) & (au > 1e-12); dens = au[ok] / a3[ok]; med = np.median(dens)
    bad = (dens > med * 4) | (dens < med / 4)
    return float(a3[ok][bad].sum() / a3[ok].sum())

def triangulate(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(obj.data); bm.free()

# the generated faces' UV (the windmill's sails): below 0, which building.frag reads as no detail (value 1), so they
# show their palette colour as it is and no texel of the atlas is given up for them (Tripo packs it full)
NEUTRAL_UV = (-1.0, -1.0)

def sails_find(obj, cfg):
    # the windmill's sails: its lattice (thin loose parts in the plane just before the cap: cfg, MODELS) taken out and
    # made again as four arms in the same X: a stock (timber, a long thin box) and a solid blade on its trailing side
    # (the canvas: the accent role), the hub and each arm's direction and length from the lattice's own vertices
    me = obj.data; bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    seen, parts = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop(); comp.append(g)
            for v in g.verts:
                for h in v.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        parts.append(comp)
    sail, (y0, y1) = [], cfg['plane']
    for comp in parts:
        c = np.array([v.co[:] for g in comp for v in g.verts]); lo, hi = c.min(0), c.max(0)
        mz = (lo[2] + hi[2]) / 2
        if lo[1] > y0 and hi[1] < y1 and hi[1] - lo[1] < cfg['thin'] and (max(hi[0] - lo[0], hi[2] - lo[2]) > cfg['long'] or abs((lo[0] + hi[0]) / 2) > cfg['column'] or mz > cfg['window_z'][1] or mz < cfg['window_z'][0]):
            sail += comp
    if not sail: raise SystemExit('the windmill: no sails found in their plane')
    sv = np.array([v.co[:] for g in sail for v in g.verts]); hub = np.array([np.median(sv[:, 0]), sv[:, 1].min(), np.median(sv[:, 2])])
    # the arms: the lattice's vertices round the hub split into four by angle (from the quadrants, then each vertex to
    # its nearest arm's angle, three times over), each arm along its farthest vertices' mean
    d = sv[:, [0, 2]] - hub[[0, 2]]; ang = np.arctan2(d[:, 1], d[:, 0]); rr = np.hypot(d[:, 0], d[:, 1])
    arm_ang = np.array([-0.75 * np.pi, -0.25 * np.pi, 0.25 * np.pi, 0.75 * np.pi])
    for _ in range(3):
        lab = np.abs(np.angle(np.exp(1j * (ang[:, None] - arm_ang[None])))).argmin(1)
        for q in range(4):
            m_ = lab == q
            if m_.sum() >= 10: far = rr[m_] >= np.percentile(rr[m_], 90); u = d[m_][far].mean(0); arm_ang[q] = np.arctan2(u[1], u[0])
    arms = []
    for q in range(4):
        m_ = lab == q
        if m_.sum() < 10: continue
        arms.append((np.array([np.cos(arm_ang[q]), np.sin(arm_ang[q])]), np.percentile(rr[m_], 99.5)))
    print('the sails: hub', hub.round(3), 'arms', [(a[0].round(2).tolist(), round(float(a[1]), 3)) for a in arms], 'lattice faces', len(sail))
    if len(arms) != 4: raise SystemExit(f'the windmill: {len(arms)} sail arms found, four expected')
    bmesh.ops.delete(bm, geom=list({g for g in sail}), context='FACES')
    bm.normal_update(); bm.to_mesh(me); bm.free()
    return hub, arms

# the triangles of the generated sails: four arms, a stock and a blade each, six quads a box
SAIL_TRIS = 4 * 2 * 6 * 2

def sails_build(obj, cfg, hub, arms):
    # the stocks and blades (sails_find's hub and arms) built on the cut mesh, each box's faces outward (checked)
    me = obj.data; bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active; made = []
    def box(c0, c1, wdt, dep, mat):   # a box from c0 to c1 (x, z in the plane, y the plane's depth), wdt across, dep deep
        a = np.array([c0[0], hub[1], c0[1]]); b = np.array([c1[0], hub[1], c1[1]]); t = (b - a) / np.linalg.norm(b - a); n_ = np.array([0.0, 1.0, 0.0]); s_ = np.cross(t, n_)
        vs = [bm.verts.new((p + s_ * sx * wdt / 2 + n_ * sy * dep / 2).tolist()) for p in (a, b) for sx in (-1, 1) for sy in (-1, 1)]
        ctr = (a + b) / 2
        for q_ in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            f = bm.faces.new([vs[i] for i in q_]); f.material_index = mat; f.normal_update()
            # (outward: each face's normal away from its box's centre)
            if np.dot(np.array(f.normal[:]), np.array(f.calc_center_median()[:]) - ctr) < 0: f.normal_flip()
            for l in f.loops: l[uvl].uv = NEUTRAL_UV
            made.append((f, ctr))
    for u, L in arms:
        side = np.array([-u[1], u[0]])   # the blade on the arm's one side (the sails turn one way: the same side each)
        h2 = hub[[0, 2]]; st, (b0, bo, bw, bd) = cfg['stock'], cfg['blade']
        box(h2, h2 + u * L, st[0], st[1], ROLES.index('timber'))
        box(h2 + u * L * b0 + side * bo, h2 + u * L + side * bo, bw, bd, ROLES.index('accent'))
    out = sum(1 for f, ctr in made if np.dot(np.array(f.normal[:]), np.array(f.calc_center_median()[:]) - ctr) > 0)
    print(f'the sails: {out} of {len(made)} new faces face out')
    if out != len(made): raise SystemExit('the windmill: a sail face faces in')
    bm.normal_update(); bm.to_mesh(me); bm.free()

def render(obj, role, out, img=None):   # the faces by role, flat; or (img) the model's own texture, as a check of the UVs
    cols = [(0.85, 0.75, 0.55, 1), (0.75, 0.15, 0.1, 1), (0.35, 0.2, 0.1, 1), (0.05, 0.05, 0.05, 1), (0.2, 0.6, 0.9, 1)]
    mats = []
    for r, c in enumerate(cols):
        m = bpy.data.materials.new(ROLES[r]); m.diffuse_color = c; mats.append(m)
    me = obj.data; me.materials.clear()
    for m in mats: me.materials.append(m)
    for f in me.polygons: f.material_index = int(role[f.index])
    if img:
        tm = bpy.data.materials.new('tex'); tm.use_nodes = True; n = tm.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img; tm.node_tree.nodes.active = n
        me.materials.clear(); me.materials.append(tm)
        for f in me.polygons: f.material_index = 0
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE' if img else 'MATERIAL'
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
