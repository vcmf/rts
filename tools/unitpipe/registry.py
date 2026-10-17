"""The figure registry: every published figure and its clips, in one generated file the game and the docs
read (the figure animation proposal, decision 0038).

python3 tools/unitpipe/registry.py           write data/figures/index.json from output/figures/*/clips.json
python3 tools/unitpipe/registry.py --check   exit 1 if the committed file differs from what would be written

Root speeds are in metres a second, events are lists of frames (1-based, at the clip's fps).
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths

FIGURES = {   # figure id -> its pipeline, its sources, its kind (the ruleset's `figure`)
    'fr-line-infantry': dict(pipeline='infantry', kind='foot', sources=['french-army/line-infantry-trial']),
    'fr-foot-artillery': dict(pipeline='units', kind='crewed', sources=['french-army/gunner', 'french-army/light-cannon']),
    'fr-cuirassier': dict(pipeline='units', kind='mounted', sources=['french-army/horse', 'french-army/dragoon']),
}


def frames_list(v):
    return v if isinstance(v, list) else [v]


def figure_entry(fid, meta):
    table = json.loads((paths.OUTPUT / 'figures' / fid / 'clips.json').read_text())
    mpu = table.get('m_per_unit', 1.0)
    clips = {}
    for name, c in sorted(table['clips'].items()):
        e = dict(frames=c['frames'], loop=bool(c.get('loop', False)),
                 events={k: frames_list(v) for k, v in sorted(c.get('events', {}).items())})
        if c.get('root_speed'):
            e['root_speed'] = round(c['root_speed'] * mpu, 4)
        for k in ('root_turn', 'root_direction', 'starts', 'ends', 'next'):
            if k in c:
                e[k] = c[k]
        clips[name] = e
    files = sorted(p.name for p in (paths.OUTPUT / 'figures' / fid).glob('*.glb'))
    return dict(kind=meta['kind'], pipeline=meta['pipeline'], sources=meta['sources'], fps=table.get('fps', 24),
                m_per_unit=round(mpu, 4), files=files, clips=clips)


def build():
    return dict(version=1, figures={fid: figure_entry(fid, m) for fid, m in FIGURES.items()})


missing = [fid for fid in FIGURES if not (paths.OUTPUT / 'figures' / fid / 'clips.json').exists()]
if missing:
    print('registry: not published yet:', ', '.join(missing), '(run the pipelines first)')
    sys.exit(1)
reg = build()
text = json.dumps(reg, indent=1, sort_keys=False) + '\n'
if '--check' in sys.argv:
    same = paths.REGISTRY.exists() and paths.REGISTRY.read_text() == text
    print('registry:', 'up to date' if same else 'differs from the published figures (run registry.py)')
    sys.exit(0 if same else 1)
paths.REGISTRY.parent.mkdir(parents=True, exist_ok=True)
paths.REGISTRY.write_text(text)
print('wrote', paths.REGISTRY, sum(len(f['clips']) for f in reg['figures'].values()), 'clips')
