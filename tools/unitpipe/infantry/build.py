"""Rebuild every clip of the French line infantryman from the preserved Tripo import: the v7 clips
(pose functions below) plus the firing drill and bayonet fighting (drill.py)."""
import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy, math, json, sys
from types import SimpleNamespace
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
ROOT=paths.work('infantry')
CODE=Path(__file__).resolve().parent
sys.path.insert(0,str(CODE))
from render_setup import setup
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'source-inspected.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
rig.animation_data_clear()
prefix='mixamorig:'
def bone(n):return rig.pose.bones[prefix+n]
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
components=json.loads((ROOT/'components.json').read_text())
gunids=[]; packids=[]
for c in components:
    if c['max'][1]<-.09 and c['min'][0]<-.045:
        gunids+=c['ids']
    if c['min'][1]>.055 and c['min'][2]>.55:
        packids+=c['ids']
assert len(gunids)>300, 'Weapon component selection failed'
bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
grip=Vector((-.1355,-.0914,.5732))
control=rig.data.edit_bones.new('GunControl')
control.head=grip;control.tail=grip+Vector((0,0,.12));control.use_deform=False
control.parent=rig.data.edit_bones[prefix+'Spine2']
eb=rig.data.edit_bones.new('Musket')
eb.head=grip; eb.tail=grip+Vector((0,0,.15)); eb.use_deform=True
eb.parent=control
ANCHORS={'StockContact':(-.045,-.120,.025),'TriggerGrip':(-.067,-.127,.150),
         'ForeGrip':(-.112,-.132,.310),'BarrelMuzzle':(-.138,-.128,.772),
         'CarryGrip':(-.040,-.120,.065)}
ANCHORS.update(BayonetForeGrip=(-.112,-.132,.335),BayonetTip=(-.150,-.146,.970))
# Port-arms support hand: on the forestock, 0.27 up the barrel from the trigger grip.
ANCHORS.update(PortGrip=(-.118,-.131,.420))
for name,point in ANCHORS.items():
    b=rig.data.edit_bones.new(name);b.head=point;b.tail=Vector(point)+Vector((0,0,.035))
    b.parent=eb;b.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
gun=rig.pose.bones['GunControl']; gun.rotation_mode='QUATERNION'
def rigid_weights(ids,name):
    for vg in mesh.vertex_groups:vg.remove(ids)
    vg=mesh.vertex_groups.get(name) or mesh.vertex_groups.new(name=name)
    vg.add(ids,1.0,'REPLACE')
rigid_weights(gunids,'Musket')
rigid_weights(packids,prefix+'Spine2')
coatids=[]
for idx in components[0]['ids']:
    v=mesh.data.vertices[idx]
    armweight=sum(g.weight for g in v.groups if any(s in mesh.vertex_groups[g.group].name for s in ['Arm','Hand','Shoulder']))
    if .30<v.co.z<.55 and (abs(v.co.x)<.11 or v.co.z<.425) and armweight>.03:coatids.append(idx)
rigid_weights(coatids,prefix+'Hips')
for idx in components[0]['ids']:
    v=mesh.data.vertices[idx]
    for g in list(v.groups):
        name=mesh.vertex_groups[g.group].name
        if 'Hand' in name and any(d in name for d in ['Thumb','Index','Middle','Ring','Pinky']):
            w=g.weight
            mesh.vertex_groups[g.group].remove([idx])
            side='Left' if 'Left' in name else 'Right'
            mesh.vertex_groups[prefix+side+'ForeArm'].add([idx],w,'ADD')
rigid_weights(components[13]['ids'],prefix+'Hips')
print('REPAIRED',len(coatids),'lower coat vertices incorrectly following arms')
import drill
drill.setup(SimpleNamespace(rig=rig,mesh=mesh,ANCHORS=ANCHORS,grip=grip,components=components))
rest['Musket']=rig.data.bones['Musket'].matrix_local.copy()
rest['GunControl']=rig.data.bones['GunControl'].matrix_local.copy()
for p in rig.pose.bones:p.rotation_mode='QUATERNION'

def reset():
    for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
def place(n,head,tail):
    p=bone(n); b=p.bone
    q=(b.tail_local-b.head_local).rotation_difference(Vector(tail)-Vector(head))
    p.matrix=Matrix.Translation(Vector(head)) @ q.to_matrix().to_4x4() @ b.matrix_local.to_3x3().to_4x4()
    bpy.context.view_layer.update()
