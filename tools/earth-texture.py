# The bare earth's texture (docs/plans/active/bare-earth.md): the owner's photo of dry, cracked earth made into a
# seamless greyscale tile, data/ground-earth-v1.png. Its value only: the pack's colours are never used, our palette
# paints the earth (macro.glsl). The photo is local (design/refs/texture/ground-texture.jpg, not committed).
#
#   python3 tools/earth-texture.py [photo] [out] [size]
#
# The central square, in grey, the photo's broad light taken off (a blur of it divided out, so the tile's repeat shows
# no bright corner), resized to size² (1024), then made seamless: the tile mixed with itself shifted by half, the
# shifted copy where the tile's edges would meet. Prints the tile's mean (the shader keeps the earth's colour about it).
import sys
from PIL import Image, ImageChops, ImageFilter, ImageStat

src = sys.argv[1] if len(sys.argv) > 1 else 'design/refs/texture/ground-texture.jpg'
out = sys.argv[2] if len(sys.argv) > 2 else 'data/ground-earth-v1.png'
N = int(sys.argv[3]) if len(sys.argv) > 3 else 1024

im = Image.open(src).convert('L')
w, h = im.size; s = min(w, h)
im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((N, N), Image.LANCZOS)

# the broad light: a wide blur, divided out about the tile's mean (detail kept, gradient flat)
mean = ImageStat.Stat(im).mean[0]
broad = im.filter(ImageFilter.GaussianBlur(N / 8))
flat = Image.new('L', (N, N))
pi, pb = im.load(), broad.load(); pf = flat.load()
for y in range(N):
  for x in range(N):
    pf[x, y] = max(0, min(255, round(pi[x, y] * mean / max(pb[x, y], 1))))

# seamless: the half-shifted copy where the tile's edges meet, the tile itself in its middle, a smooth mask between
shifted = ImageChops.offset(flat, N // 2, N // 2)
mask = Image.new('L', (N, N)); pm = mask.load(); B = N // 6   # the blend's width at each edge
def ramp(d): t = min(1.0, d / B); return t * t * (3 - 2 * t)
for y in range(N):
  for x in range(N):
    pm[x, y] = round(255 * ramp(min(x, N - 1 - x)) * ramp(min(y, N - 1 - y)))
tile = Image.composite(flat, shifted, mask)
tile.save(out, optimize=True)
print(f'{out}: {N}x{N}, mean {ImageStat.Stat(tile).mean[0] / 255:.3f}')
