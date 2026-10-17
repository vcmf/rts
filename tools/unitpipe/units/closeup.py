"""Render the current pose: closeups around given points. -- out x,y,z,size az el [x,y,z,size az el ...]"""
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
out = a[0]; shots = [list(map(float, s.split(','))) for s in a[1:]]
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = 512
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.5, .52, .55, 1)
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.object; sun.rotation_euler = (.7, .2, .6); sun.data.energy = 3
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam; cam.data.type = 'ORTHO'
bpy.ops.mesh.primitive_plane_add(size=40); g = bpy.context.object
gm = bpy.data.materials.new('G'); gm.diffuse_color = (.35, .37, .33, 1); g.data.materials.append(gm)
for i, (x, y, z, size, az, el) in enumerate(shots):
    c = Vector((x, y, z)); A = math.radians(az); E = math.radians(el)
    d = Vector((math.sin(A) * math.cos(E), -math.cos(A) * math.cos(E), math.sin(E)))
    cam.location = c + d * 10; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.ortho_scale = size
    sc.render.filepath = f'{out}.{i}.png'; bpy.ops.render.render(write_still=True)