def limb(side,kind,start,end,pole):
    names=[side+'UpLeg',side+'Leg'] if kind=='leg' else [side+'Arm',side+'ForeArm']
    a=bone(names[0]).bone; b=bone(names[1]).bone
    l1=(a.tail_local-a.head_local).length; l2=(b.tail_local-b.head_local).length
    start=Vector(start); end=Vector(end); direction=end-start
    assert direction.length < l1+l2-.00001, (side,kind,'unreachable grip',direction.length,l1+l2)
    d=direction.length; direction.normalize()
    end=start+direction*d
    plane=Vector(pole)-start; plane-=direction*plane.dot(direction);plane.normalize()
    along=(l1*l1-l2*l2+d*d)/(2*d)
    knee=start+direction*along+plane*math.sqrt(max(0,l1*l1-along*along))
    place(names[0],start,knee);place(names[1],knee,end)
    return end
def hand(side,point,orientation=None):
    p=bone(side+'Hand')
    rot=orientation or p.bone.matrix_local.to_3x3().to_4x4()
    p.matrix=Matrix.Translation(point)@rot
    bpy.context.view_layer.update()
def gun_pose(location,q):
    gun.matrix=Matrix.Translation(location)@q.to_matrix().to_4x4()@rest['GunControl'].to_3x3().to_4x4()
    bpy.context.view_layer.update()
# Game scale and gaits. The figure is 1 unit tall with its shako; its hip (0.494) is a soldier's
# 0.90 m, so 1 unit is about 1.82 m and the whole figure about 1.8 m (docs/proposals/engine-design.md).
# Walking matches the ruleset's ordinary pace (0.9 m/s), the runs the soldier layer's RUN (3.2 m/s).
M_PER_UNIT=.90/.494
WALK_N=32;WALK_HALF=.165;WALK_LIFT=.045         # 90 steps a minute of 0.6 m
WALK_SPEED=2*WALK_HALF/(WALK_N/2)*24            # 0.495 units/s = 0.9 m/s
RUN_SPEED=3.2/M_PER_UNIT                        # 1.76 units/s
FOOT_X={'Left':.085,'Right':-.065}
BALL_Z=bone('LeftToeBase').bone.head_local.z   # the ball of the foot never goes below this
def walk_feet(t,half=WALK_HALF,lift=WALK_LIFT,backward=False):
    """Speed-locked walking feet at cycle position t (0..1): each foot stands for exactly half the
    cycle, moving back at constant speed (so a root moving at 2*half per half cycle keeps it planted),
    and swings for the other half. t=0 is the exchange: left foot back, right foot front, both down."""
    feet={}
    for side,u0 in (('Left',0.),('Right',.5)):
        u=(t+u0)%1;s=(u%.5)/.5
        if (u<.5)!=backward:   # swinging
            e=s*s*(3-2*s)
            y=half-2*half*e if not backward else -half+2*half*e
            pitch=.35*math.sin(math.pi*s)*(1-s) if not backward else .30*math.sin(math.pi*s)*s
            feet[side]=(Vector((FOOT_X[side],y,.069+lift*math.sin(math.pi*s))),0,pitch)
        else:
            y=-half+2*half*s if not backward else half-2*half*s
            feet[side]=(Vector((FOOT_X[side],y,.069)),0,0)
    return feet
def foot_ik(side,pos,fyaw,pitch,knee_pole=None):
    """Leg to an ankle target with a foot yaw and pitch (+ = toes down); the ball of the foot never
    goes below its rest height; the knee points at knee_pole (default: the way the foot points)."""
    pos=Vector(pos);start=bone(side+'UpLeg').head.copy()
    a=bone(side+'UpLeg').bone.length;b=bone(side+'Leg').bone.length
    direction=Quaternion((0,0,1),fyaw)@Quaternion((1,0,0),pitch)@Vector((0,-.080,-.05))
    ball=pos.z+direction.normalized().z*bone(side+'Foot').bone.length
    if ball<BALL_Z:pos.z+=BALL_Z-ball
    reach=pos-start
    if reach.length>.995*(a+b):pos=start+reach.normalized()*.995*(a+b)
    pole=Vector(knee_pole) if knee_pole is not None else Vector((pos.x,0,.3))+Quaternion((0,0,1),fyaw)@Vector((0,-1,0))
    limb(side,'leg',start,pos,pole)
    place(side+'Foot',pos,pos+direction)
    toe=bone(side+'ToeBase').head.copy()
    tilt=.6*max(0,pitch) if toe.z>.04 else 0
    place(side+'ToeBase',toe,toe+Quaternion((0,0,1),fyaw)@Quaternion((1,0,0),tilt)@Vector((0,-.055,0)))
