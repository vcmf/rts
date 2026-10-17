"""Pose builders for the gun crew (on biped.py), in the gun's frame: the piece faces -Y, its right is -X."""
import math
from mathutils import Vector, Matrix
from biped import fwd, body_rot, Rz, UP

HIP = .90          # hip joint height standing (m)
ANKLE = .128       # ankle height, foot flat


def lateral(yaw):
    """The figure's left."""
    return Vector((math.cos(yaw), math.sin(yaw), 0))


def stand(x, y, yaw, width=.11, lean=0.0, crouch=0.0, chest=(0, 0, 0), head=(0, 0), stagger=0.0, foot_out=.12):
    """A standing pose at (x, y) facing yaw: feet `width` either side, one foot `stagger` ahead (left)."""
    f = fwd(yaw); l = lateral(yaw); base = Vector((x, y, 0))
    hip = base + Vector((0, 0, HIP - crouch)) - f * (math.sin(lean) * .05)
    feet = {'Left': (base + l * width + f * stagger / 2 + Vector((0, 0, ANKLE)), yaw + foot_out, 0.0),
            'Right': (base - l * width - f * stagger / 2 + Vector((0, 0, ANKLE)), yaw - foot_out, 0.0)}
    return dict(hips=(hip, yaw, lean, 0.0), chest=chest, head=head, feet=feet, hands={}, curl={})


def hang(pose, side, swing=0.0, out=.06):
    """A free arm hanging at the side (swing + = hand forward)."""
    pose['hands'][side] = ('hang', swing, out)
    pose.setdefault('elbow', {})[side] = Vector((.3, .6, -.3))
    return pose


def rod(pose, side, prop, s, wdir, flip=1, curl=None, pad=0.0):
    pose['hands'][side] = ('rod', prop, s, Vector(wdir), flip, pad)
    if curl is not None:
        pose['curl'][side] = curl
    return pose


def prop_matrix(base, direction, roll_ref=Vector((0, 0, 1))):
    """A prop bone matrix: its head at base, its Y axis along direction."""
    y = Vector(direction).normalized()
    z = roll_ref - y * roll_ref.dot(y)
    if z.length < 1e-4:
        z = Vector((1, 0, 0)) - y * y.x
    z.normalize(); x = y.cross(z)
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = Vector(base)
    return M
