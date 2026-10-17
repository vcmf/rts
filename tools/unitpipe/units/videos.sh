#!/bin/sh
# Preview videos of every clip: a close view and the RTS camera's pitch. Needs blender and ffmpeg.
set -e
CODE="$(cd "$(dirname "$0")" && pwd)"
cd "$(python3 "$CODE/../paths.py" work units)"                      # the work folder (paths.py)
OUT=videos; mkdir -p $OUT frames
render() {   # unit clip name cam [extra args]
  u=$1; c=$2; n=$3; cam=$4; shift 4
  rm -rf frames/$n; mkdir -p frames/$n
  blender -b --python-exit-code 1 $u-animated.blend -P $CODE/preview.py -- clip=$c out=frames/$n/f cam=$cam "$@" > frames/$n.log 2>&1 \
    || { echo "FAIL preview $n"; tail -30 frames/$n.log; exit 1; }
  ffmpeg -y -loglevel error -framerate 24 -pattern_type glob -i "frames/$n/f.*.png" -c:v libx264 -pix_fmt yuv420p -crf 20 $OUT/$n.mp4
  echo "video $OUT/$n.mp4"
}
# battery: close (three-quarter, low) and RTS (high, wide)
for c in Idle Load Ready Fire; do
  render battery $c battery-$c-close 0,-0.6,0.8,6.0,-40,22 res=960x540 fx=battery
  render battery $c battery-$c-rts 0,-0.4,0.5,9.0,-25,55 res=960x540 fx=battery
done
# the whole cycle in one: Idle, Load, Ready, Fire, Load
for v in close rts; do
  printf "file 'battery-Idle-$v.mp4'\nfile 'battery-Load-$v.mp4'\nfile 'battery-Ready-$v.mp4'\nfile 'battery-Fire-$v.mp4'\nfile 'battery-Load-$v.mp4'\n" > $OUT/list-$v.txt
  ffmpeg -y -loglevel error -f concat -safe 0 -i $OUT/list-$v.txt -c copy $OUT/battery-cycle-$v.mp4 && rm $OUT/list-$v.txt
done
# cavalry: side view travelling with the horse, and RTS
render cavalry Idle cavalry-Idle-close 0,0,1.1,4.2,70,12 res=960x540
render cavalry Idle cavalry-Idle-rts 0,0,0.6,9,-30,55 res=960x540
for c in Walk:1.7:4 Trot:3.3:5 Gallop:6.5:6 GallopSabre:6.5:6; do
  name=${c%%:*}; rest=${c#*:}; v=${rest%%:*}; cy=${rest#*:}
  render cavalry $name cavalry-$name-close 0,0,1.2,4.4,90,10 res=960x540 follow=$v cycles=$cy
  render cavalry $name cavalry-$name-rts 0,0,0.6,9,-30,55 res=960x540 follow=$v cycles=$cy
done
# the sabre: standing clips, the cut at the gallop, and the fighting sequence in one
for c in DrawSabre IdleSabre SabreCutRight SabreCutLeft SabreThrust SabreParry SabreFight SheatheSabre; do
  render cavalry $c cavalry-$c-close 0,-0.3,1.6,3.6,-50,12 res=960x540
  render cavalry $c cavalry-$c-rts 0,0,0.6,9,-30,55 res=960x540
done
render cavalry GallopCut cavalry-GallopCut-close 0,0,1.2,4.4,90,10 res=960x540 follow=6.5
render cavalry GallopCut cavalry-GallopCut-rts 0,0,0.6,9,-30,55 res=960x540 follow=6.5
for v in close rts; do
  : > $OUT/l.txt
  for c in DrawSabre IdleSabre SabreCutRight SabreCutLeft SabreThrust SabreParry SabreFight SheatheSabre; do echo "file 'cavalry-$c-$v.mp4'" >> $OUT/l.txt; done
  ffmpeg -y -loglevel error -f concat -safe 0 -i $OUT/l.txt -c copy $OUT/cavalry-sabre-$v.mp4 && rm $OUT/l.txt
done
# the pistol: drawn, presented, aimed, fired, holstered (the flash and smoke are preview only)
for c in DrawPistol ReadyPistol PresentPistol AimPistol LowerPistol FirePistol HolsterPistol; do
  render cavalry $c cavalry-$c-close -0.3,-0.4,1.6,3.8,-100,10 res=960x540 fx=pistol
  render cavalry $c cavalry-$c-rts 0,0,0.6,9,-30,55 res=960x540 fx=pistol
done
for v in close rts; do
  : > $OUT/l.txt
  for c in DrawPistol ReadyPistol PresentPistol AimPistol LowerPistol PresentPistol AimPistol FirePistol ReadyPistol HolsterPistol; do echo "file 'cavalry-$c-$v.mp4'" >> $OUT/l.txt; done
  ffmpeg -y -loglevel error -f concat -safe 0 -i $OUT/l.txt -c copy $OUT/cavalry-pistol-$v.mp4 && rm $OUT/l.txt
done
# publish the previews with their figures
for f in fr-foot-artillery:battery fr-cuirassier:cavalry; do
  d="$(python3 "$CODE/../paths.py" published ${f%%:*})/videos"; rm -rf "$d"; mkdir -p "$d"; cp $OUT/${f#*:}-*.mp4 "$d/"
done
echo done
