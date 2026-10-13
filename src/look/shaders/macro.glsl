// THE GROUND'S MACRO COLOUR (docs/plans/active/l5-macro.md, L5a; docs/proposals/prepainted-terrain.md): the colour
// of what covers the ground (src/look/world/cover.ts), before the banks, the steep ground, the seasons and the light.
// Colour only: the light stays at runtime (paint()). Included by shore.glsl, after the meadow it starts from.
// One function, macro(xz, q), paints it: the bake (src/look/macro.ts) renders it with q = 1 into a texture; the
// shader arm runs it with q = 0 per pixel. The arms (one define, the page's ?macro):
//   MACRO_FLAT    each class's colour alone (no variation, stripes, wear or broken edges): the ablation's arm 1
//   MACRO_SHADER  macro(xz, 0) per pixel: arm 2
//   MACRO_BAKE    the bake, read: arm 3, and arms 4 and 5 (L5b), whose bakes differ (MACRO_STROKES below; the
//                 Kuwahara pass in src/look/macro.ts)
// the cover grid (nearest): class, field id, furrow direction, wear distance
uniform sampler2D uCover;
// the snow's lie's zero, a byte (128/255), and under a byte from it the lie is 0: off the fields the bake's 8 bits
// then read 0, so snowAt keeps its own edge there, as the water's shore band does (the seam)
#define LIE0 0.50196078
float lieOf(float a){float d=a-LIE0;return abs(d)<0.003?0.0:d*1.2;}
#ifdef MACRO_BAKE
uniform sampler2D uMacro,uMacroFar;   // the bakes: the tile at SPEC.macro.texel, the far ring at SPEC.macro.far
#endif
// the cover cell at a world point: class (0..9), field id (0 off fields, else a hash in 1..255), furrow direction
// (rad), wear distance (m, to the nearest road, track or village ground; 25.5 at or past its reach)
// (nearest, no mips: on WebGL2 read with zero derivatives, so a read in a branch the pixels of a quad take differently
// is defined, as arm 4's strokes do)
#ifdef WEBGL2
vec4 coverTex(vec2 uv){return textureGrad(uCover,uv,vec2(0.0),vec2(0.0));}
#else
vec4 coverTex(vec2 uv){return texture2D(uCover,uv);}
#endif
vec4 coverAt(vec2 xz){vec4 t=coverTex(xz/FAR_W+0.5);return vec4(floor(t.r*255.0+0.5),floor(t.g*255.0+0.5),t.b*3.14159265,t.a*25.5);}
// a class's colour; v in 0..1 its variation (0.5: the flat arm's)
vec3 classColour(float k,float v){
  return k<1.5?mix(vec3(0.27,0.43,0.21),vec3(0.38,0.50,0.25),v)      // pasture (0 is the meadow: groundMeadow)
        :k<2.5?mix(vec3(0.17,0.29,0.22),vec3(0.25,0.36,0.25),v)      // wood floor
        :k<3.5?mix(vec3(0.48,0.49,0.50),vec3(0.54,0.55,0.56),v)      // road: cool grey dust, a mid value (it reads against the
                                                                       // meadow by hue: a pale road hid the Austrian white, the guard)
        :k<4.5?mix(vec3(0.49,0.48,0.46),vec3(0.55,0.54,0.52),v)      // track
        :k<5.5?mix(vec3(0.50,0.46,0.38),vec3(0.58,0.53,0.43),v)      // village ground (trodden earth: cellColour mixes grass in)
        :k<6.5?mix(vec3(0.51,0.47,0.32),vec3(0.57,0.52,0.36),v)      // wheat: olive-gold straw (the warm sun turns it gold), between the dark coats and the white
        :k<7.5?mix(vec3(0.37,0.50,0.20),vec3(0.45,0.56,0.24),v)      // green crop
        :k<8.5?mix(vec3(0.60,0.59,0.50),vec3(0.67,0.65,0.55),v)      // stubble: grey straw (the warm sun turns pale straw orange)
        :mix(vec3(0.58,0.48,0.36),vec3(0.64,0.53,0.40),v);           // ploughed: dry earth, lighter than the dark coats
                                                                       // (the readability guard, tools/guard.mjs --view cover)
}
// the grain's soft blotches at about scale s m without its repeat: G(xz/s) tiles every s m, so two reads at
// unrelated scales are mixed wherever a repeat would show
float blot(vec2 xz,float s){return texM(uGrain,xz/s,s).g*0.6+texM(uGrain,xz/(s*2.618)+0.37,s*2.618).g*0.4;}
// The grain at a point, read once: every function below is arithmetic on these (the class's colours and the stripes
// pick among them by class, after the reads)
struct Grain{vec3 meadow;float v,village,stripe,wear,wearDab;};
Grain grainAt(vec2 xz){return Grain(groundMeadow(xz),texM(uGrain,xz/90.0,90.0).g,blot(xz+0.7,13.0),blot(xz,17.0),blot(xz+0.3,6.0),blot(xz+0.6,2.7));}
// the colour of one cover cell: the class with its variation; a field's own shade from its id
vec3 cellColour(vec4 cv,Grain g){
  #ifdef MACRO_SAB_ONECLASS
  return g.meadow;   // the class check's sabotage: one colour for every class
  #endif
  vec3 c=classColour(cv.x,smoothstep(0.3,0.7,g.v));
  // the village ground: grass between trodden patches (its buildings come with L7)
  c=cv.x>4.5&&cv.x<5.5?mix(g.meadow*0.92,c,smoothstep(0.42,0.6,g.village)):c;
  c*=cv.y>0.5?0.94+0.12*fract(cv.y*0.6180339):1.0;
  return cv.x<0.5?g.meadow:c;}
