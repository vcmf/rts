#!/bin/sh
# Rebuild the multi-part units (the gun and its crew, the cavalryman on his horse) from the Tripo FBX files in
# assets/tripo, check, publish to output/figures. Stops at the first failure. Needs Blender 5.2.2 and ffmpeg.
set -e
CODE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(cd "$CODE/../../.." && pwd)/output/unitpipe/units"           # git-ignored (tools/unitpipe/paths.py)
mkdir -p "$WORK" && cd "$WORK"
B="blender -b"
for m in gunner light-cannon horse dragoon; do $B -P $CODE/prep.py -- $m 2>&1 | grep '^PREP' | cut -c1-120; done
$B -P $CODE/combine.py -- battery 2>&1 | grep '^COMBINED'
$B -P $CODE/combine.py -- cavalry 2>&1 | grep '^COMBINED'
$B battery-combined.blend -P $CODE/anim_battery.py 2>&1 | grep '^CLIP'
$B cavalry-combined.blend -P $CODE/anim_cavalry.py 2>&1 | grep '^CLIP'
$B battery-animated.blend -P $CODE/validate.py -- battery > validate-battery.log 2>&1 || { grep CHECK validate-battery.log; exit 1; }
$B cavalry-animated.blend -P $CODE/validate.py -- cavalry > validate-cavalry.log 2>&1 || { grep CHECK validate-cavalry.log; exit 1; }
grep CHECK validate-battery.log validate-cavalry.log | cut -c1-90
FIG="$(cd "$CODE/../../.." && pwd)/output/figures"
$B battery-animated.blend -P $CODE/publish.py -- battery fr-foot-artillery 2>&1 | grep '^PUBLISHED'
$B cavalry-animated.blend -P $CODE/publish.py -- cavalry fr-cuirassier 2>&1 | grep '^PUBLISHED'
$B -P $CODE/roundtrip.py -- $FIG/fr-foot-artillery/battery.glb $FIG/fr-foot-artillery/clips.json > roundtrip-battery.log 2>&1
$B -P $CODE/roundtrip.py -- $FIG/fr-cuirassier/cavalry.glb $FIG/fr-cuirassier/clips.json > roundtrip-cavalry.log 2>&1
echo "all built, checked and published to $FIG; videos.sh renders the previews"
