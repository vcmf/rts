"""Accepted clips that later versions did not touch are identical, frame by frame, to the version that
made them. Changed on purpose since: Walking and Running (game speeds, v13), Walking, MakeReady and
GuardReady (the free arm, v12), Fire (split
into Present, Aim and Fire, v10), and the v6 clips (superseded, no longer built)."""
import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy
from pathlib import Path
root=paths.work('infantry')
# the archived versions that made the accepted clips (v7, v8): not in the repository. Without them the check
# fails, unless UNITPIPE_SKIP_COMPARE=1 says on purpose that it is not run
import os
ARCHIVE=paths.OUTPUT/'unitpipe'/'infantry-archive'
if not (ARCHIVE/'v8'/'soldier-animated.blend').exists():
    skip=os.environ.get('UNITPIPE_SKIP_COMPARE')=='1'
    print('COMPARE', 'SKIPPED on purpose' if skip else 'FAILED', ': no archive at', ARCHIVE, '(copy the archived v7 and v8 folders there)')
    raise SystemExit(0 if skip else 1)
CHECK={'v8':[('Reload',272),('BayonetGuard',33),('BayonetThrust',30),('ButtStroke',36)]}
def poses(blend,clips):
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');out={}
    for name,end in clips:
        rig.animation_data.action=bpy.data.actions[name]
        for frame in range(1,end+1):
            bpy.context.scene.frame_set(frame);out[name,frame]={p.name:p.matrix.copy() for p in rig.pose.bones}
    return out
worst=0
for version,clips in CHECK.items():
    old=poses(ARCHIVE/version/'soldier-animated.blend',clips);new=poses(root/'soldier-animated.blend',clips)
    for key,bones in old.items():
        for bone,m in bones.items():
            n=new[key][bone];worst=max(worst,max(abs(m[r][c]-n[r][c]) for r in range(4) for c in range(4)))
assert worst<1e-5,('Accepted clips changed',worst)
print('PASS: Reload, BayonetGuard, BayonetThrust, ButtStroke (v8) preserved on every frame; maximum matrix difference:',worst)
