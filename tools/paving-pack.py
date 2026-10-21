# The paving's colour packed into the road grit's texture (docs/plans/done/buildings.md): the terrain's live material
# binds 16 texture units on Metal without it, its limit (src/look/materials.ts), so the cobbles (data/paving-v1.png, the
# owner's) ride in the grit texture's spare channels. R: the grit, as data/road-grit-v1.png (roadPaint reads .r only: the
# roads unchanged, texel for texel). G and B: the paving's colour along its two principal axes (its colours' covariance
# about their mean: the stones' grey against the joints' ochre, then light against dark), each scaled to fill 0..1 about
# 0.5. The shader adds them back to the mean (shore.glsl, pavePaint: PAVE_MEAN + PAVE_U (g − 0.5) + PAVE_V (b − 0.5)):
# linear in the channels, so the GPU's mipmaps average the colour as the colour's own would. Prints the defines (paste
# them into shore.glsl when the paving changes) and the colour error left by the third axis.
#
#   python3 tools/paving-pack.py [grit] [paving] [out]
import math
import sys
from PIL import Image

grit_path = sys.argv[1] if len(sys.argv) > 1 else 'data/road-grit-v1.png'
pave_path = sys.argv[2] if len(sys.argv) > 2 else 'data/paving-v1.png'
out = sys.argv[3] if len(sys.argv) > 3 else 'data/road-grit-v2.png'

grit = Image.open(grit_path).convert('L')
pave = Image.open(pave_path).convert('RGB')
if grit.size != pave.size: raise SystemExit(f'paving-pack: the grit is {grit.size}, the paving {pave.size}: the same size wanted')
px = [(r / 255, g / 255, b / 255) for r, g, b in pave.getdata()]
n = len(px)
m = [sum(p[i] for p in px) / n for i in range(3)]
C = [[sum((p[i] - m[i]) * (p[j] - m[j]) for p in px) / n for j in range(3)] for i in range(3)]


# the eigenvectors of a symmetric 3 x 3 by Jacobi rotations (columns of V), their values on A's diagonal
def jacobi(A):
    A = [row[:] for row in A]; V = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    for _ in range(100):
        p, q = max(((i, j) for i in range(3) for j in range(i + 1, 3)), key=lambda t: abs(A[t[0]][t[1]]))
        if abs(A[p][q]) < 1e-15: break
        th = 0.5 * math.atan2(2 * A[p][q], A[q][q] - A[p][p]); c, s = math.cos(th), math.sin(th)
        for k in range(3):
            akp, akq = A[k][p], A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq
        for k in range(3):
            apk, aqk = A[p][k], A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk
        for k in range(3):
            vkp, vkq = V[k][p], V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq
    return [A[i][i] for i in range(3)], V


w, V = jacobi(C)
order = sorted(range(3), key=lambda i: -w[i])
E = [[V[k][i] for k in range(3)] for i in order[:2]]   # the two largest axes
proj = [[sum((p[k] - m[k]) * e[k] for k in range(3)) for e in E] for p in px]
S = [max(abs(t[a]) for t in proj) * 1.001 for a in range(2)]   # each axis' reach about the mean
code = [[min(255, max(0, round((0.5 + t[a] / (2 * S[a])) * 255))) for a in range(2)] for t in proj]
outIm = Image.merge('RGB', (grit, Image.new('L', grit.size), Image.new('L', grit.size)))
outIm.putdata([(gv, c[0], c[1]) for gv, c in zip(grit.getdata(), code)])
outIm.save(out, optimize=True)

U = [E[0][k] * 2 * S[0] for k in range(3)]; Vv = [E[1][k] * 2 * S[1] for k in range(3)]
err = math.sqrt(sum(sum((m[k] + U[k] * (c[0] / 255 - 0.5) + Vv[k] * (c[1] / 255 - 0.5) - p[k]) ** 2 for k in range(3)) for p, c in zip(px, code)) / (3 * n))
share = sum(w[i] for i in order[:2]) / sum(w)
f = lambda v: 'vec3(' + ','.join(f'{x:.4f}' for x in v) + ')'
print(f'paving-pack: {out} ({outIm.size[0]}²): the two axes keep {share * 100:.1f} % of the colours\' variance; rms error {err * 255:.2f}/255')
print(f'#define PAVE_MEAN {f(m)}')
print(f'#define PAVE_U {f(U)}')
print(f'#define PAVE_V {f(Vv)}')
