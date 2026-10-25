# Export a building (a Tripo FBX with one baked colour texture, art bible §10) to the look page's data
# (docs/plans/done/buildings.md, docs/plans/active/tripo-lowpoly-buildings.md): positions in metres, normals (sharp
# past 30°), UV0, a light-bake UV and a per-vertex role, into prototypes/buildings.data.js (window.BUILDINGS, one key a
# model), and data/buildings/<model>-detail.png. Pack colours are never used (AGENTS.md): each face takes a role (wall,
# roof, timber, opening, accent) from the texels under it, each nearest in Lab to the model's reference colours
# (MODELS, below); the page paints each role from the palette. The detail texture: R the texture's value over its
# neighbourhood's mean (so it varies about 1: the fine courses and slates), stored as 128 = 1; G and B the openings and
# the shutters painted inside wall and timber faces (inlays: a low-poly model paints its windows in the texture), which
# the page paints in the opening's and the shutter's colours. The model is kept as Tripo made it (its own low-poly
# export), centred on its base (the footprint: BASE_BAND). (The first models' cut to 2,300 triangles and the windmill's
# rebuilt sails: git history, docs/plans/done/buildings.md.)
#
# Usage (from rts/; the zips are the owner's, in the git-ignored assets/buildings):
#   blender -b --python tools/building-to-js.py -- windmill assets/buildings/windmill-low-poly.zip
#   blender -b --python tools/building-to-js.py -- house assets/buildings/house-low-poly.zip
#   blender -b --python tools/building-to-js.py -- farmhouse assets/buildings/building-low-poly.zip
#   blender -b --python tools/building-to-js.py -- manor assets/buildings/building-2-low-poly.zip
#   (a .fbx path works too; --analyse prints the texture's colour clusters instead; --render <png> saves three views
#   painted by role with the inlays in the opening's and shutter's colours, for checking the classification; with
#   --tex the views textured with the model's own texture, for checking the UVs)
import bpy, bmesh, json, math, os, sys, tempfile, zipfile
import numpy as np