def legs(phase=None,aim=0,recoil=0):
    hips=bone('Hips')
    bob=-.015 if phase is None else -.012-.008*(1-math.cos(2*phase))
    yaw=-.48*aim if phase is None else .075*math.cos(phase)
    hips.matrix=Matrix.Translation(hips.bone.head_local+Vector((0,recoil*.015,bob)))@Quaternion((0,0,1),yaw).to_matrix().to_4x4()@hips.bone.matrix_local.to_3x3().to_4x4()
    spine=bone('Spine2');rq=spine.bone.matrix_local.to_quaternion()
    spine.rotation_quaternion=rq.inverted()@Quaternion((1,0,0),.045*aim-recoil*.06)@rq
    bpy.context.view_layer.update()
    if phase is not None:   # walking: the speed-locked gait
        for side,(pos,fyaw,pitch) in walk_feet((phase/(2*math.pi))%1).items():foot_ik(side,pos,fyaw,pitch)
        return
    for side,x in [('Left',.085),('Right',-.065)]:
        ph=phase+(0 if side=='Left' else math.pi) if phase is not None else 0
        y= .095*math.cos(ph) if phase is not None else (-.10*aim if side=='Left' else .07*aim)
        lift=.045*max(0,math.sin(ph)) if phase is not None else 0
        foot=Vector((x,y,.069+lift))
        start=bone(side+'UpLeg').head.copy()
        limb(side,'leg',start,foot,(x,-1,.3))
        place(side+'Foot',foot,foot+Vector((0,-.080,-.05)))
        toe=bone(side+'ToeBase'); toehead=toe.head.copy()
        place(side+'ToeBase',toehead,toehead+Vector((0,-.055,0)))
def anchor_pose(anchor,target,q):
    origin=Vector(target)-q@(Vector(ANCHORS[anchor])-grip)
    gun_pose(origin,q)
    return lambda name:origin+q@(Vector(ANCHORS[name])-grip)
def wrist_orientation(side,palm_normal):
    fore=bone(side+'ForeArm'); hb=bone(side+'Hand').bone
    rel=fore.bone.matrix_local.to_quaternion().inverted()@hb.matrix_local.to_quaternion()
    neutral=fore.matrix.to_quaternion()@rel
    axis=neutral@Vector((0,1,0))
    source_normal=Vector((-1,0,0) if side=='Left' else (1,0,0))
    local_normal=hb.matrix_local.to_quaternion().inverted()@source_normal
    normal=neutral@local_normal;normal-=axis*normal.dot(axis);normal.normalize()
    desired=Vector(palm_normal);desired-=axis*desired.dot(axis)
    if desired.length<.001:return neutral,0
    desired.normalize()
    twist=math.atan2(axis.dot(normal.cross(desired)),normal.dot(desired))
    return Quaternion(axis,twist)@neutral,twist
def grip_hand(side,point,palm_normal,pole,initial_rotation=None):
    hb=bone(side+'Hand').bone
    contact=Vector((-.012,-.012,-.025) if side=='Left' else (.010,-.025,-.008))
    local_contact=hb.matrix_local.to_quaternion().inverted()@contact
    wrist=Vector(point)-(initial_rotation@local_contact if initial_rotation is not None else contact)
    # Solve contact and wrist orientation together; the hand follows the forearm's axis.
    for _ in range(16):
        limb(side,'arm',bone(side+'Arm').head,wrist,pole)
        rotation,twist=wrist_orientation(side,palm_normal)
        new_wrist=Vector(point)-rotation@local_contact
        if (new_wrist-wrist).length<1e-7:break
        wrist=new_wrist
    limb(side,'arm',bone(side+'Arm').head,wrist,pole)
    rotation,twist=wrist_orientation(side,palm_normal)
    fore=bone(side+'ForeArm');fm=fore.matrix.copy()
    # Share pronation through the forearm instead of putting the full roll in the wrist.
    axis=(fore.tail-fore.head).normalized()
    fore.matrix=Matrix.Translation(fore.head)@Quaternion(axis,twist*.75).to_matrix().to_4x4()@fm.to_3x3().to_4x4()
    bpy.context.view_layer.update()
    hand(side,bone(side+'ForeArm').tail.copy(),rotation.to_matrix().to_4x4())
def relaxed_hand(side):
    fore=bone(side+'ForeArm');hb=bone(side+'Hand').bone
    rel=fore.bone.matrix_local.to_quaternion().inverted()@hb.matrix_local.to_quaternion()
    hand(side,fore.tail.copy(),(fore.matrix.to_quaternion()@rel).to_matrix().to_4x4())
def left_palm(point,q,aim=0,offset=None):
    normal=Vector((-1,0,.12)).lerp(Vector((0,0,1)),aim)
    pole=Vector((.105,.18,.56)).lerp(Vector((.22,-.10,.50)),aim)
    if offset is not None:pole+=offset
    grip_hand('Left',point,normal,pole)
    for digit in ['Index','Middle','Ring','Pinky']:
        for seg in [1,2,3]:
            p=bone('LeftHand'+digit+str(seg))
            axis=p.bone.matrix_local.to_quaternion().inverted()@Vector((0,1,0))
            p.rotation_quaternion=Quaternion(axis,.95 if seg<3 else .65)
