"""Bake a published figure into a unit data file for the look page's armies (docs/plans/active/armies-demo.md).

Run with Blender 5.2 on the figure pipeline's published GLBs (output/figures/<figure>/, docs/systems/figure-pipeline.md;
git-ignored, the owner's checkout):

  blender -b --python-exit-code 1 -P tools/bake-figure.py -- <figure dir> [data/figures/<figure>.unitdata]

e.g. blender -b --python-exit-code 1 -P tools/bake-figure.py -- ../rts/output/figures/fr-line-infantry

Deterministic: the same GLBs give the same bytes. Adapted from the crowd bench's bake (the branch look/l1a-crowd-bench,
its soldier bake), which read the trial's .blend: here the published soldier-lod0.glb, soldier-lod1.glb and
soldier-lod2.glb (the same skeleton and clips in all three, checked; LOD0 is the nearest, drawn only for the men tall on
screen at the closest zoom: docs/plans/active/close-zoom.md), the clips by ROLE (decision 0015: the page names roles, this file maps
them to the figure's clips; decision 0037's bindings come with the sim).

What it writes (little-endian): b'UNIT', u32 version (3), u32 header length, the header (JSON, UTF-8, padded to 4:
the bones and each one's parent, the nearest deforming ancestor or -1, the LODs, the ranges, the palette, the buffers),
then the buffers the header lists, each at a 4-byte aligned offset:
- per LOD: positions and normals (f32 x3, metres, Babylon space: x, up, z), the colour role of each vertex (u8: the
  index of a role in the header's `palette`, which the page paints with an army's colours: a palette swap recolours
  a side), bone indices (u8 x4) and weights (f32 x4, at most four influences, summing to 1), indices (u16);
- the vertex animation texture: per baked step one row of (bones + 1) x 4 RGBA texels, each bone's skinning matrix
  (pose x inverse bind) column by column, as half floats; the last matrix of a row is the identity.
Space: the importer's Blender scene (Z up, -Y forward, model units) to Babylon metres (Y up, left-handed): p' = K p,
K the swap of y and z (a reflection, which also turns right-handed into left-handed) times the figure scale, so each
skinning matrix becomes K A K^-1; the triangles keep the glTF's order: the reflection turns its counter-clockwise
fronts into the clockwise ones Babylon draws by default (left-handed: a front triangle's right-hand normal points into the
figure; #164, where reversing them drew every figure inside out: a face on the back of the head, the pack seen through
the chest).
Steps: 12 a second (the art bible's stepped animation), every other frame of the 24 fps clips along a role's chain;
a chain whose span is not a whole number of steps (a gallop of 13 frames) is resampled to the nearest whole number
of steps between frames, its root speed scaled so the feet stay planted (docs/plans/active/cavalry-artillery-demo.md).

The figure's kind (clips.json's `unit`; none: the line infantryman) picks its profile (PROFILES): the infantryman's
three published LOD GLBs and his colour roles from his texture, as before (his file unchanged, byte for byte); a
multi-part figure (the cavalryman on his horse, a gun and its crew: one skin, one GLB) decimated here into its LODs on
the rest mesh (as tools/unitpipe/infantry/lod.py), each triangle's colour role read on the full mesh (its material,
its bone, its texel) and carried through the decimation as a face attribute. Such a figure's header also names its
roles in order (the page's shadow holds four), each colour role's cloth part or material (src/look/world/dyes.ts),
and its height; bones past the format's 255 (a crew's fingers) folded into their hand.
"""
import bpy, json, math, re, struct, sys
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not args: raise SystemExit('usage: blender -b -P tools/bake-figure.py -- <figure dir> [out.unitdata]')
SRC = Path(args[0]).resolve()
OUT = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parent.parent / 'data' / 'figures' / f'{SRC.name}.unitdata'
VERSION = 3                    # 3: the triangles wound for Babylon (#164; 2's were inside out) and the bones' parents
FPS = 12                       # the art bible's stepped animation
CLIPS = json.loads((SRC / 'clips.json').read_text())
SOURCE_FPS = CLIPS['fps']
M_PER_UNIT = CLIPS['m_per_unit']
KIND = CLIPS.get('unit', 'infantry')
LODS = ['lod0', 'lod1', 'lod2']   # nearest first: the page draws LOD0 (9,274 triangles) only for the men tall on screen
ANIM = 'lod1'                  # the skeleton and the animation are read from LOD1's scene (the others checked against it)
# the roles a formation's men can be given -> (the figure's clips played in order, loop). A chain's clips join on a
# shared pose (clips.json's starts/ends), kept once; a loop's last pose is its first. The root's speed comes from the
# first clip's root_speed (the page moves a marching man at it, so his planted feet stay put)
ROLES_INFANTRY = {'halt': (['Stand'], True), 'march': (['Walking'], True), 'run': (['Running'], True),
                  'fire': (['Present', 'Aim', 'Fire', 'Reload'], True)}
