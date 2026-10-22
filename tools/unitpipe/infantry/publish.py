"""Copy the finished assets into output/figures/fr-line-infantry/: the three LOD GLBs, the clip table and the
preview videos. Plain Python (no Blender). The clip table is the drill's clips.json plus the clips
authored as pose functions in build.py, so the game reads one file for all published clips."""
import sys as _sys
_sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import paths   # work files in output/unitpipe/infantry, the source in assets/tripo (paths.py)
import json, shutil
from pathlib import Path
ROOT = paths.work('infantry')
OUT = paths.published('fr-line-infantry')
for old in list(OUT.glob('*.glb')) + list((OUT / 'previews').glob('*.mp4')): old.unlink()   # nothing stale stays
(OUT / 'previews').mkdir(parents=True, exist_ok=True)
table = json.loads((ROOT / 'clips.json').read_text())
gaits = json.loads((ROOT / 'gaits.json').read_text())   # written by build.py
table['m_per_unit'] = round(gaits['m_per_unit'], 4)   # figure scale the root speeds assume
table['root_speed_note'] = 'root_speed is in model units per second; multiply by m_per_unit for m/s'
table['clips'] = {
    'Walking': dict(frames=33, loop=True, starts='Walking@1', ends='Walking@1', root_speed=round(gaits['walk_speed'], 4),
                    note='in place, shoulder carry; the ordinary pace. Play faster (up to about 1.5x) for the route step and hurrying'),
    'Running': dict(frames=17, loop=True, starts='Running@1', ends='Running@1', root_speed=round(gaits['run_speed'], 4),
                    note='in place, port arms'),
    **table['clips']}
CHECK_ONLY = ('aim', 'lies', 'ramrod')   # validation metadata, not for the game
for c in table['clips'].values():
    for f in CHECK_ONLY: c.pop(f, None)
    c['seconds'] = (c['frames'] - 1) / 24
    c['event_seconds'] = {e: (f - 1) / 24 for e, f in c.get('events', {}).items()}
(OUT / 'clips.json').write_text(json.dumps(table, indent=1))
for lod in ('lod0', 'lod1', 'lod2'): shutil.copy2(ROOT / f'soldier-{lod}.glb', OUT / f'soldier-{lod}.glb')
for mp4 in ROOT.glob('*.mp4'): shutil.copy2(mp4, OUT / 'previews' / mp4.name)
print('PUBLISHED', len(table['clips']), 'clips:', ', '.join(table['clips']))
