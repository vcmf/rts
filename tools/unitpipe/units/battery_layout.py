"""Where the crew of a field piece stand, in the gun's frame (the piece faces -Y, its right is -X).

Each post is (x, y, yaw); yaw turns the figure from facing -Y (+ = to its left, so +90 deg faces +X).
'ready' is the rest pose and the posts the crew loads from; 'fire' are the posts clear of the recoil.
A French field piece was served by 8 (the ruleset's detachment is 12 men): these four do the drill,
the others can stand behind as figures in Idle.
"""
import math
D = math.radians
POSTS = {
    'ready': {
        'Sponger':   (-0.78, -2.10, D(90)),    # right of the muzzle, the sponge-rammer
        'Loader':    (0.78, -2.10, D(-90)),    # left of the muzzle, puts the cartridge in
        'Ventsman':  (0.35, 0.20, D(-40)),     # left of the breech: covers the vent, primes, lays the gun
        'Firer':     (-1.45, 0.45, D(90)),     # right, behind the wheel: the linstock
    },
    # where the crew wait for the order to fire (end of Load, the Ready loop, start of Fire)
    'fire': {
        'Sponger':   (-0.78, -2.10, D(25)),    # turned to face down the range, the staff at his side
        'Loader':    (0.78, -2.10, D(-25)),
        'Ventsman':  (2.00, -0.10, D(-60)),    # well clear of the recoil, outside the left wheel
    },
}
