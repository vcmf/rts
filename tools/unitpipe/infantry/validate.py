import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy,json,struct,math
from pathlib import Path
from mathutils import Vector
root=paths.work('infantry')
bpy.ops.wm.open_mainfile(filepath=str(root/'soldier-animated.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='PreviewGround')
components=json.loads((root/'components.json').read_text())
gunids=[i for c in components if c['max'][1]<-.09 and c['min'][0]<-.045 for i in c['ids']]
report={}
for name,end in [('Walking',33),('Running',17)]:   # the pose-function clips; the key-pose clips are in validate-drill.py
    rig.animation_data.action=bpy.data.actions[name]
    samples=[];muzzle=[];worst=0;neckgap=0;necklengtherror=0;wristbend=0;wristgap=0;carry_y=[];elbow_offset=[];min_z=1;griperror=0
    for frame in range(1,end+1):
        bpy.context.scene.frame_set(frame)
        ev=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        assert all(math.isfinite(c) for v in ev.data.vertices for c in v.co)
        min_z=min(min_z,min(v.co.z for v in ev.data.vertices))
        gun=rig.pose.bones['Musket']
        transform=gun.matrix@gun.bone.matrix_local.inverted()
        worst=max(worst,max((ev.data.vertices[i].co-transform@mesh.data.vertices[i].co).length for i in gunids))
        if frame in [1,end]:samples.append([p.matrix.copy() for p in rig.pose.bones])
        muzzle.append(rig.pose.bones['BarrelMuzzle'].head.copy())
        if name=='Running':
            for side,contact,anchor in [('Left',(-.012,-.012,-.025),'PortGrip'),('Right',(.010,-.025,-.008),'TriggerGrip')]:
                hb=rig.pose.bones['mixamorig:'+side+'Hand']
                point=hb.matrix@hb.bone.matrix_local.inverted()@(hb.bone.head_local+Vector(contact))
                griperror=max(griperror,(point-rig.pose.bones[anchor].head).length)
    endpoint=max(abs(a[r][c]-b[r][c]) for a,b in zip(*samples) for r in range(4) for c in range(4))
    assert endpoint<1e-4,(name,endpoint)
    assert worst<1e-5,('Weapon is deforming',worst)
    travel=max((a-b).length for a in muzzle for b in muzzle)
    if name=='Walking':assert travel>.025,('Weapon carry has no motion',travel)
    report[name]={'duration_seconds':(end-1)/24,'endpoint_matrix_error':endpoint,'weapon_rigidity_error':worst,'muzzle_travel':travel}
    assert min_z>-.012,('Mesh penetrates ground',name,min_z)
    report[name]['minimum_mesh_height']=min_z
    assert griperror<.001,('Hand lost weapon contact',name,griperror)
    report[name]['maximum_grip_contact_error']=griperror
    # Joint attachment and wrist bends are checked between keys as well as on them.
    for i in range(2*(end-1)+1):
        frame=1+i*.5
        bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame))
        neck=rig.pose.bones['mixamorig:Neck'];head=rig.pose.bones['mixamorig:Head']
        neckgap=max(neckgap,(head.head-neck.tail).length)
        necklengtherror=max(necklengtherror,abs((neck.tail-neck.head).length-neck.bone.length))
        for side in ['Left','Right']:
            fore=rig.pose.bones['mixamorig:'+side+'ForeArm'];hand=rig.pose.bones['mixamorig:'+side+'Hand']
            wristgap=max(wristgap,(hand.head-fore.tail).length)
            wristbend=max(wristbend,(fore.tail-fore.head).angle(hand.tail-hand.head))
        if name=='Walking':
            hips=rig.pose.bones['mixamorig:Hips']
            inv=hips.matrix.to_quaternion().inverted()
            left=rig.pose.bones['mixamorig:LeftForeArm']
            shoulder=rig.pose.bones['mixamorig:LeftArm'].head
            carry_y.append((inv@(left.tail-left.head)).y)
            elbow_offset.append(abs((inv@(left.head-shoulder)).x))
    assert neckgap<1e-5,('Detached head',name,neckgap)
    assert necklengtherror<1e-5,('Stretching neck',name,necklengtherror)
    assert wristgap<1e-5,('Detached wrist',name,wristgap)
    assert wristbend<math.radians(25),('Wrist bend exceeds limit',name,math.degrees(wristbend))
    report[name].update(max_head_neck_gap=neckgap,max_neck_length_error=necklengtherror,max_wrist_gap=wristgap,max_wrist_bend_degrees=math.degrees(wristbend))
    if carry_y:
        assert max(carry_y)<-.025,('Carry forearm points backward',max(carry_y))
        assert max(elbow_offset)<.055,('Carry elbow flares outward',max(elbow_offset))
        report[name].update(max_carry_forearm_y=max(carry_y),max_carry_elbow_lateral_offset=max(elbow_offset))
