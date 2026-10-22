import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import bpy
from mathutils import Vector

def setup(root):
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=16
    scene.render.resolution_x=640
    scene.render.resolution_y=640
    scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Studio')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(0.35,0.38,0.43,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    for image in bpy.data.images:
        if image.source=='FILE':
            candidates=list(paths.source('french-army', 'line-infantry-trial').rglob('*.jpg'))
            if candidates: image.filepath=str(candidates[0]); image.reload(); image.pack()
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type=='BSDF_PRINCIPLED':
                    node.inputs['Roughness'].default_value=.8
                    node.inputs['Metallic'].default_value=0
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.01))
    ground=bpy.context.object; ground.name='PreviewGround'
    mat=bpy.data.materials.new('Ground'); mat.diffuse_color=(.22,.26,.30,1); ground.data.materials.append(mat)
    bpy.ops.object.camera_add(location=(1.6,-2.5,2.2))
    cam=bpy.context.object; cam.name='PreviewCamera'
    cam.rotation_euler=(Vector((0,0,.5))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'; cam.data.ortho_scale=1.6; scene.camera=cam
    for pos,power,size in [((2,-3,4),350,3),((-3,-1,2),180,3),((1,3,3),250,2)]:
        bpy.ops.object.light_add(type='AREA',location=pos)
        l=bpy.context.object; l.data.energy=power; l.data.shape='DISK'; l.data.size=size
        l.rotation_euler=(Vector((0,0,.5))-l.location).to_track_quat('-Z','Y').to_euler()
    scene.view_settings.view_transform='AgX'

if __name__=='__main__':
    from pathlib import Path
    root=paths.work('infantry')
    bpy.ops.wm.open_mainfile(filepath=str(root/'source-inspected.blend'))
    setup(root)
    bpy.context.scene.render.filepath=str(root/'rest.png')
    bpy.ops.render.render(write_still=True)