# the colour roles, in the order the page's palettes list them (src/look/world/armies.ts)
PALETTE_INFANTRY = ['coat', 'facings', 'white', 'dark', 'skin', 'leather', 'pack', 'wood', 'metal']

def hsv(rgb):
    """hue in degrees, saturation, value"""
    r, g, b = rgb
    mx, mn = max(r, g, b), min(r, g, b); d = mx - mn or 1e-9
    return (((g - b) / d) % 6 if mx == r else (b - r) / d + 2 if mx == g else (r - g) / d + 4) * 60, 0 if mx == 0 else (mx - mn) / mx, mx

def texel_role(rgb):
    # the crowd bench's colour test, retuned to the published figure's texture (measured over its 512² texels: its navy
    # runs to a saturation of 0.12, below the trial's cut): the navy before the dark (a coat in shadow is still the coat),
    # the reds before the skin. The red facings sit at hue 342..8 (measured per triangle on all three LODs,
    # docs/plans/active/close-zoom.md); the skin at hue 14..26, saturation 0.38..0.55, value 0.6..0.85: a red cut at hue
    # 24 (the earlier test) took nine tenths of the hands and the faces (#133, the red faces). Hue 12..24 is red only
    # when deeply saturated
    hue, s, v = hsv(rgb)
    if 195 < hue < 275 and s > .12 and v > .05: return 'coat'
    if ((hue < 12 or hue > 335) and s > .4 or hue < 24 and s > .6) and v > .22: return 'facings'
    if ((s < .3 and 28 < hue < 75) or s < .12) and v > .5: return 'white'
    if v < .3 and s < .4: return 'dark'
    if 12 <= hue < 42 and .18 < s < .6 and v > .5: return 'skin'
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
    if role in ('skin', 'leather') and co.z > .885: return 'dark'   # above the brim: the shako, black
    # between the gaiters' tops and the collar, the navy in deep shade drifts to violet and grey (hue to 345, saturation
    # down to 0.08, measured per triangle: the chest's and the back's 'dark' triangles, #133's review): the coat, not
    # black (a white coat showed them as black blotches); the black there (the cartridge box, the scabbard) is warm or
    # greyer
    if role == 'dark' and .3 < co.z < .78:
        hue, s, _ = hsv(rgb)
        if 180 < hue < 345 and s > .08: return 'coat'
    # the face's shaded side (value under 0.5) is skin, not leather (#133): on the head's bone, its front half (y under
    # 0.02) within the cheeks (|x| under 0.06), not the visor (the brim's last 2 cm jutting forward: z over 0.865 with
    # y under -0.06), skin-like shades only (hue 5 to 40, saturation 0.15 to 0.65, value from 0.2); the hair behind,
    # the visor and the chinscales keep theirs (measured per triangle, docs/plans/active/close-zoom.md)
    visor = co.z > .865 and co.y < -.06
    if role == 'leather' and max(w, key=w.get, default='').endswith('Head') and co.y < .02 and abs(co.x) < .06 and not visor:
        hue, s, v = hsv(rgb)
        if 5 <= hue <= 40 and .15 <= s <= .65 and v >= .2: return 'skin'
    return role