ROLES = ['wall', 'roof', 'timber', 'opening', 'accent']   # the role ids are the indices (the page's building.frag)
# the texels' classes: the roles and the shutter, which only an inlay takes (no face is a shutter)
CLASSES = ROLES + ['shutter']
HOSTS = [ROLES.index('wall'), ROLES.index('timber')]   # the roles whose faces take inlays (building.frag gates the same)
INLAYS = [CLASSES.index('opening'), CLASSES.index('shutter')]   # the inlays' classes, the detail's G and B
# per model: its height or length in metres (the axis the model is fitted on), and reference colours (sRGB 0-255) per
# class, picked from the texture's clusters (--analyse); a class may list several. The owner's low-poly regenerations
# (2026-10-25: Tripo's own low-poly export, 1,454-1,794 triangles): the windmill (10-reference-windmill) with its
# lattice sails, the stone cottage (01-stone-cottage), the farmhouse (02-village-farmhouse) and the small manor
# (03-small-country-manor)
MODELS = {
    'windmill': {'fit': ('height', 15.0), 'refs': {
        'wall': [(191, 125, 65), (161, 105, 59), (212, 148, 87), (226, 170, 105), (184, 122, 67), (210, 144, 79),
                 (234, 182, 127), (150, 103, 65)],
        'roof': [(122, 49, 29), (150, 62, 36), (100, 40, 26), (131, 56, 33)],
        'timber': [(99, 64, 37), (114, 77, 47), (83, 51, 29), (66, 38, 21), (90, 56, 34), (67, 39, 22), (107, 70, 43)],
        'opening': [(36, 24, 16), (24, 18, 14), (4, 1, 0)],
    }, 'up': {'roof': (0.15, 1.01), 'wall': (-0.2, 0.75), 'opening': (-0.5, 0.5)}},
    'house': {'fit': ('length', 11.0), 'refs': {
        'wall': [(174, 154, 125), (188, 167, 138), (158, 139, 113), (201, 180, 151), (217, 197, 169), (183, 163, 136),
                 (165, 147, 121), (226, 207, 180), (145, 130, 108)],
        'roof': [(90, 85, 78), (68, 65, 60), (114, 103, 88), (97, 93, 86), (80, 78, 73)],
        'timber': [(166, 104, 66), (140, 86, 54), (112, 84, 58)],
        'opening': [(39, 38, 35), (24, 24, 24), (40, 38, 34)],
        'accent': [(166, 104, 66), (190, 128, 84), (140, 86, 54)],
    }, 'up': {'roof': (0.3, 1.01), 'wall': (-0.2, 0.55), 'opening': (-0.5, 0.5)},
       'zr': {'accent': (0.86, 1.01), 'timber': (-0.01, 0.86)}},
    'farmhouse': {'fit': ('length', 13.0), 'refs': {
        'wall': [(191, 169, 138), (170, 149, 121), (148, 130, 106), (212, 190, 160), (128, 108, 87)],
        'roof': [(89, 63, 47), (114, 79, 58), (60, 43, 32)],
        'opening': [(8, 3, 0), (30, 26, 22)],
        'shutter': [(105, 110, 95), (90, 96, 82), (120, 125, 108)],   # the grey-green shutters
    # (the farmhouse's walls any way up: its stone sills, which a roof's bound made tiles; the manor's slates are too
    # near its shaded stone for that, its sills stay slate)
    }, 'up': {'roof': (0.3, 1.01), 'opening': (-0.5, 0.5), 'shutter': (-0.3, 0.3)}},
    'manor': {'fit': ('length', 15.0), 'refs': {
        'wall': [(186, 163, 130), (170, 147, 116), (151, 130, 101), (204, 180, 147), (224, 201, 170), (131, 112, 87)],
        'roof': [(87, 74, 58), (67, 57, 44), (110, 93, 72)],
        'opening': [(38, 29, 19)],
    }, 'up': {'roof': (0.3, 1.01), 'wall': (-0.2, 0.55), 'opening': (-0.5, 0.5)}},
}
# 'up': per class the range of a face's normal's upward component it may take (a roof faces up, a wall stands): the
# colours alone do not split a shaded wall from a slate or a lit beam from a wall stone; 'zr': the range of a face's
# height, as a share of the model's, a class may take (the house's terracotta chimney pots: its frames are timber)
LIGHT_MARGIN = 0.018   # the light UVs' islands apart, a share of the square (smart project's margin)
# the light atlas's tile as the bake fills it (src/look/building-light.ts: TILE - 2 INSET texels a side) and the least
# gap between two islands' texels there (its MIN_GAP: a read at its MAX_LOD stays in its island's half of the gap):
# the export fails under it (the texels any part of a face touches, as the bake's points and lines draw them)
LIGHT_TEXELS = 252; LIGHT_MIN_GAP = 5
BASE_BAND = 0.06   # the base band the model is centred on, a share of its height
DETAIL_BOX, DETAIL_CLIP = 4, (0.6, 1.5)   # the detail's local mean: a 9-texel box at 512²; its range
DETAIL_PX = 512   # the detail texture's side (the source's mean over blocks: a value detail needs no more)
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

