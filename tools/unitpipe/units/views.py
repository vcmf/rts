"""Render a model's rest pose from four sides. blender -b <name>-inspected.blend -P views.py -- out.png"""
import bpy, sys, math
from mathutils import Vector
from pathlib import Path
out=sys.argv[sys.argv.index('--')+1]
sc=bpy.context.scene
sc.render.engine='BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x=sc.render.resolution_y=512
w=bpy.data.worlds.new('W'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(.5,.52,.55,1)
src=Path(bpy.data.filepath).parent/'source'
for im in bpy.data.images:
    if im.source=='FILE':
        p=list((src).rglob(Path(im.filepath).name))
        if p: im.filepath=str(p[0]); im.reload()
meshes=[o for o in sc.objects if o.type=='MESH']
lo=Vector([min((o.matrix_world@Vector(b))[i] for o in meshes for b in o.bound_box) for i in range(3)])
hi=Vector([max((o.matrix_world@Vector(b))[i] for o in meshes for b in o.bound_box) for i in range(3)])
c=(lo+hi)/2; r=max(hi-lo)
bpy.ops.object.light_add(type='SUN'); sun=bpy.context.object; sun.rotation_euler=(.7,.2,.6); sun.data.energy=3
bpy.ops.object.camera_add(); cam=bpy.context.object; sc.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=r*1.15
files=[]
for i,(az,el) in enumerate([(0,0),(90,0),(180,0),(35,35)]):
    a=math.radians(az); e=math.radians(el)
    d=Vector((math.sin(a)*math.cos(e), -math.cos(a)*math.cos(e), math.sin(e)))
    cam.location=c+d*r*3; cam.rotation_euler=(c-cam.location).to_track_quat('-Z','Y').to_euler()
    f=f'{out}.{i}.png'; sc.render.filepath=f; bpy.ops.render.render(write_still=True); files.append(f)
print('FILES',files)