# The free arm hangs from the shoulder, nearly straight (elbow about 25 degrees), a little out from
# the coat, and swings about the shoulder: theta > 0 swings the hand back. Defined in the body's
# facing (hips and chest yaw), not in world space, so it hangs the same whatever the body does.
HANG_REACH=.977;ARM_SWING=.28   # reach as a fraction of the arm's length (elbow about 25 degrees)
def hang_target(side,theta):
    sh=bone(side+'Arm').head.copy()
    reach=HANG_REACH*(bone(side+'Arm').bone.length+bone(side+'ForeArm').bone.length)
    c=bone('Spine2');fwd=(c.matrix@c.bone.matrix_local.inverted()).to_quaternion()@Vector((0,-1,0))
    yq=Quaternion((0,0,1),math.atan2(fwd.x,-fwd.y))
    sx=-1 if side=='Right' else 1
    d=Quaternion((1,0,0),theta)@Vector((sx*.12,0,-1)).normalized()
    return sh+yq@(d*reach),sh+yq@Vector((sx*.06,.30,-.12))
def hang_arm(side,theta):
    target,pole=hang_target(side,theta)
    limb(side,'arm',bone(side+'Arm').head,target,pole);relaxed_hand(side)
def carry(phase=0):
    # Napoleonic shoulder-arms: butt supported at the hip, barrel against the left shoulder.
    yaw=.075*math.cos(phase);bob=-.012-.008*(1-math.cos(2*phase))
    q=Quaternion((0,0,1),yaw)@Quaternion((1,0,0),-.28+.035*math.sin(phase))@Quaternion((0,1,0),-.075+.025*math.cos(phase))
    target=Vector((.155,-.075,.535+bob))
    target=Quaternion((0,0,1),yaw)@target
    points=anchor_pose('CarryGrip',target,q)
    left_palm(points('CarryGrip'),q)
    # the free right arm swings against the right leg (back while the right foot is forward)
    hang_arm('Right',ARM_SWING*math.cos(phase))
def shooting(aim,recoil,offset=None):
    body_relative=offset is not None
    offset=Vector((0,0,0)) if offset is None else Vector(offset)
    carry_q=Quaternion((1,0,0),-.28)@Quaternion((0,1,0),-.05)
    firing_q=Quaternion((0,0,1),.20)@Quaternion((1,0,0),math.pi/2-.018-recoil*.035)@Quaternion((0,0,1),-math.pi/2)
    q=carry_q.slerp(firing_q,aim)
    # Butt plate sits on the upper right shoulder, not in front of the chest.
    shoulder=bone('RightArm').head+Vector((.015,-.006,.008))
    carry_origin=Vector((.155,-.075,.523))+offset-carry_q@(Vector(ANCHORS['CarryGrip'])-grip)
    fire_origin=shoulder-firing_q@(Vector(ANCHORS['StockContact'])-grip)
    carry_support=carry_origin+carry_q@(Vector(ANCHORS['CarryGrip'])-grip)
    fire_support=fire_origin+firing_q@(Vector(ANCHORS['ForeGrip'])-grip)
    support=carry_support.lerp(fire_support,aim)+Vector((0,0,.04*math.sin(math.pi*aim)))
    support_anchor=Vector(ANCHORS['CarryGrip']).lerp(Vector(ANCHORS['ForeGrip']),aim)
    origin=support-q@(support_anchor-grip)
    gun_pose(origin,q)
    points=lambda name:origin+q@(Vector(ANCHORS[name])-grip)
    # The wrists are offset from the contact points by the actual source hand geometry.
    rest_right=Vector((-.16,-.075,.48))
    ready_pole=Vector((-.17,-.15,.56))
    if body_relative:
        pivot=bone('Hips').bone.head_local
        bodyq=bone('Hips').matrix.to_quaternion()@bone('Hips').bone.matrix_local.to_quaternion().inverted()
        rest_right=pivot+bodyq@(rest_right-pivot)
        ready_pole=pivot+bodyq@(ready_pole-pivot)
    rest_right+=offset
    # The free hand approaches the trigger along a smooth path before the full grip.
    free_contact=rest_right+Vector((.010,-.025,-.008))
    contact=free_contact.lerp(points('TriggerGrip'),aim)
    pole=ready_pole.lerp(Vector((-.29,-.02,.65)),aim)
    pole+=offset
    grip_hand('Right',contact,(1,0,0),pole)
    left_palm(support,q,aim,offset)
    neck=bone('Neck');neckhead=neck.head.copy()
    headpoint=neck.tail.copy().lerp(Vector((-.035,-.030,.800))+offset,aim)
    neutral=(neck.tail-neckhead).normalized()
    turn=neutral.rotation_difference((headpoint-neckhead).normalized())
    if turn.angle>.35:turn=Quaternion().slerp(turn,.35/turn.angle)
    direction=turn@neutral
    neck.matrix=Matrix.Translation(neckhead)@Quaternion(direction,.24*aim).to_matrix().to_4x4()@turn.to_matrix().to_4x4()@neck.matrix.to_3x3().to_4x4()
    bpy.context.view_layer.update()
    headpoint=neck.tail.copy()
    head=bone('Head')
    headq=Quaternion((0,0,1),.20*aim)@Quaternion((1,0,0),.24*aim)@Quaternion((0,1,0),-.18*aim)
    head.matrix=Matrix.Translation(headpoint)@headq.to_matrix().to_4x4()@head.bone.matrix_local.to_3x3().to_4x4()
    head.location=(0,0,0)
    bpy.context.view_layer.update()