def classify(cols, refs, up=None, nz=None, zr=None, hz=None):
    # cols: (n, 3) 0..1 -> class ids (CLASSES), each the nearest in Lab of the classes in refs; nz: each one's face's
    # normal's up component, hz its height share (the up and zr bounds)
    names = [r for r in CLASSES if r in refs]
    ref = np.array([c for r in names for c in refs[r]], dtype=np.float64) / 255; rid = np.array([CLASSES.index(r) for r in names for _ in refs[r]])
    d = ((srgb_to_lab(cols)[:, None] - srgb_to_lab(ref)[None]) ** 2).sum(-1)
    if up and nz is not None:
        for j, r in enumerate(rid):
            rng = up.get(CLASSES[r])
            if rng: d[:, j] += np.where((nz < rng[0]) | (nz > rng[1]), 1e6, 0)
    if zr and hz is not None:
        for j, r in enumerate(rid):
            rng = zr.get(CLASSES[r])
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
    uvl = me.uv_layers.active.data   # (the texture's UVs: the one layer a Tripo export has, the detail's, UV0)
    nz = np.array([f.normal.z for f in me.polygons]); fz = np.array([f.center.z for f in me.polygons])
    hz = (fz - fz.min()) / max(fz.max() - fz.min(), 1e-6)
    # a first role per face (the faces too small to hold four detail texels keep it): the median of 7 texels under its
    # UV triangle (its centroid, its corners pulled in, its edges), of the roles only (no face is a shutter)
    bary = np.array([[1/3, 1/3, 1/3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45]])
    nf = len(me.polygons); cols = np.zeros((nf, 3))
    for f in me.polygons:
        uv = np.array([uvl[li].uv[:] for li in f.loop_indices]); s = bary @ uv
        xi = np.clip((s[:, 0] % 1) * w, 0, w - 1).astype(int); yi = np.clip((s[:, 1] % 1) * h, 0, h - 1).astype(int)
        cols[f.index] = np.median(px[yi, xi], 0)
    face_refs = {k: v for k, v in cfg['refs'].items() if k in ROLES}
    role = classify(cols, face_refs, cfg.get('up'), nz, cfg.get('zr'), hz)
    small = detail_scale(px); sh_, sw_ = small.shape[:2]
    fid, tx, ty = texels(me, uvl, sw_, sh_)
    tcls = classify(small[ty, tx], cfg['refs'], cfg.get('up'), nz[fid], cfg.get('zr'), hz[fid])
    role, inlay = vote(role, fid, tx, ty, tcls, (sh_, sw_))
    print(name, 'tris', nf, 'by role', {ROLES[r]: int((role == r).sum()) for r in range(len(ROLES)) if (role == r).any()},
          'inlay texels', {CLASSES[c]: int(inlay[..., k].sum()) for k, c in enumerate(INLAYS)})
    if '--render' in args:
        render(obj, role, args[args.index('--render') + 1], img if '--tex' in args else role_image(role, fid, tx, ty, inlay)); return
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
    uv2 = me.uv_layers['light'].data; uvl = me.uv_layers.active.data   # (light_uvs left the texture's layer active)
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
    det = detail(small, inlay.max(-1) > 0)
    out_dir = os.path.join(REPO, 'data', 'buildings'); os.makedirs(out_dir, exist_ok=True)
    im = bpy.data.images.new(name + '-detail', sw_, sh_, alpha=False); g = np.clip(det * 128, 0, 255).astype(np.uint8).astype(np.float32) / 255
    im.pixels[:] = np.dstack([g, inlay[..., 0], inlay[..., 1], np.ones_like(g)]).ravel()
    im.filepath_raw = os.path.join(out_dir, name + '-detail.png'); im.file_format = 'PNG'; im.save()
    # the data file: one key a model, the others kept (the models are exported one by one)
    out = os.path.join(REPO, 'prototypes', 'buildings.data.js'); allm = {}
    if os.path.exists(out):
        t = open(out).read(); allm = json.loads(t[t.index('{'):t.rindex('}') + 1])
    allm[name] = data
    with open(out, 'w') as f:
        f.write('// generated by tools/building-to-js.py from the owner\'s Tripo models (assets/buildings, git-ignored)\n')
        f.write('window.BUILDINGS=' + json.dumps(allm, separators=(',', ':')) + ';\n')
    print('wrote', out, os.path.getsize(out), 'bytes;', im.filepath_raw)

