import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy
from pathlib import Path
root=paths.work('infantry')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'soldier-animated.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
with bpy.data.libraries.load(str(root/'soldier-animated.blend')) as (src,_):built=len(src.actions)
assert len(bpy.data.actions)==built,(len(bpy.data.actions),built)
for action in bpy.data.actions:
    rig.animation_data.action=action
    if action.slots:
        rig.animation_data.action_slot=action.slots[0]
    samples=[]
    for frame in (1,5,9,13):
        bpy.context.scene.frame_set(frame)
        samples.append([bone.matrix.copy() for bone in rig.pose.bones])
    delta=max(abs(a[r][c]-b[r][c]) for a,b in zip(samples[0],samples[1]) for r in range(4) for c in range(4))
    assert delta>.001, (action.name, 'no animation after import')
    print('PASS roundtrip:', action.name, 'animated pose change:',delta)
print('PASS: exported GLB reimports with all',built,'skeletal actions working.')