last_quaternions={}
def key(frame):
    for p in rig.pose.bones:
        if p.name in last_quaternions and p.rotation_quaternion.dot(last_quaternions[p.name])<0:
            p.rotation_quaternion.negate()
        last_quaternions[p.name]=p.rotation_quaternion.copy()
        p.keyframe_insert('location',frame=frame,group=p.name)
        p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
        p.keyframe_insert('scale',frame=frame,group=p.name)
def action(name,frames,fn):
    last_quaternions.clear()
    rig.animation_data_create(); rig.animation_data.action=None
    for f in range(1,frames+1):
        reset()
        try:fn(f)
        except AssertionError as e:raise AssertionError((name,f,str(e))) from e
        key(f)
    a=rig.animation_data.action;a.name=name;a.use_fake_user=True
    return a
walk=action('Walking',WALK_N+1,lambda f:(legs((f-1)*2*math.pi/WALK_N),carry((f-1)*2*math.pi/WALK_N)))
def shoot_fn(f):
    if f<=17: a=(f-1)/16
    elif f<=39:a=1
    elif f<=55:a=1-(f-39)/16
    else:a=0
    a=a*a*(3-2*a)
    r=math.exp(-(f-30)/2.8) if 30<=f<=45 else 0
    legs(aim=a,recoil=r);shooting(a,r)
# Shooting, KneelDown, KneelingShooting, BayonetAttack, BayonetReady (Codex v6) are superseded and
# no longer built; they are kept in archive/v7 and archive/v8.
def smooth(x):
    x=max(0,min(1,x));return x*x*(3-2*x)
def kneeling_legs(amount=1,recoil=0):
    hips=bone('Hips');offset=Vector((0,.025*amount,-.257*amount))
    translation=offset+Vector((0,recoil*.010,-.015))
    hips.matrix=Matrix.Translation(hips.bone.head_local+translation)@Quaternion((0,0,1),-.48*amount).to_matrix().to_4x4()@hips.bone.matrix_local.to_3x3().to_4x4()
    spine=bone('Spine2');rq=spine.bone.matrix_local.to_quaternion()
    spine.rotation_quaternion=rq.inverted()@Quaternion((1,0,0),.035*amount-recoil*.045)@rq
    bpy.context.view_layer.update()
    for side,x,y,z in [('Left',.085,-.220*amount,.069),('Right',-.065,.310*amount,.069+.046*amount)]:
        foot=Vector((x,y,z))
        pole=(x,-1,.3) if side=='Left' else (x,-.2,-.5)
        limb(side,'leg',bone(side+'UpLeg').head,foot,pole)
        direction=Vector((0,-.08,-.05)).lerp(Vector((0,-.025,-.092)),amount if side=='Right' else 0)
        place(side+'Foot',foot,foot+direction)
        toehead=bone(side+'ToeBase').head.copy()
        place(side+'ToeBase',toehead,toehead+Vector((0,-.055,0)))
    return offset
def kneel_down_fn(f):
    amount=smooth((f-1)/24)
    shooting(0,0,kneeling_legs(amount))

def kneeling_shoot_fn(f):
    if f<=17:a=smooth((f-1)/16)
    elif f<=39:a=1
    elif f<=55:a=1-smooth((f-39)/16)
    else:a=0
    recoil=math.exp(-(f-30)/2.8) if 30<=f<=45 else 0
    shooting(a,recoil,kneeling_legs(1,recoil))