def detail_scale(px):   # the texture at the detail's scale (DETAIL_PX), each texel the mean of its st × st block
    h, w = px.shape[:2]; st = max(1, w // DETAIL_PX); hh, ww = h // st * st, w // st * st
    return px[:hh, :ww].reshape(hh // st, st, ww // st, st, 3).mean((1, 3))

def box_sum(a, k):   # the sum of a over the (2k+1)² box round each texel (edges repeated)
    p = np.pad(a, k, mode='edge'); c = np.pad(p.cumsum(0).cumsum(1), ((1, 0), (1, 0))); n = 2 * k + 1
    return c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n]

def detail(small, inl):
    # the detail's value: each texel's value over its local mean (a box of DETAIL_BOX texels round it), so only the fine
    # value (stone courses, slates, planks) is kept, whatever the region (a texel's role guessed by its colour flipped
    # between neighbours on the windmill's brown tower and blotched it), clipped to DETAIL_CLIP. The inlays' texels are
    # out of the mean (a painted window darkened it and left a pale rim round each window) and 1 themselves (the page
    # paints them in their own colour)
    val = small @ np.array([0.2126, 0.7152, 0.0722]); keep = (~inl).astype(np.float64)
    ws = box_sum(keep, DETAIL_BOX); loc = np.where(ws > 0, box_sum(val * keep, DETAIL_BOX) / np.maximum(ws, 1e-9), val)
    det = np.clip(val / np.maximum(loc, 1e-3), *DETAIL_CLIP)
    det[inl] = 1.0
    return det

def texels(me, uvl, sw_, sh_):
    # each face's texels at the detail's scale (their centres inside its UV triangle): the face ids and the texels'
    # columns and rows (rows from the bottom, as Blender's pixels)
    fid, tx, ty = [], [], []
    for f in me.polygons:
        uv = np.array([uvl[li].uv[:] for li in f.loop_indices]) * (sw_, sh_)
        lo = np.floor(uv.min(0)).astype(int); hi = np.ceil(uv.max(0)).astype(int)
        X, Y = np.meshgrid(np.arange(lo[0], hi[0] + 1) + 0.5, np.arange(lo[1], hi[1] + 1) + 0.5)
        a, b, c = uv; d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12: continue
        l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / d
        l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / d
        ins = (l1 >= 0) & (l2 >= 0) & (1 - l1 - l2 >= 0)
        xs = np.floor(X[ins]).astype(int) % sw_; ys = np.floor(Y[ins]).astype(int) % sh_
        fid += [f.index] * len(xs); tx += xs.tolist(); ty += ys.tolist()
    return np.array(fid, int), np.array(tx, int), np.array(ty, int)

def vote(role, fid, tx, ty, tcls, shape, min_share=0.25):
    # the roles from the texels' classes (tcls): a face of at least 4 texels takes their most common role other than
    # opening and the shutter if those other roles are at least min_share of its texels, else the most common class
    # (a shutter's: the face keeps its first role). In a wall or timber face (HOSTS), the opening's and the shutter's
    # texels become inlays: a mask each (G opening, B shutter; 0..1, rows from the bottom as the detail's), each texel
    # kept only with 4 of its 3 x 3 neighbours the same (no speck of shadow read as a window), closed by two texels (the
    # darker planks of a shutter, the bars of a window filled), off every texel a face of
    # another role also covers (an island's edge: the shader gates the role too), and in a part about a rectangle
    # (boxy: a blotch of shade on a face Tripo textured with its roof's slates is not). Returns the roles and the masks
    nf, nc = len(role), len(CLASSES)
    cnt = np.zeros((nf, nc), int); np.add.at(cnt, (fid, tcls), 1)
    tot = cnt.sum(1); base = cnt.copy(); base[:, INLAYS] = 0
    pick = np.where(base.sum(1) >= min_share * tot, base.argmax(1), cnt.argmax(1))
    new = np.where((tot >= 4) & (pick < len(ROLES)), pick, role)
    print('vote: faces whose role changed', int((new != role).sum()), 'of', nf)
    role = new; host = np.isin(role[fid], HOSTS)
    other = np.zeros(shape, bool); other[ty[~host], tx[~host]] = True
    sh_, sw_ = shape; mask = np.zeros((sh_, sw_, len(INLAYS)), np.float32)
    for k, c in enumerate(INLAYS):
        m = np.zeros(shape, bool); sel = (tcls == c) & host; m[ty[sel], tx[sel]] = True; m &= ~other
        m &= near(m) >= 5   # (itself and 4 neighbours)
        m = closed(m, 2) & ~other   # (a shutter's planks, a window's bars filled)
        mask[..., k] = boxy(m)
    return role, mask

def near(m):   # the count of set texels in each texel's 3 x 3 box (itself included; outside the image unset)
    h, w = m.shape; p = np.pad(m, 1).astype(int)
    return sum(p[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))

def closed(m, n):   # m closed by n texels: n dilations, then n erosions (3 x 3 each)
    for _ in range(n): m = near(m) > 0
    for _ in range(n): m = near(m) == 9
    return m

def boxy(m, fill=0.55):
    # the mask's 8-connected parts kept where they fill at least `fill` of their bounding box (a window, a pane, a
    # shutter is a rectangle), their holes filled, as 0..1
    out = np.zeros(m.shape, np.float32); seen = np.zeros(m.shape, bool); h, w = m.shape
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]: continue
        st = [(y0, x0)]; seen[y0, x0] = True; part = []
        while st:
            y, x = st.pop(); part.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; st.append((yy, xx))
        p = np.array(part); box = (np.ptp(p[:, 0]) + 1) * (np.ptp(p[:, 1]) + 1)
        if len(p) >= fill * box:
            out[p[:, 0], p[:, 1]] = 1
            # its holes filled (the texels of its box no path outside the part reaches from the box's edge: a door's
            # or a shutter's lit planks)
            y0_, x0_ = p.min(0); y1_, x1_ = p.max(0); sub = np.zeros((y1_ - y0_ + 1, x1_ - x0_ + 1), bool)
            sub[p[:, 0] - y0_, p[:, 1] - x0_] = True; hh_, ww_ = sub.shape; ext = np.zeros_like(sub)
            st = [(y, x) for y in range(hh_) for x in (0, ww_ - 1)] + [(y, x) for x in range(ww_) for y in (0, hh_ - 1)]
            st = [(y, x) for y, x in st if not sub[y, x]]
            for y, x in st: ext[y, x] = True
            while st:
                y, x = st.pop()
                for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= yy < hh_ and 0 <= xx < ww_ and not sub[yy, xx] and not ext[yy, xx]: ext[yy, xx] = True; st.append((yy, xx))
            ys_, xs_ = np.nonzero(~sub & ~ext); out[ys_ + y0_, xs_ + x0_] = 1
    return out

