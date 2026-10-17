"""The Tripo sources, listed by hash: they stay out of git (assets/tripo/, git-ignored), this list is versioned.

python3 tools/unitpipe/sources.py           write sources.json from the files in assets/tripo
python3 tools/unitpipe/sources.py --check   exit 1 if a listed file is missing or differs
"""
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths

LIST = paths.CODE / 'sources.json'
NOTES = {   # where each export came from (Tripo, exported as FBX with its texture)
    'french-army/line-infantry-trial': 'the trial infantryman (2026-10), an earlier export than line-infantry.zip',
    'french-army/gunner': 'gunner.zip, 2026-10-17', 'french-army/light-cannon': 'light-cannon.zip, 2026-10-17',
    'french-army/horse': 'horse+3d+model.zip, 2026-10-17', 'french-army/dragoon': 'dragoon.zip, 2026-10-17 (dressed as a cuirassier)',
}


def scan():
    out = {}
    for f in sorted(p for p in paths.ASSETS.rglob('*') if p.is_file() and p.name != '.DS_Store'):
        rel = f.relative_to(paths.ASSETS).as_posix()
        model = '/'.join(rel.split('/')[:2])
        out.setdefault(model, dict(note=NOTES.get(model, ''), files={}))
        out[model]['files'][rel] = dict(sha256=hashlib.sha256(f.read_bytes()).hexdigest(), bytes=f.stat().st_size)
    return out


if '--check' in sys.argv:
    listed = json.loads(LIST.read_text())
    bad = 0
    for model, m in listed.items():
        for rel, want in m['files'].items():
            f = paths.ASSETS / rel
            got = hashlib.sha256(f.read_bytes()).hexdigest() if f.exists() else None
            if got != want['sha256']:
                bad += 1
                print('MISMATCH' if got else 'MISSING', rel)
    print('sources:', 'ok' if not bad else f'{bad} problem(s)', f'({sum(len(m["files"]) for m in listed.values())} files)')
    sys.exit(1 if bad else 0)
found = scan()
listed = json.loads(LIST.read_text()) if LIST.exists() else {}
lost = [m for m in listed if m not in found]
if not found or (lost and '--force' not in sys.argv):
    print('sources: not written:', 'no files in ' + str(paths.ASSETS) if not found else 'missing ' + ', '.join(lost),
          '(restore them, or --force to drop them from the list)')
    sys.exit(1)
LIST.write_text(json.dumps(found, indent=1) + '\n')
print('wrote', LIST)