def bayonet_fn(f):
    # Anticipation, a quick leg-driven thrust, then a slower return to guard.
    if f<=9:thrust=-.18*smooth((f-1)/8)
    elif f<=17:thrust=-.18+1.18*smooth((f-9)/8)
    elif f<=21:thrust=1
    elif f<=41:thrust=1-smooth((f-21)/20)
    else:thrust=0
    advance=max(0,thrust)
    hips=bone('Hips');offset=Vector((0,-.090*thrust,-.030-.025*advance))
    hips.matrix=Matrix.Translation(hips.bone.head_local+offset)@Quaternion((0,0,1),-.65+.22*thrust).to_matrix().to_4x4()@hips.bone.matrix_local.to_3x3().to_4x4()
    spine=bone('Spine2');rq=spine.bone.matrix_local.to_quaternion()
    spine.rotation_quaternion=rq.inverted()@Quaternion((1,0,0),.025+.16*advance)@rq
    bpy.context.view_layer.update()
    for side,x,y in [('Left',.085,-.160-.095*advance),('Right',-.065,.140)]:
        lift=.025*math.sin(math.pi*advance) if side=='Left' else .012*advance
        foot=Vector((x,y,.069+lift))
        limb(side,'leg',bone(side+'UpLeg').head,foot,(x,-1,.3))
        footdir=Vector((0,-.08,-.05)).lerp(Vector((0,-.075,-.065)),advance if side=='Right' else 0)
        place(side+'Foot',foot,foot+footdir)
        toehead=bone(side+'ToeBase').head.copy();place(side+'ToeBase',toehead,toehead+Vector((0,-.055,0)))
    q=Quaternion((0,0,1),.25)@Quaternion((1,0,0),math.pi/2+.035)@Quaternion((0,0,1),-math.pi/2)
    forward=q@Vector((0,0,1))
    stock=bone('RightArm').head+Vector((-.055,.035,-.125))+forward*(.025*thrust)
    points=anchor_pose('StockContact',stock,q)
    grip_hand('Right',points('TriggerGrip'),(1,0,0),Vector((-.25,.08,.54))+offset)
    grip_hand('Left',points('BayonetForeGrip'),(0,0,1),Vector((.22,-.10,.50))+offset)
    for digit in ['Index','Middle','Ring','Pinky']:
        for seg in [1,2,3]:
            p=bone('LeftHand'+digit+str(seg));axis=p.bone.matrix_local.to_quaternion().inverted()@Vector((0,1,0))
            p.rotation_quaternion=Quaternion(axis,.95 if seg<3 else .65)
    neck=bone('Neck');axis=(neck.tail-neck.head).normalized()
    neck.matrix=Matrix.Translation(neck.head)@Quaternion(axis,.30).to_matrix().to_4x4()@neck.matrix.to_3x3().to_4x4()
    bpy.context.view_layer.update()
    head=bone('Head')
    head.matrix=Matrix.Translation(neck.tail)@Quaternion((0,0,1),.10).to_matrix().to_4x4()@Quaternion((1,0,0),.04).to_matrix().to_4x4()@head.bone.matrix_local.to_3x3().to_4x4()
    head.location=(0,0,0)
    bpy.context.view_layer.update()

def capture(fn):
    reset();fn();bpy.context.view_layer.update()
    return {p.name:p.matrix_basis.copy() for p in rig.pose.bones},gun.matrix.copy(),{s:bone(s+'ForeArm').head.copy() for s in ['Left','Right']}