def uniform_role(rgb, bone):
    """A soldier's cloth and kit from his texel, for the multi-part figures' men (the rider, the gunners; their
    textures are Tripo's, painted as the infantryman's): the coat's blue, the red facings, the white breeches and
    belts, the black boots and headgear, the skin (on the head and the hands only), the brass and the steel grey as
    metal; the rest leather"""
    hue, s, v = hsv(rgb)
    if 195 < hue < 285 and s > .15 and v > .08: return 'coat'
    if (hue < 15 or hue > 335) and s > .45 and v > .25: return 'facings'
    if v < .26 and s < .5: return 'dark'
    if 8 <= hue < 40 and .15 < s < .62 and v > .45 and ('Head' in bone or 'Hand' in bone or 'Neck' in bone): return 'skin'
    if s < .16 and v > .7: return 'white'
    if 28 < hue < 70 and s < .32 and v > .62: return 'white'      # the cream of the breeches
    if 30 <= hue < 62 and s >= .32 and v > .42: return 'metal'    # brass: the helmet, the buttons, the hilts
    if s < .2 and v > .34: return 'metal'                          # steel grey: the cuirass, the helmet's skull
    return 'leather'

# The cavalryman on his horse (output/figures/fr-cuirassier): the horse's texture (its bay hide; its black mane, tail,
# lower legs and hooves; its tack), the rider's (uniform_role), the flat materials of the kit by name
CAVALRY_KIT = {'SabreSteel': 'metal', 'SabreBrass': 'metal', 'SabreGrip': 'leather', 'Holster': 'leather',
               'Saddle': 'leather', 'Reins': 'leather', 'Shabraque': 'coat', 'Portmanteau': 'coat',
               'ShabraqueTrim': 'white'}
def cavalry_role(mat, bone, rgb, co):
    if mat in CAVALRY_KIT: return CAVALRY_KIT[mat]
    if bone.startswith('Horse:'):
        hue, s, v = hsv(rgb)
        if v < .24: return 'mane'
        if s < .22: return 'leather'   # the bridle's and the girth's greys
        return 'hide'
    if bone == 'Pistol': return 'metal'
    return uniform_role(rgb, bone)

# A light gun and its four gunners (output/figures/fr-foot-artillery): the gun's texture (its olive paint, its iron
# fittings and tyres, the barrel's bronze on the Barrel bone), the gunners' (uniform_role; the sponge staff wood), the
# flat materials by name
BATTERY_KIT = {'Cartridge': 'white', 'LinstockWood': 'wood', 'Match': 'dark'}
def battery_role(mat, bone, rgb, co):
    if mat in BATTERY_KIT: return BATTERY_KIT[mat]
    hue, s, v = hsv(rgb)
    if bone in ('Gun', 'Barrel', 'WheelL', 'WheelR'):
        if bone == 'Barrel' and 15 <= hue < 60 and s > .35 and v > .3: return 'bronze'
        if s < .25 or v < .22: return 'metal'
        if 15 <= hue < 52 and s > .45: return 'bronze'
        return 'paint'
    if bone == 'Staff': return 'wood'
    return uniform_role(rgb, bone)

