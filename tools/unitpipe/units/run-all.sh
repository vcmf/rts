#!/bin/sh
# Rebuild the multi-part units (the gun and its crew, the cavalryman on his horse) from the Tripo FBX files in
# assets/tripo, check, publish to output/figures. Stops at the first failing step, printing the end of its log;
# every step's full output is in its log in the work folder. Needs Blender 5.2.2 and python3.
set -e
CODE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(python3 "$CODE/../paths.py" work units)"                     # git-ignored (tools/unitpipe/paths.py)
cd "$WORK"
step() {   # step <log> <command...>: run, keep the full output in <log>, fail with its tail
  log=$1; shift
  if "$@" > "$log" 2>&1; then echo "ok   $log"; else s=$?; echo "FAIL $log (exit $s)"; tail -40 "$log"; exit $s; fi
}
B="blender -b --python-exit-code 1"
for m in gunner light-cannon horse dragoon pistol; do step prep-$m.log $B -P $CODE/prep.py -- $m; done
step combine-battery.log $B -P $CODE/combine.py -- battery
step combine-cavalry.log $B -P $CODE/combine.py -- cavalry
step anim-battery.log $B battery-combined.blend -P $CODE/anim_battery.py
step anim-cavalry.log $B cavalry-combined.blend -P $CODE/anim_cavalry.py
step validate-battery.log $B battery-animated.blend -P $CODE/validate.py -- battery
step validate-cavalry.log $B cavalry-animated.blend -P $CODE/validate.py -- cavalry
grep -h '^CHECK' validate-battery.log validate-cavalry.log | cut -c1-100
step publish-battery.log $B battery-animated.blend -P $CODE/publish.py -- battery fr-foot-artillery
step publish-cavalry.log $B cavalry-animated.blend -P $CODE/publish.py -- cavalry fr-cuirassier
A="$(python3 "$CODE/../paths.py" published fr-foot-artillery)"; C="$(python3 "$CODE/../paths.py" published fr-cuirassier)"
step roundtrip-battery.log $B -P $CODE/roundtrip.py -- "$A/battery.glb" "$A/clips.json"
step roundtrip-cavalry.log $B -P $CODE/roundtrip.py -- "$C/cavalry.glb" "$C/clips.json"
echo "all built, checked and published ($A, $C); videos.sh renders the previews and publishes them"