start_pose,start_gun,start_elbows=capture(lambda:(legs(0),carry(0)))
def make_transition(name,frames,end_fn,end_anchor):
    end_pose,end_gun,end_elbows=capture(end_fn)
    end_feet={s:(bone(s+'Foot').head.copy(),(bone(s+'Foot').tail-bone(s+'Foot').head).normalized()) for s in ['Left','Right']}
    reset();legs(0);carry(0)
    start_feet={s:(bone(s+'Foot').head.copy(),(bone(s+'Foot').tail-bone(s+'Foot').head).normalized()) for s in ['Left','Right']}
    def pose(f):
        t=smooth((f-1)/(frames-1))
        if t==0:
            for p in rig.pose.bones:p.matrix_basis=start_pose[p.name]
            bpy.context.view_layer.update();return
        if t==1:
            for p in rig.pose.bones:p.matrix_basis=end_pose[p.name]
            bpy.context.view_layer.update();return
        # Blend body rotations without scaling joints. Re-solve both arms to the moving weapon.
        for p in rig.pose.bones:
            la,qa,sa=start_pose[p.name].decompose();lb,qb,sb=end_pose[p.name].decompose()
            p.matrix_basis=Matrix.LocRotScale(la.lerp(lb,t),qa.slerp(qb,t),sa.lerp(sb,t))
        bpy.context.view_layer.update()
        for side in ['Left','Right']:
            a,da=start_feet[side];b,db=end_feet[side]
            step=smooth(t/.45) if side=='Left' else smooth((t-.45)/.55)
            foot=a.lerp(b,step)+Vector((0,0,.035*math.sin(math.pi*step)))
            pole=Vector((foot.x,-1,.3))
            if name=='KneelDown' and side=='Right':pole=pole.lerp(Vector((foot.x,-.2,-.5)),t)
            limb(side,'leg',bone(side+'UpLeg').head,foot,pole)
            place(side+'Foot',foot,foot+da.lerp(db,step))
            toehead=bone(side+'ToeBase').head.copy();place(side+'ToeBase',toehead,toehead+Vector((0,-.055,0)))
        q0=start_gun.to_quaternion()@rest['GunControl'].to_quaternion().inverted()
        q1=end_gun.to_quaternion()@rest['GunControl'].to_quaternion().inverted()
        q=q0.slerp(q1,t)
        a0=Vector(ANCHORS['CarryGrip']);a1=Vector(ANCHORS[end_anchor])
        support0=start_gun@rest['GunControl'].inverted()@a0
        support1=end_gun@rest['GunControl'].inverted()@a1
        support=support0.lerp(support1,t)+Vector((0,-.025*math.sin(math.pi*t),.025*math.sin(math.pi*t)))
        origin=support-q@(a0.lerp(a1,t)-grip)
        gun_pose(origin,q)
        grip_hand('Left',support,Vector((-1,0,.12)).lerp(Vector((0,0,1)) if end_anchor=='BayonetForeGrip' else Vector((-1,0,.12)),t),start_elbows['Left'].lerp(end_elbows['Left'],t))
        if end_anchor=='CarryGrip':
            relaxed_hand('Right');return
        hb=bone('RightHand').bone
        contact=Vector((.010,-.025,-.008))
        # Free marching hand acquires the trigger during bayonet preparation.
        def hand_contact(basis):
            for p in rig.pose.bones:p.matrix_basis=basis[p.name]
            bpy.context.view_layer.update()
            return bone('RightHand').matrix@hb.matrix_local.inverted()@(hb.head_local+contact)
        saved={p.name:p.matrix_basis.copy() for p in rig.pose.bones}
        c0=hand_contact(start_pose);c1=hand_contact(end_pose)
        for p in rig.pose.bones:p.matrix_basis=saved[p.name]
        bpy.context.view_layer.update()
        target=c0.lerp(c1,t)+Vector((0,0,.065*math.sin(math.pi*t)))
        if end_anchor=='BayonetForeGrip':
            trigger=origin+q@(Vector(ANCHORS['TriggerGrip'])-grip)
            acquire=smooth(min(1,t/.65));target=target.lerp(trigger,acquire)
        grip_hand('Right',target,(1,0,0),start_elbows['Right'].lerp(end_elbows['Right'],t),bone('RightHand').matrix.to_quaternion())
    return action(name,frames,pose)

# Running: an in-place jog at port arms (musket diagonal across the chest, both hands on it).
# One 16-frame cycle at 24 fps is two steps (0.667 s). Left-leg table below; the right leg is the
# same table half a cycle later. Ankle (y, z) relative to the rest ground; -y is forward.
# Stance is frames 0-4 at 0.05 per frame (push-off at 5), so the game moves the root at 1.2 m/s (model scale).
RUN_FRAMES=16
RUN_FOOT=[(-.120,.069),(-.070,.069),(-.020,.069),(.030,.069),(.080,.069),(.130,.076),
          (.180,.110),(.210,.170),(.180,.220),(.100,.250),(.010,.250),(-.070,.220),
          (-.130,.170),(-.160,.120),(-.150,.085),(-.135,.072)]