# A figure kind's profile (clips.json's `unit`). glbs: the infantryman's own LOD files; glb and targets: one GLB and
# each LOD's target triangles (None: the mesh as published), decimated here from the GLB's mesh welded (welded);
# remesh: the LODs voxel remeshed before decimating (their voxel, m: remeshed); roles: the roles' clips, in the page's
# order; palette: the colour roles; parts: each colour role's cloth part (the dress's dye), 'boots', or a material of
# the era's dye set (src/look/world/dyes.ts); classify(material, bone, texel, centre): a triangle's colour role; height:
# the figure's bounds in m (a check); fold: deforming bones folded into their nearest kept ancestor (a crew's fingers:
# the format's bone indices are bytes); cull: the faces never seen from the RTS camera's pitches (elevations, degrees
# above the horizon: down to 10, below the camera's lowest, about 16 at the screen's top edge, src/look/spec.ts, and
# lower on falling ground; the sun's 27 among them so the shadow keeps its sides; yaws round the figure; frames
# sampled per clip of its roles, enough to catch the inner legs mid-gallop) removed from each LOD after decimating it
# (the targets are before the cull); lod_height: the height its LOD switches measure on screen (m; none: its
# own). The LOD targets keep about the infantryman's triangles a pixel of the figure's
# side on screen at each LOD's switch, which falls at the same height in pixels for every figure (his 1,197 and 243;
# at its switch a horse and rider shows about twice his pixels: 2,000 and 450; 4,000 cost 3.5 ms of GPU at 63 m with
# a regiment in view, docs/plans/active/cavalry-artillery-demo.md; a gun and its four gunners about five figures)
PROFILES = {
    'infantry': dict(roles=ROLES_INFANTRY, palette=PALETTE_INFANTRY, height=(1.6, 2.6)),
    'cavalry': dict(glb='cavalry.glb', targets={'lod1': 1200, 'lod2': 300},
                    # (no nearest LOD: its near LOD, remeshed whole, is drawn up close, the faster at 20 m; the owner,
                    # 2026-10-29. Its nearest was 8,600 before the cull, 6,958 after)
                    # (the faces the RTS camera never sees culled first; the LODs switched at a man's height, so a
                    # horse hands over to its lighter LODs as soon as a man does: the owner, 2026-10-28)
                    cull=dict(elevations=(10, 14, 19, 27, 40, 60, 90), yaws=16, frames=10), lod_height=1.8,
                    # (its lighter LODs voxel remeshed first, m: decimated from its welded shell they stop at about
                    # 1,300 triangles with faces flipped, from the GLB's split one they tore; the owner, 2026-10-29)
                    remesh={'lod1': 0.03, 'lod2': 0.05},
                    roles={'halt': (['Idle'], True), 'walk': (['Walk'], True), 'trot': (['Trot'], True),
                           'gallop': (['Gallop'], True)},
                    palette=['coat', 'facings', 'white', 'dark', 'skin', 'leather', 'metal', 'hide', 'mane'],
                    parts={'coat': 'coat', 'facings': 'facings', 'white': 'trousers', 'dark': 'boots',
                           'skin': {'material': 'skin'}, 'leather': {'material': 'leather'},
                           'metal': {'material': 'metal'}, 'hide': {'material': 'horse-hide'},
                           'mane': {'material': 'horse-mane'}},
                    classify=cavalry_role, height=(2.3, 3.0), fold=None),
    'battery': dict(glb='battery.glb', targets={'lod0': 30000, 'lod1': 6500, 'lod2': 1400},
                    roles={'halt': (['Idle'], True), 'fire': (['Load', 'Ready', 'Fire'], True)},
                    palette=['coat', 'facings', 'white', 'dark', 'skin', 'leather', 'wood', 'metal', 'paint', 'bronze'],
                    parts={'coat': 'coat', 'facings': 'facings', 'white': {'material': 'belts'}, 'dark': 'boots',
                           'skin': {'material': 'skin'}, 'leather': {'material': 'leather'},
                           'wood': {'material': 'wood'}, 'metal': {'material': 'metal'}, 'paint': 'paint',
                           'bronze': {'material': 'bronze'}},
                    classify=battery_role, height=(1.5, 2.3),
                    fold=re.compile(r'Hand(Index|Middle|Ring|Pinky|Thumb)\d$')),
}
if KIND not in PROFILES: raise SystemExit(f'{SRC}: clips.json names the kind {KIND}; no profile for it ({", ".join(PROFILES)})')
PROFILE = PROFILES[KIND]
MULTI = KIND != 'infantry'
# (a multi-part figure's LODs are its targets', nearest first: two of them, its near and far, and the page draws it
# with no nearest LOD, its near LOD up close; three, the first drawn only for the men tall on screen)
if MULTI: LODS = list(PROFILE['targets'])
assert len(LODS) in (2, 3), f'{KIND}: two or three LODs, not {LODS}'
ROLES = PROFILE['roles']
PALETTE_ROLES = PROFILE['palette']
ROLE_IDS = {r: i for i, r in enumerate(PALETTE_ROLES)}

def load(lod):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = SRC / (PROFILE['glb'] if MULTI else f'soldier-{lod}.glb')
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

def texture(mesh, slot=0):
    image = next(n.image for n in mesh.material_slots[slot].material.node_tree.nodes if n.type == 'TEX_IMAGE')
    W, H = image.size
    px = np.empty(W * H * 4, np.float32); image.pixels.foreach_get(px)
    return px.reshape(H, W, 4)[:, :, :3], W, H

def texel(px, W, H, uv):
    return px[min(H - 1, max(0, int(uv[1] * H))), min(W - 1, max(0, int(uv[0] * W)))]

