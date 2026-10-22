"""Which bones differ between the end of one clip and the start of another. -- A B"""
import bpy, sys
a, b = sys.argv[sys.argv.index('--') + 1:]
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
def mats(clip, f):
    act = bpy.data.actions[clip]; rig.animation_data.action = act
    if hasattr(rig.animation_data, 'action_slot') and act.slots: rig.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(f)
    return {p.name: p.matrix.copy() for p in rig.pose.bones}
ma = mats(a, int(bpy.data.actions[a].frame_range[1])); mb = mats(b, 1)
d = sorted(((max((ma[n].col[3] - mb[n].col[3]).length, max(abs(x - y) for ra, rb in zip(ma[n], mb[n]) for x, y in zip(ra, rb))), n) for n in ma), reverse=True)
for v, n in d[:12]:
    if v > 1e-4: print('DIFF', round(v, 4), n)
