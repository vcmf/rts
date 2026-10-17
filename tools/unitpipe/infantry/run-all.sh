#!/bin/sh
# Rebuild, check and publish the French line infantryman from the Tripo source. Run from anywhere.
# Stops at the first failing step. Needs Blender 5.2.2 (blender on PATH), ffmpeg and python3.
set -e
CODE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(cd "$CODE/../../.." && pwd)/output/unitpipe/infantry"       # git-ignored (tools/unitpipe/paths.py)
mkdir -p "$WORK" && cd "$WORK"
B="blender -b --python-exit-code 1 -P"
$B $CODE/inspect.py > inspect.log           # the Tripo FBX (assets/tripo) -> source-inspected.blend
$B $CODE/components.py > components.log     # its loose parts -> components.json
$B $CODE/build.py -- --skip-stills        # every clip -> soldier-animated.blend/.glb, clips.json, contacts.json
$B $CODE/validate-drill.py                # drill clips: hands, joins, rigid weapon, ground, pops, cuff, readability
$B $CODE/validate.py                      # the older clips' own checks
$B $CODE/roundtrip.py                     # the GLB reimports with every action animated
$B $CODE/compare-accepted.py              # untouched accepted clips are identical to the version that made them
$B $CODE/lod.py                           # lod0/1/2 GLBs of the published clips, lods.json
$B $CODE/validate-lod.py                  # every LOD on every clip
rm -rf *-frames *.mp4
$B $CODE/preview.py                       # every sequence in preview.py's SEQ
for d in *-frames; do
  ffmpeg -y -loglevel error -framerate 12 -i $d/%04d.png -c:v libx264 -pix_fmt yuv420p -movflags +faststart ${d%-frames}.mp4
done
python3 $CODE/publish.py            # -> output/figures/fr-line-infantry/