# ---- the skeleton and the animation, from ANIM's scene (the other LODs' are checked to be the same)
scene, rig, mesh = load(ANIM)
assert scene.render.fps == SOURCE_FPS and scene.render.fps_base == 1, f'the scene runs at {scene.render.fps} fps, not {SOURCE_FPS}'
deform = [b.name for b in rig.data.bones if b.use_deform]
fold = PROFILE.get('fold')
bones = [n for n in deform if not (fold and fold.search(n))]
def kept_ancestor(b):
    """the bone itself if kept, else its nearest kept deforming ancestor's name (a folded finger: its hand)"""
    while b is not None and not (b.use_deform and b.name in bones): b = b.parent
    return b
FOLDED = {n: kept_ancestor(rig.data.bones[n]).name for n in deform}   # every deforming bone to the bone it is baked on
def deform_parent(b):
    p = b.parent
    while p is not None and not (p.use_deform and p.name in bones): p = p.parent
    return bones.index(p.name) if p is not None else -1
parents = [deform_parent(rig.data.bones[n]) for n in bones]   # each bone's nearest deforming ancestor, -1 for a root
assert len(bones) < 255, f'bone indices are stored as bytes: {len(bones)} bones (a profile can fold the small ones)'
pb = [rig.pose.bones[n] for n in bones]
inv_bind = [rig.data.bones[n].matrix_local.inverted() for n in bones]
if rig.animation_data is None: rig.animation_data_create()

def pose(action, frame, sub=0.0):
    ad = rig.animation_data; ad.action = action
    if hasattr(ad, 'action_slot') and getattr(action, 'slots', None) and len(action.slots): ad.action_slot = action.slots[0]
    scene.frame_set(frame, subframe=sub)
    return [p.matrix.copy() for p in pb]

def sample(timeline, s, span, steps, step):
    """step s of a chain baked in `steps` steps: the source frame s x step when the span is a whole number of steps
    (exact), else the place s x span / steps between two source frames (the later frame's clip, a frame back and the
    rest as a subframe: across a join, the later clip's first frame is the earlier clip's last)"""
    if span % step == 0:
        a, f = timeline[s * step]
        return pose(a, f)
    p = s * span / steps
    i = int(p); fr = p - i
    if fr < 1e-9 or i >= span:
        a, f = timeline[min(i, span)]
        return pose(a, f)
    a, f = timeline[i + 1]
    return pose(a, f - 1, fr)

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
    # (a span of whole 1/FPS s steps is baked frame by frame, as ever; another is resampled to the nearest whole number)
    whole = span % step == 0
    assert whole or MULTI, f'{rname}: {span} frames at {SOURCE_FPS} fps is not a whole number of 1/{FPS} s steps'
    steps = span // step if whole else max(1, round(span / step))
    for s in range(steps + 1):   # the first and last poses exact (a loop's closing pose too)
        row = np.zeros(((len(bones) + 1), 16), np.float32)
        for b, (m, ib) in enumerate(zip(sample(timeline, s, span, steps, step), inv_bind)):
            k = KS @ (m @ ib) @ KS_inv
            row[b] = [k[r][c] for c in range(4) for r in range(4)]   # column by column
        row[len(bones)] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        rows.append(row)
    if loop:
        gap = float(np.abs(rows[-1] - rows[-1 - steps]).max())
        assert gap < 1e-4, f'{rname} does not close: its last pose differs from its first by {gap}'
    speed = (CLIPS['clips'][clips[0]].get('root_speed') or 0) * M_PER_UNIT
    # (resampled: the cycle stretched or shortened to whole steps, the root's speed with it, the feet still planted)
    if not whole: speed *= span / (steps * step)
    seconds = span / SOURCE_FPS if whole else steps / FPS
    ranges[rname] = dict(start=start, end=start + steps, loop=loop, clips=clips, seconds=round(seconds, 4), speed=round(speed, 4))
    start += steps + 1
    if not whole: print(f'BAKE {rname}: {span} frames resampled to {steps} steps, speed {speed:.4f} m/s')
vat = np.stack(rows).astype(np.float16).view(np.uint16)
print('BAKE vat', len(rows), 'steps x', len(bones) + 1, 'matrices')

