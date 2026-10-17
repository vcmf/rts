import sys, glob
from PIL import Image
p, cols = sys.argv[1], int(sys.argv[2])
fs = sorted(glob.glob(p + '.[0-9][0-9][0-9][0-9].png'))
ims = [Image.open(f).convert('RGB') for f in fs]
w, h = ims[0].size; w2, h2 = w // 2, h // 2
rows = (len(ims) + cols - 1) // cols
o = Image.new('RGB', (w2 * cols, h2 * rows), 'white')
from PIL import ImageDraw
for i, (f, im) in enumerate(zip(fs, ims)):
    im = im.resize((w2, h2)); ImageDraw.Draw(im).text((6, 6), f.split('.')[-2], fill='black')
    o.paste(im, ((i % cols) * w2, (i // cols) * h2))
o.save(p + '-grid.png')