// the stripes along a field's furrows (ploughed: ridge-and-furrow lands; crops: drill bands): -1 in a furrow, +1 on
// a ridge, 0 off fields, faded out where a pixel spans a fifth of a stripe (a stripe under a pixel shimmers). px: the
// footprint, m
float stripeBand(vec4 cv,vec2 xz,float px,Grain g){
  float k=cv.x,P=k<6.5?5.0:k<7.5?4.0:k<8.5?6.0:7.0;
  vec2 u=vec2(cos(cv.z),sin(cv.z));float s=dot(xz,vec2(-u.y,u.x));                 // across the furrows
  float f=fract(s/P+cv.y*0.137+(g.stripe-0.5)*0.35);                                // the bands wander like a brush
  #ifdef MACRO_SAB_STEP
  float b=step(0.5,f)*2.0-1.0;   // the shimmer check's sabotage: hard stripes, never faded
  #else
  float b=((smoothstep(0.2,0.4,f)-smoothstep(0.7,0.9,f))*2.0-1.0)*(1.0-smoothstep(P*0.2,P*0.45,px));
  #endif
  return cv.y>0.5?b:0.0;}
// how much the stripes move the value, and the snow's lie (snowAt, painter.glsl: furrows hold snow, ridges show the
// earth: the winter master's ploughed stripes), by class
float stripeValue(float k){return k<6.5?0.05:k<7.5?0.06:k<8.5?0.06:0.09;}
float stripeSnow(float k){return k<8.5?0.3:0.5;}
// roads, tracks and the village ground are trodden: they hold less snow, so they still read in winter
float trodden(float k){return k>2.5&&k<3.5?0.45:k>3.5&&k<4.5?0.35:k>4.5&&k<5.5?0.2:0.0;}
// worn grass near roads, tracks and the village: thinning to trodden earth over a few metres, broken by the grain
vec3 wear(vec3 c,vec4 cv,Grain g){
  float w=1.0-smoothstep(0.5,4.0,cv.w+(g.wear-0.5)*3.0);
  return cv.x>1.5?c:mix(c,vec3(0.56,0.53,0.45),w*(0.3+0.4*g.wearDab));}
// the class lookup's point, pushed by the grain's soft blotches (±1.5 m) so a class edge wanders like a painted one
vec2 coverWarp(vec2 xz){return xz+(vec2(blot(xz,23.0),blot(xz+11.0,23.0))-0.5)*3.0;}
// (colour, the snow's lie as LIE0 + lie/1.2). q 1: the bake's, the edges blended over 9 taps a metre apart with a
// darker margin where classes meet (a headland or a verge); q 0: one tap. px: the footprint, m (the bake's texel, or
// the pixel's)
#ifdef MEADOW
// the meadow pattern (docs/plans/done/l5c-meadow.md) on meadow and pasture (k, the class the ground paints): the
// brush tile (data/meadow-brush.png) at two unrelated scales and turns, warped by a slow noise (no common period, no
// repeat to see), read at the footprint px (the bake texel, or the pixel), and the clump field, its fine octave
// fading with the footprint. The near grass takes its shade from the same tile and field (src/look/meadow.ts). In
// the bake arm this costs nothing a frame: the bake holds it
uniform sampler2D uMeadowBrush;
float brushAt(vec2 uv,float s,float px){
  #ifdef WEBGL2
  return textureGrad(uMeadowBrush,uv,vec2(px/s,0.0),vec2(0.0,px/s)).r;
  #else
  return texture2D(uMeadowBrush,uv).r;
  #endif
}
vec3 meadowPattern(vec3 c,float k,vec2 xz,float px){
  float gr=k<0.5?1.0:k<1.5?0.75:0.0;if(gr<=0.0)return c;
  vec2 w=(vec2(mValue(xz/23.0),mValue(xz/23.0+41.0))-0.5)*3.0;
  float b=brushAt((xz+w)/7.3,7.3,px)*0.6+brushAt(mat2(0.8253,-0.5646,0.5646,0.8253)*(xz-w)/(7.3/2.618)+0.37,7.3/2.618,px)*0.4;
  float cl=mix(clumpAt(xz),mValue(xz/3.2),smoothstep(0.35,1.2,px));
  return c*mix(1.0,(1.0+(b-0.585)*1.1)*mix(0.93,1.07,cl),gr);}   // the gain makes up the contrast the bake texel blurs away