def face_roles(mesh):
    """each polygon's colour role on the full mesh (classify: its material, its first corner's heaviest bone, the
    texel at its centre, its centre), kept as the face attribute 'role' (the decimator carries it to the faces it
    keeps)"""
    me = mesh.data
    groups = {g.index: g.name for g in mesh.vertex_groups}
    pixels = {}
    for i, sl in enumerate(mesh.material_slots):
        if any(n.type == 'TEX_IMAGE' for n in sl.material.node_tree.nodes): pixels[i] = texture(mesh, i)
    uvl = me.uv_layers.active.data
    attr = me.attributes.new('role', 'INT', 'FACE')
    for p in me.polygons:
        v = me.vertices[p.vertices[0]]
        g = max(v.groups, key=lambda g: g.weight, default=None)
        bone = FOLDED.get(groups[g.group], groups[g.group]) if g else ''
        uv = sum((uvl[li].uv for li in p.loop_indices), uvl[p.loop_indices[0]].uv * 0) / len(p.loop_indices)
        rgb = texel(*pixels[p.material_index], uv) if p.material_index in pixels else (0, 0, 0)
        attr.data[p.index].value = ROLE_IDS[PROFILE['classify'](mesh.material_slots[p.material_index].material.name, bone, rgb, p.center)]

def cull_unseen(mesh, cfg):
    """the mesh's faces never seen from above (cfg: the elevations and yaws of the views, the frames sampled per clip of
    its roles) deleted: a face is seen when, at some sampled pose, a ray from its centre toward a view it faces leaves
    the posed mesh unhit. Returns the faces kept and the faces there were"""
    me = mesh.data
    seen = np.zeros(len(me.polygons), bool)
    dirs = [Vector((math.cos(math.radians(e)) * math.sin(2 * math.pi * k / cfg['yaws']),
                    math.cos(math.radians(e)) * math.cos(2 * math.pi * k / cfg['yaws']), math.sin(math.radians(e))))
            for e in cfg['elevations'] for k in range(cfg['yaws'])]
    deps = bpy.context.evaluated_depsgraph_get()
    for clips, _ in ROLES.values():
        for c in clips:
            a = bpy.data.actions[c]; end = int(a.frame_range[1])
            for i in range(cfg['frames']):
                pose(a, 1 + round(i * (end - 1) / cfg['frames']))
                ev = mesh.evaluated_get(deps); em = ev.to_mesh()
                bvh = BVHTree.FromPolygons([v.co.copy() for v in em.vertices], [tuple(p.vertices) for p in em.polygons])
                for p in em.polygons:
                    if seen[p.index]: continue
                    c0, n = p.center, p.normal
                    for d in dirs:
                        if n.dot(d) > 0 and bvh.ray_cast(c0 + d * 1e-4, d)[0] is None:
                            seen[p.index] = True; break
                ev.to_mesh_clear()
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not seen[f.index]], context='FACES')
    bm.to_mesh(me); bm.free(); me.update()
    return int(seen.sum()), len(seen)

def applied(o, kind, **props):
    """o with a modifier of `kind` (props set) applied first, before its armature: on the rest mesh"""
    m = o.modifiers.new(kind, kind)
    for k, v in props.items(): setattr(m, k, v)
    bpy.context.view_layer.objects.active = o
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
        bpy.ops.object.modifier_apply(modifier=m.name)
    return o

def tris_of(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)

def welded(mesh, dist=1e-5):
    """the mesh's vertices at one place merged (dist, model units). The GLB splits them at every UV and normal seam
    (the cuirassier: 3,739 islands of a few triangles each, 175 once welded), and the collapse decimator, which keeps
    an island's open edges in place only roughly, tore the figure at every seam: holes, shredded legs, loose shards
    (the near LOD, found by the owner, 2026-10-29). The colours are per face role and the normals the vertices' own,
    so the seams carry nothing the bake keeps"""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(mesh.data); bm.free(); mesh.data.update()

def decimated(mesh, target):
    """a copy of the mesh collapse-decimated on its rest pose to about `target` triangles (before the armature deforms
    it, as tools/unitpipe/infantry/lod.py: the decimator interpolates the skin weights), or the mesh itself (None)"""
    if target is None: return mesh
    o = mesh.copy(); o.data = mesh.data.copy(); bpy.context.scene.collection.objects.link(o)
    return applied(o, 'DECIMATE', decimate_type='COLLAPSE', ratio=target / tris_of(mesh.data),
                   use_collapse_triangulate=True)

