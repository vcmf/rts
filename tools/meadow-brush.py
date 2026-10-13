# The meadow's brush texture (docs/plans/active/l5c-meadow.md): a seamless greyscale tile of grass seen from above,
# stamped at random from a grass brush pack's stamps (Devin Elle Kurtz's Grass and Fields expansion, kept out of git
# in assets/grass-brushes/: royalty-free, but not to be redistributed). Only the tile is committed.
#
# Usage (from rts/): python3 tools/meadow-brush.py assets/grass-brushes data/meadow-brush.png
#
# Value, not colour (the palette paints it): a mid ground, soft lumps lighter and darker (the patchwork), then blade
# clusters at every angle (seen from above, blades lie every way), their strokes lighter toward the light. Every
# stamp is drawn with its wrapped copies, so the tile repeats without a seam. Deterministic (its own seed).
import math, random, sys
from PIL import Image, ImageChops, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
N = 1024
SEED = 7
PATCH = ['Layer 15.png', 'Layer 16.png', 'Layer 18.png', 'Layer 19.png', 'Layer 2.png', 'Layer 24.png', 'Layer 25.png',
         'Layer 28.png', 'Layer 29.png', 'Layer 6.png', 'Layer 7.png', 'Layer 72.png', 'Layer 8.png']
BLADES = ['Layer 14.png', 'Layer 26.png', 'Layer 27.png', 'Layer 46.png', 'Layer 48.png', 'Layer 53.png', 'Layer 56.png',
          'Layer 58.png', 'Layer 70.png', 'Layer 71.png', 'Layer 78.png']

def alpha(name):
    im = Image.open(f'{SRC}/{name}').convert('RGBA')
    return im.getchannel('A')

def stamp(canvas, mask, value, x, y, size, angle):
    m = mask.copy(); m.thumbnail((size, size)); m = m.rotate(angle, resample=Image.BICUBIC, expand=True)
    tone = Image.new('L', m.size, value)
    for dx in (-N, 0, N):
        for dy in (-N, 0, N):
            px, py = math.floor(x - m.width / 2 + dx), math.floor(y - m.height / 2 + dy)   # floor: the wrapped copies land exactly a tile apart
            if px > N or py > N or px + m.width < 0 or py + m.height < 0: continue
            canvas.paste(tone, (px, py), m)

rnd = random.Random(SEED)
patches, blades = [alpha(n) for n in PATCH], [alpha(n) for n in BLADES]
c = Image.new('L', (N, N), 118)
for _ in range(90):    # the patchwork: soft lumps, lighter and darker
    stamp(c, rnd.choice(patches), rnd.randint(80, 165), rnd.uniform(0, N), rnd.uniform(0, N), rnd.randint(160, 420), rnd.uniform(0, 360))
c = c.filter(ImageFilter.GaussianBlur(6))
for _ in range(2600):  # the blades: dark gaps and lighter strokes, mixed
    v = rnd.choice((rnd.randint(55, 105), rnd.randint(140, 215), rnd.randint(150, 235)))
    stamp(c, rnd.choice(blades), v, rnd.uniform(0, N), rnd.uniform(0, N), rnd.randint(60, 150), rnd.uniform(0, 360))
# a last, faint unify: keep the strokes but take a little of the lumps' light back over them
c = ImageChops.blend(c, c.filter(ImageFilter.GaussianBlur(24)), 0.18)
c.save(OUT, optimize=True)
lo, hi = c.getextrema(); print(f'wrote {OUT} {N}x{N}, values {lo}..{hi}, mean {sum(i * n for i, n in enumerate(c.histogram())) / (N * N):.1f}')