#endif
vec4 macro(vec2 xz,float q,float px){
  vec2 w=coverWarp(xz);vec4 cv=coverAt(w);Grain g=grainAt(xz);vec3 c;
  if(q>0.5){
    c=vec3(0.0);float other=0.0;
    for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 o=vec2(float(i),float(j));vec4 t=coverAt(w+o);
      c+=cellColour(t,g);other+=step(0.5,abs(t.x-cv.x)+abs(t.y-cv.y));}
    c/=9.0;c*=1.0-0.10*smoothstep(0.0,4.0,other)*(1.0-smoothstep(4.0,9.0,other));
  }else c=cellColour(cv,g);
  float b=stripeBand(cv,xz,px,g);c*=1.0+stripeValue(cv.x)*b;c=wear(c,cv,g);
  #ifdef MEADOW
  c=meadowPattern(c,cv.x,xz,px);
  #endif
  return vec4(c,LIE0-(b*stripeSnow(cv.x)+trodden(cv.x))/1.2);}
#ifdef MACRO_STROKES
// ARM 4, BAKED STROKES (the bake's shader alone; L5b, an experiment: docs/proposals/prepainted-terrain.md): the bake's
// colour laid over with strokes of its own colour, gathered per texel (no per-stroke draws, docs/proposals/
// engine-design.md §6). One stroke a STROKE_CELL m cell, its centre jittered in the cell; along the field's furrows
// on fields, along a slow flow elsewhere; 1.6-2.8 m long, 0.5-0.9 m wide; the macro colour at its centre, its value
// jittered by up to 10% and its temperature a little (a painter's strokes vary: with the centre's colour alone they
// changed the frame by about a level, too little to judge). A stroke reaches at most 1.65 m from its centre (half its
// length and its soft edge), so a texel reads its cell's 3x3 neighbours; they are laid over in the order of a hash
// of their cell (a fixed order by position would let one direction win every overlap). The snow's lie stays the
// texel's own.
#define STROKE_CELL 2.0
float strokeHash(vec2 p){vec3 q=fract(vec3(p.xyx)*0.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec3 strokes(vec2 xz,vec3 c,float px){
  vec2 cell=floor(xz/STROKE_CELL);vec3 sc[9];float sm[9],sp[9];
  for(int k=0;k<9;k++){
    vec2 id=cell+vec2(float(k-(k/3)*3-1),float(k/3-1));
    vec2 o=(id+vec2(strokeHash(id),strokeHash(id+17.3)))*STROKE_CELL;
    vec4 cv=coverAt(coverWarp(o));
    float a=cv.y>0.5?cv.z:(texM(uGrain,o/60.0,60.0).g-0.5)*6.2831853;
    vec2 u=vec2(cos(a),sin(a)),d=xz-o;
    float hl=0.8+0.6*strokeHash(id+41.9),hw=0.25+0.2*strokeHash(id+73.1);
    // a capsule: the distance past its edge, m, soft over about a texel
    float e=length(vec2(max(abs(dot(d,u))-(hl-hw),0.0),dot(d,vec2(-u.y,u.x))))-hw;
    sm[k]=0.9*(1.0-smoothstep(-0.25,0.25,e));sp[k]=strokeHash(id+59.1);sc[k]=c;
    #ifdef WEBGL2
    // the colour read only where the stroke reaches (every read in macro() passes its derivatives, so is defined in a
    // branch: texM, coverTex)
    if(sm[k]>0.0)
    #endif
    sc[k]=macro(o,0.0,px).rgb*(0.9+0.2*strokeHash(id+97.7))*mix(vec3(0.96,1.0,1.05),vec3(1.04,1.0,0.95),strokeHash(id+5.3));
  }
  for(int i=0;i<8;i++)for(int j=0;j<8;j++)if(j<8-i&&sp[j]>sp[j+1]){
    vec3 tc=sc[j];sc[j]=sc[j+1];sc[j+1]=tc;float t=sm[j];sm[j]=sm[j+1];sm[j+1]=t;t=sp[j];sp[j]=sp[j+1];sp[j+1]=t;}
  for(int k=0;k<9;k++)c=mix(c,sc[k],sm[k]);
  return c;}
#endif
// the bake's texel (src/look/macro.ts): the macro colour, with arm 4's strokes on the tile (on the far ring's 4 m
// texels a stroke is under a texel)
vec4 bakeTexel(vec2 xz,float px){vec4 m=macro(xz,1.0,px);
  #ifdef MACRO_STROKES
  if(px<1.0)m.rgb=strokes(xz,m.rgb,px);
  #endif
  return m;}
// the shader arm's macro, and the bake arm's read, at a point, once a pixel (the colour and the snow's lie both use
// them)
vec2 pMacroXZ=vec2(1e9);vec4 pMacro;
vec4 macroOnce(vec2 xz,float px){if(xz!=pMacroXZ){pMacroXZ=xz;pMacro=macro(xz,0.0,px);}return pMacro;}
#ifdef MACRO_BAKE
// the tile's bake, handing over to the far ring's over the tile's last 60 m (both read always)
vec4 bakeOnce(vec2 xz){if(xz!=pMacroXZ){pMacroXZ=xz;
  pMacro=mix(texM(uMacro,(xz+TILE_HALF)/TILE_W,TILE_W),texM(uMacroFar,xz/FAR_W+0.5,FAR_W),smoothstep(TILE_HALF-60.0,TILE_HALF,max(abs(xz.x),abs(xz.y))));}
  return pMacro;}
#endif
// THE GROUND'S COLOUR the terrain and the shore band start from, by arm (every painted material has one: setArm,
// src/look/macro.ts; with none, the shader arm's)
vec3 groundAt(vec2 xz,float px){
  #if defined(MACRO_BAKE)
  return bakeOnce(xz).rgb;
  #elif defined(MACRO_SHADER)
  return macroOnce(xz,px).rgb;
  #elif defined(MACRO_FLAT)
  float k=coverAt(xz).x;
  #ifdef MACRO_SAB_ONECLASS
  k=0.0;   // the class check's sabotage
  #endif
  return k<0.5?vec3(0.43,0.51,0.24):classColour(k,0.5);
  #else
  return macroOnce(xz,px).rgb;
  #endif
}
// the class the arm paints at a point (the class check's view, MACRO_DEBUG): the warped lookup's, or the flat arm's
float classAt(vec2 xz){
  #if defined(MACRO_FLAT)
  return coverAt(xz).x;
  #else
  return coverAt(coverWarp(xz)).x;
  #endif
}
// the snow's lie at a point (added to snowAt's threshold through pSnowLie): from the stripes, by arm. Bare ridges in
// snow are the frame's strongest contrast: they fade out sooner than the stripes' colour, as a pixel spans 0.35 to
// 1.2 m (the bake holds them at full strength: the fade is applied here, where the pixel is known)
float snowLie(vec2 xz,float px){
  float k=1.0-smoothstep(0.35,1.2,px);
  #if defined(MACRO_BAKE)
  return lieOf(bakeOnce(xz).a)*k;
  #elif defined(MACRO_SHADER)
  // grass 4 m or more from a field's or a line's cell holds no lie: no macro there (the water's land side asks too)
  vec4 cv=coverAt(xz);if(cv.x<1.5&&cv.w>=4.0&&coverAt(xz+vec2(2.0,0.0)).y+coverAt(xz-vec2(2.0,0.0)).y+coverAt(xz+vec2(0.0,2.0)).y+coverAt(xz-vec2(0.0,2.0)).y<0.5)return 0.0;
  return lieOf(macroOnce(xz,px).a)*k;
  #else
  return 0.0;
  #endif
}
// the ground's colour under a tree or a tuft, for its bounce (nature.frag): the class's flat colour, one read, the same
// in every arm (the arms differ in the ground alone, for the ablation; the full macro per fragment of every instance
// would cost dearly for a value constant over an instance)
vec3 groundBounce(vec2 xz){float k=coverAt(xz).x;return k<0.5?vec3(0.43,0.51,0.24):classColour(k,0.5);}