# The free right arm in Walking: nearly straight, and swinging against the right leg (forward while
# the right foot is back), not with it.
rig.animation_data.action=bpy.data.actions['Walking']
bends=[];pairs=[]
for frame in range(1,34):
    bpy.context.scene.frame_set(frame)
    u=rig.pose.bones['mixamorig:RightArm'];fo=rig.pose.bones['mixamorig:RightForeArm']
    bends.append(math.degrees((u.tail-u.head).angle(fo.tail-fo.head)))
    hips=rig.pose.bones['mixamorig:Hips'].head
    pairs.append((fo.tail.y-u.head.y,rig.pose.bones['mixamorig:RightFoot'].head.y-hips.y))
assert max(bends)<35,('Free arm too bent',max(bends))
corr=sum(a*b for a,b in pairs)
assert corr<0,('Free arm swings with the same-side leg',corr)
report['free_arm']={'max_elbow_bend_degrees':max(bends),'hand_leg_swing_product':corr}
with open(root/'soldier-animated.glb','rb') as f:
    f.read(12);n,t=struct.unpack('<II',f.read(8));g=json.loads(f.read(n))
assert {a['name'] for a in g['animations']}>={'Walking','Running','MakeReady','Present','Aim','Fire','Reload','GuardReady','BayonetGuard','BayonetThrust','ButtStroke'}
assert len(g['skins'])==1 and len(g['images'])==1
assert 'GunControl' in {n.get('name') for n in g['nodes']}
(root/'validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
print('PASS: endpoints, finite skin deformation, rigid weapon, moving shoulder carry, free arm straight and swinging against the leg, exported clips and texture.')

# Walking: each stance foot moves back at one constant speed, the game's ordinary pace at the figure
# scale (gaits.json from build.py), so a root moving at that speed keeps it planted.
gaits=json.loads((root/'gaits.json').read_text())
rig.animation_data.action=bpy.data.actions['Walking']
wk={}
for frame in range(1,34):
    bpy.context.scene.frame_set(frame)
    wk[frame]={s:rig.pose.bones['mixamorig:'+s+'Foot'].head.copy() for s in ['Left','Right']}
wsp=[]
for side,first in [('Right',1),('Left',17)]:   # each foot's stance half
    for f in range(first,first+15):
        a=wk[f][side];b=wk[f+1][side]
        if abs(a.z-b.z)<1e-6 and a.z<.0695:wsp.append((b.y-a.y)*24)
assert len(wsp)>=20,('too few stance frames',len(wsp))
assert max(wsp)-min(wsp)<1e-3,('Walking stance foot speed not constant: foot slides',min(wsp),max(wsp))
assert abs(sum(wsp)/len(wsp)-gaits['walk_speed'])<1e-3,('Walking speed differs from the stated one',sum(wsp)/len(wsp),gaits['walk_speed'])
report['walking']={'root_speed_model_units_per_second':sum(wsp)/len(wsp),'metres_per_second':sum(wsp)/len(wsp)*gaits['m_per_unit'],'stance_speed_spread':max(wsp)-min(wsp)}
print('PASS walking:',report['walking'])

# Running: stance feet stay on the ground and travel backward at one constant speed (no foot slide
# once the game moves the root at that speed); both feet leave the ground in each flight phase.
rig.animation_data.action=bpy.data.actions['Running']
ankles={}
for frame in range(1,18):
    bpy.context.scene.frame_set(frame)
    ankles[frame]={s:rig.pose.bones['mixamorig:'+s+'Foot'].head.copy() for s in ['Left','Right']}
speeds=[];stance_z=[]
for side,first in [('Left',1),('Right',9)]:
    for f in range(first,first+5):
        a=ankles[(f-1)%16+1][side];b=ankles[f%16+1][side]
        speeds.append(b.y-a.y);stance_z.append(a.z)
assert max(speeds)-min(speeds)<1e-3,('Stance foot speed not constant: foot slides',speeds)
assert max(abs(z-.069) for z in stance_z)<1e-3,('Stance foot off the ground',stance_z)
flight=[f for f in range(1,17) if min(ankles[f][s].z for s in ['Left','Right'])>.0715]
assert len(flight)>=2,('No flight phase',flight)
assert abs(sum(speeds)/len(speeds)*24-gaits['run_speed'])<2e-3,('Running speed differs from the stated one',sum(speeds)/len(speeds)*24)
report['running']={'root_speed_model_units_per_second':sum(speeds)/len(speeds)*24,'metres_per_second':sum(speeds)/len(speeds)*24*gaits['m_per_unit'],'stance_speed_spread':max(speeds)-min(speeds),'flight_frames':flight}
(root/'validation.json').write_text(json.dumps(report,indent=2))
print('PASS running:',report['running'])