# the --render colours: wall, roof, timber, opening, accent; then the shutter
RENDER_COLS = np.array([(0.85, 0.75, 0.55), (0.75, 0.15, 0.1), (0.35, 0.2, 0.1), (0.05, 0.05, 0.05), (0.2, 0.6, 0.9),
                        (0.2, 0.8, 0.3)])

def role_image(role, fid, tx, ty, inlay):
    # a texture for --render at the detail's scale: each texel its face's role colour, the inlays in the opening's and
    # the shutter's (as the page paints them), grey where no face is
    sh_, sw_ = inlay.shape[:2]; c = np.full((sh_, sw_, 3), 0.5); c[ty, tx] = RENDER_COLS[role[fid]]
    for k, cl in enumerate(INLAYS): c = np.where(inlay[..., k:k + 1] > 0, RENDER_COLS[cl], c)
    im = bpy.data.images.new('roles', sw_, sh_, alpha=False); im.pixels[:] = np.dstack([c, np.ones((sh_, sw_))]).ravel()
    return im

def render(obj, role, out, img):   # three views textured with img (role_image's, or with --tex the model's own)
    me = obj.data
    tm = bpy.data.materials.new('tex'); tm.use_nodes = True; n = tm.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img
    n.interpolation = 'Closest'; tm.node_tree.nodes.active = n
    me.materials.clear(); me.materials.append(tm)
    for f in me.polygons: f.material_index = 0
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
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
        # (a corner on a texel's edge touches both texels: the first texel is the one ending at or past its least corner)
        P = uv[t] * n; x0, y0 = np.clip(np.ceil(P.min(0)).astype(int) - 1, 0, n - 1); x1, y1 = np.clip(np.floor(P.max(0)).astype(int), 0, n - 1)
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

main()