# The table was authored at 1.2 units/s (0.05 a frame in stance); stretched along the run to RUN_SPEED.
RUN_FOOT=[(y*RUN_SPEED/1.2,z) for y,z in RUN_FOOT]
# Foot pitch (positive: toe down): heel strike, flat stance, toe-off, plantar flex in swing, reach.
RUN_PITCH=[-.15,0,0,0,0,.45,.70,.80,.70,.50,.30,.10,-.05,-.15,-.20,-.18]
RUN_LEAN=.17;RUN_CHEST_LEAN=.07
def run_fn(f):
    k=(f-1)%RUN_FRAMES;phase=2*math.pi*k/RUN_FRAMES
    # Lowest at each mid-stance (frames 2 and 10), highest in flight.
    bob=-.035-.015*math.cos(2*math.pi*(k-2)/8)
    yaw=-.09*math.cos(phase)
    hips=bone('Hips')
    hips.matrix=Matrix.Translation(hips.bone.head_local+Vector((0,-.015,bob)))@Quaternion((0,0,1),yaw).to_matrix().to_4x4()@Quaternion((1,0,0),RUN_LEAN).to_matrix().to_4x4()@hips.bone.matrix_local.to_3x3().to_4x4()
    # Chest counter-rotates most of the pelvis turn so the two-handed musket stays steady.
    spine=bone('Spine2');rq=spine.bone.matrix_local.to_quaternion()
    spine.rotation_quaternion=rq.inverted()@Quaternion((0,0,1),-.8*yaw)@Quaternion((1,0,0),RUN_CHEST_LEAN)@rq
    bpy.context.view_layer.update()
    for side,x,offset in [('Left',.075,0),('Right',-.055,RUN_FRAMES//2)]:
        i=(k+offset)%RUN_FRAMES;y,z=RUN_FOOT[i];pitch=RUN_PITCH[i]
        start=bone(side+'UpLeg').head.copy();foot=Vector((x,y,z))
        a=bone(side+'UpLeg').bone.length;b=bone(side+'Leg').bone.length
        # Push-off pivots on the ball of the foot: lift the ankle so the ball never sinks below its rest height.
        direction=Quaternion((1,0,0),pitch)@Vector((0,-.080,-.05))
        ball=foot.z+direction.normalized().z*bone(side+'Foot').bone.length
        if ball<BALL_Z:foot.z+=BALL_Z-ball
        reach=foot-start
        if reach.length>.995*(a+b):foot=start+reach.normalized()*.995*(a+b)
        limb(side,'leg',start,foot,(x,-1,.3))
        place(side+'Foot',foot,foot+direction)
        toehead=bone(side+'ToeBase').head.copy()
        # Toes stay flat while the ball is near the ground, then follow the foot partway.
        place(side+'ToeBase',toehead,toehead+Quaternion((1,0,0),.6*max(0,pitch) if toehead.z>.04 else 0)@Vector((0,-.055,0)))
    # Port arms in the chest's rest frame, carried by the posed chest: trigger hand at the right
    # belly, barrel up across the body past the left shoulder, with a small lagging bounce.
    chest=bone('Spine2');D=chest.matrix@chest.bone.matrix_local.inverted()
    axis=(Vector(ANCHORS['BarrelMuzzle'])-Vector(ANCHORS['StockContact'])).normalized()
    q_rest=axis.rotation_difference(Vector((.70,-.18,.66)).normalized())
    q=D.to_quaternion()@Quaternion((0,1,0),.035*math.sin(2*phase-.6))@q_rest
    points=anchor_pose('TriggerGrip',D@Vector((-.070,-.135,.560)),q)
    grip_hand('Right',points('TriggerGrip'),(1,0,0),D@Vector((-.30,.08,.50)))
    grip_hand('Left',points('PortGrip'),D.to_quaternion()@Vector((0,.8,.3)),D@Vector((.28,-.05,.55)))
    for digit in ['Index','Middle','Ring','Pinky']:
        for seg in [1,2,3]:
            p=bone('LeftHand'+digit+str(seg));fa=p.bone.matrix_local.to_quaternion().inverted()@Vector((0,1,0))
            p.rotation_quaternion=Quaternion(fa,.95 if seg<3 else .65)
    # The head stays level and looks ahead despite the lean.
    neck=bone('Neck');head=bone('Head')
    head.matrix=Matrix.Translation(neck.tail)@Quaternion((0,0,1),.5*yaw*.2).to_matrix().to_4x4()@Quaternion((1,0,0),.04).to_matrix().to_4x4()@head.bone.matrix_local.to_3x3().to_4x4()
    head.location=(0,0,0)
    bpy.context.view_layer.update()
run=action('Running',RUN_FRAMES+1,run_fn)
drill_actions=drill.author(SimpleNamespace(**globals()))
actions=[walk,run]+drill_actions
for a in actions:
    for layer in a.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:k.interpolation='LINEAR'
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=65
scene.timeline_markers.new('Musket fire',frame=30)
scene.timeline_markers.new('Bayonet contact (BayonetAttack)',frame=17)
rig.animation_data.action=run
setup(ROOT)
bpy.data.objects['PreviewGround'].location.z=0
scene.camera.data.ortho_scale=1.95
scene.camera.location=(1.8,-2.8,2.6)
scene.camera.rotation_euler=(Vector((0,0,.72))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.frame_end=17;scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'soldier-animated.blend'))
# Only the soldier, skeleton and rigid weapon bone are game assets.
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True)
rig.animation_data.action=walk;scene.frame_set(1)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'soldier-animated.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_force_sampling=True)
(ROOT/'gaits.json').write_text(json.dumps(dict(m_per_unit=M_PER_UNIT,walk_speed=WALK_SPEED,run_speed=RUN_SPEED)))
print('AUTHORED',[(a.name,list(a.frame_range)) for a in actions])
print('RIGID WEIGHTS',len(gunids),'weapon vertices;',len(packids),'pack vertices')