def remeshed(mesh, voxel, target):
    """a closed copy of the mesh for a LOD lighter than its welded shell decimates to (the decimator keeps an open
    shell's edges, so the cuirassier stops at about 1,300 triangles): voxel remeshed on its rest pose (voxel m), then
    collapse-decimated to about `target`; each vertex's skin weights read from the nearest point of the mesh
    (barycentric over that face's corners) and each face's colour role from the mesh's face nearest its centre"""
    from mathutils.geometry import barycentric_transform
    o = mesh.copy(); o.data = mesh.data.copy(); bpy.context.scene.collection.objects.link(o)
    applied(o, 'REMESH', mode='VOXEL', voxel_size=voxel / M_PER_UNIT)
    applied(o, 'DECIMATE', decimate_type='COLLAPSE', ratio=min(1.0, target / tris_of(o.data)),
            use_collapse_triangulate=True)
    src = mesh.data
    bvh = BVHTree.FromPolygons([v.co.copy() for v in src.vertices], [tuple(p.vertices) for p in src.polygons])
    names = {g.index: g.name for g in mesh.vertex_groups}
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    groups = {n: o.vertex_groups.new(name=n) for n in names.values()}
    me = o.data
    for v in me.vertices:
        co, _, fi, _ = bvh.find_nearest(v.co)
        corners = [src.vertices[i] for i in src.polygons[fi].vertices]
        assert len(corners) == 3, 'remeshed: the source mesh is triangles (the GLB)'
        b = barycentric_transform(co, *(c.co for c in corners), Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        b = [max(0.0, x) for x in b]; t = sum(b) or 1.0
        acc = {}
        for c, w in zip(corners, b):
            for g in c.groups: acc[g.group] = acc.get(g.group, 0.0) + g.weight * w / t
        for gi, w in acc.items():
            if w > 1e-4: groups[names[gi]].add([v.index], w, 'REPLACE')
    roles = src.attributes['role'].data
    attr = me.attributes.get('role') or me.attributes.new('role', 'INT', 'FACE')
    for p in me.polygons:
        attr.data[p.index].value = roles[bvh.find_nearest(p.center)[2]].value
    if not me.uv_layers: me.uv_layers.new()
    return o

# ---- the LOD meshes
lods, blobs = [], []
if MULTI:
    welded(mesh)
    face_roles(mesh)
    multi_src = mesh
for lod in LODS:
    if MULTI:
        # (a culled LOD is always a decimated copy: culling the published mesh itself would cut the source shared by
        # every LOD)
        assert not PROFILE.get('cull') or PROFILE['targets'][lod] is not None, f'{lod}: a culled LOD needs a target'
        voxel = PROFILE.get('remesh', {}).get(lod)
        mesh = (remeshed(multi_src, voxel, PROFILE['targets'][lod]) if voxel else
                decimated(multi_src, PROFILE['targets'][lod]))
        # (culled after decimating, on the LOD's own closed mesh: decimating an open shell tore holes at its edges)
        if PROFILE.get('cull'):
            kept, was = cull_unseen(mesh, PROFILE['cull'])
            print(f'BAKE {lod} cull: {kept} of {was} faces seen from above, the rest removed')
    elif lod != ANIM:
        scene, rig2, mesh = load(lod)
        assert [b.name for b in rig2.data.bones if b.use_deform] == deform, f'{lod}: not the same skeleton as {ANIM}'
        # its vertices are skinned with ANIM's inverse binds (the bones' texture): the rest poses must agree too
        gap = max(abs(x - y) for n, ib in zip(bones, inv_bind) for r0, r1 in zip(rig2.data.bones[n].matrix_local, ib.inverted()) for x, y in zip(r0, r1))
        assert gap < 1e-4, f'{lod}: its rest pose differs from {ANIM}\'s by {gap} (model units)'
    else: scene, rig, mesh = load(lod)
    if not MULTI: px, W, H = texture(mesh)
    me = mesh.data.copy(); me.calc_loop_triangles()
    groups = {g.index: g.name for g in mesh.vertex_groups}
    bone_of = {n: i for i, n in enumerate(bones)}
    bone_of.update({n: bone_of[k] for n, k in FOLDED.items()})   # (a folded bone's weight goes to its kept ancestor)
    uvl = me.uv_layers.active.data
    roles_attr = me.attributes['role'].data if MULTI else None
    key_of, verts, idx, area = {}, [], [], {}
    for tri in me.loop_triangles:
        # one role per triangle, read at its centre: flat colour regions with crisp edges (a vertex shared by triangles
        # of different roles is split)
        if MULTI:
            role = PALETTE_ROLES[roles_attr[tri.polygon_index].value]
        else:
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
        # (folded bones' weights summed onto their kept ancestor, then its four largest)
        acc = {}
        for g in v.groups:
            if groups[g.group] in bone_of and g.weight > 1e-4:
                b = bone_of[groups[g.group]]; acc[b] = acc.get(b, 0) + g.weight
        inf = sorted(((w, b) for b, w in acc.items()), reverse=True)[:4] if MULTI else sorted(((g.weight, bone_of[groups[g.group]]) for g in v.groups if groups[g.group] in bone_of and g.weight > 1e-4), reverse=True)[:4]
        tot = sum(w for w, _ in inf); assert tot > 0, f'{lod}: vertex {vi} has no deform weight'
        for k_, (w, b) in enumerate(inf): bi[j, k_] = b; bw[j, k_] = w / tot
    tris = np.array(idx, np.uint16).reshape(-1, 3)   # the glTF's order: after the reflection, Babylon's front (#164)
    # its fronts face out: a triangle's right-hand normal (in Babylon space) against its vertex normals, for nearly all
    # the mesh's signed volume by the right hand, sum of p0 . (p1 x p2) / 6, in Babylon space: negative when its fronts
    # are clockwise from outside (Babylon's; inside out, positive)
    p64 = pos.astype(np.float64)
    if PROFILE.get('cull'):
        # (an open shell has no volume: its triangles' right-hand normals against their vertex normals instead, most
        # of its area opposite for Babylon's clockwise fronts, a whole mesh wound backwards about none of it; by area,
        # as a remeshed LOD's slivers' vertex normals, smoothed over a few hundred triangles, say little. Faces torn
        # or flipped here and there: the LODs' coverage test, test/figure-lods.test.ts)
        rh = np.cross(p64[tris[:, 1]] - p64[tris[:, 0]], p64[tris[:, 2]] - p64[tris[:, 0]])
        vn = nor[tris[:, 0]] + nor[tris[:, 1]] + nor[tris[:, 2]]
        ar = np.linalg.norm(rh, axis=1)
        out = float(ar[np.einsum('ij,ij->i', rh, vn) < 0].sum() / max(ar.sum(), 1e-12))
        print(f'BAKE {lod} wound for Babylon: {out:.3f} of its area')
        assert out > 0.8, f'{lod}: only {out:.2f} of its area wound for Babylon (#164)'
    else:
        vol = float(np.einsum('ij,ij->i', p64[tris[:, 0]], np.cross(p64[tris[:, 1]], p64[tris[:, 2]])).sum() / 6)
        assert vol < 0, f'{lod}: signed volume {vol:.4f} m^3 by the right hand: wound inside out for Babylon'
    h = float(pos[:, 1].max() - pos[:, 1].min())
    lo, hi = PROFILE['height']
    assert lo < h < hi, f'{lod}: the figure is {h:.2f} m tall, not within {lo} to {hi} m (its kind: {KIND})'
    tot_a = sum(area.values()); share = {r: round(a / tot_a, 3) for r, a in sorted(area.items(), key=lambda x: -x[1])}
    lods.append(dict(name=lod, vertices=n, triangles=len(tris), roles=counts, areas=share))
    if lod == LODS[0]: height = float(pos[:, 1].max())
    blobs += [pos, nor, rol, bi, bw, tris]
    bpy.data.meshes.remove(me)
    print('BAKE', lod, n, 'vertices', len(tris), 'triangles', round(h, 3), 'm, surface by role', share)

# ---- write
header = dict(version=VERSION, fps=FPS, mPerUnit=M_PER_UNIT, bones=bones, parents=parents, lods=lods, ranges=ranges,
              vat=dict(width=(len(bones) + 1) * 4, height=len(rows), halfFloat=True),
              palette=PALETTE_ROLES, source=SRC.name, buffers=[])
if MULTI:
    # (the roles in the page's order, each colour role's part, the figure's height over its root: src/look/units-data.ts)
    header.update(roles=list(ROLES), parts=PROFILE['parts'], height=round(height, 3))
    if PROFILE.get('lod_height'): header.update(lodHeight=PROFILE['lod_height'])
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
