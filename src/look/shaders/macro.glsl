// THE GROUND'S MACRO COLOUR (docs/plans/active/l5-macro.md, L5a; docs/proposals/prepainted-terrain.md): the colour
// of what covers the ground (src/look/world/cover.ts), before the banks, the steep ground, the seasons and the light.
// Colour only: the light stays at runtime (paint()). Included by shore.glsl, after the meadow it starts from.
// One function, macro(xz, q), paints it: the bake (src/look/macro.ts) renders it with q = 1 into a texture; the
// shader arm runs it with q = 0 per pixel. The arms (one define, the page's ?macro):
//   MACRO_FLAT    each class's colour alone (no variation, stripes, wear or broken edges): the ablation's arm 1
//   MACRO_SHADER  macro(xz, 0) per pixel: arm 2
//   MACRO_BAKE    the bake, read: arm 3
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
vec4 coverAt(vec2 xz){vec4 t=texture2D(uCover,xz/FAR_W+0.5);return vec4(floor(t.r*255.0+0.5),floor(t.g*255.0+0.5),t.b*3.14159265,t.a*25.5);}
// a class's colour; v in 0..1 its variation (0.5: the flat arm's)
vec3 classColour(float k,float v){
  return k<1.5?mix(vec3(0.27,0.43,0.21),vec3(0.38,0.50,0.25),v)      // pasture (0 is the meadow: groundMeadow)
        :k<2.5?mix(vec3(0.17,0.29,0.22),vec3(0.25,0.36,0.25),v)      // wood floor
        :k<3.5?mix(vec3(0.63,0.60,0.53),vec3(0.70,0.67,0.59),v)      // road: pale dust, cooler than the meadow's golds
        :k<4.5?mix(vec3(0.58,0.56,0.48),vec3(0.66,0.63,0.54),v)      // track
        :k<5.5?mix(vec3(0.50,0.46,0.38),vec3(0.58,0.53,0.43),v)      // village ground (trodden earth: cellColour mixes grass in)
        :k<6.5?mix(vec3(0.51,0.47,0.32),vec3(0.57,0.52,0.36),v)      // wheat: olive-gold straw (the warm sun turns it gold), between the dark coats and the white
        :k<7.5?mix(vec3(0.37,0.50,0.20),vec3(0.45,0.56,0.24),v)      // green crop
        :k<8.5?mix(vec3(0.60,0.59,0.50),vec3(0.67,0.65,0.55),v)      // stubble: grey straw (the warm sun turns pale straw orange)
        :mix(vec3(0.58,0.48,0.36),vec3(0.64,0.53,0.40),v);           // ploughed: dry earth, lighter than the dark coats
                                                                       // (the readability guard, tools/guard.mjs --view cover)
}
// the grain's soft blotches at about scale s m without its repeat: G(xz/s) tiles every s m, so two reads at
// unrelated scales are mixed wherever a repeat would show
float blot(vec2 xz,float s){return G(xz/s).g*0.6+G(xz/(s*2.618)+0.37).g*0.4;}
// The grain at a point, read once and outside any branch: a texture read in a branch the pixels of a 2×2 quad take
// differently (a class edge) has undefined derivatives, and on some GPUs a different result each run (the bake was not
// deterministic). Every function below is arithmetic on these.
struct Grain{vec3 meadow;float v,village,stripe,wear,wearDab;};
Grain grainAt(vec2 xz){return Grain(groundMeadow(xz),G(xz/90.0).g,blot(xz+0.7,13.0),blot(xz,17.0),blot(xz+0.3,6.0),blot(xz+0.6,2.7));}
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
vec4 macro(vec2 xz,float q,float px){
  vec2 w=coverWarp(xz);vec4 cv=coverAt(w);Grain g=grainAt(xz);vec3 c;
  if(q>0.5){
    c=vec3(0.0);float other=0.0;
    for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 o=vec2(float(i),float(j));vec4 t=coverAt(w+o);
      c+=cellColour(t,g);other+=step(0.5,abs(t.x-cv.x)+abs(t.y-cv.y));}
    c/=9.0;c*=1.0-0.10*smoothstep(0.0,4.0,other)*(1.0-smoothstep(4.0,9.0,other));
  }else c=cellColour(cv,g);
  float b=stripeBand(cv,xz,px,g);c*=1.0+stripeValue(cv.x)*b;c=wear(c,cv,g);
  return vec4(c,LIE0-(b*stripeSnow(cv.x)+trodden(cv.x))/1.2);}
// the shader arm's macro at a point, once a pixel (the colour and the snow's lie both read it; every pixel of a quad
// takes the first call's branch, so the grain's reads keep their derivatives)
vec2 pMacroXZ=vec2(1e9);vec4 pMacro;
vec4 macroOnce(vec2 xz,float px){if(xz!=pMacroXZ){pMacroXZ=xz;pMacro=macro(xz,0.0,px);}return pMacro;}
// THE GROUND'S COLOUR the terrain and the shore band start from, by arm; past them all, main's (groundBase)
vec3 groundAt(vec2 xz,float px){
  #if defined(MACRO_BAKE)
  // the tile's bake, handing over to the far ring's over the tile's last 60 m (both read always: a texture read in a
  // branch some pixels of a quad skip has no derivatives)
  vec3 a=texture2D(uMacro,(xz+TILE_HALF)/TILE_W).rgb,b=texture2D(uMacroFar,xz/FAR_W+0.5).rgb;
  return mix(a,b,smoothstep(TILE_HALF-60.0,TILE_HALF,max(abs(xz.x),abs(xz.y))));
  #elif defined(MACRO_SHADER)
  return macroOnce(xz,px).rgb;
  #elif defined(MACRO_FLAT)
  float k=coverAt(xz).x;
  #ifdef MACRO_SAB_ONECLASS
  k=0.0;   // the class check's sabotage
  #endif
  return k<0.5?vec3(0.43,0.51,0.24):classColour(k,0.5);
  #else
  return groundBase(xz);
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
  float a=texture2D(uMacro,(xz+TILE_HALF)/TILE_W).a,b=texture2D(uMacroFar,xz/FAR_W+0.5).a;
  return lieOf(mix(a,b,smoothstep(TILE_HALF-60.0,TILE_HALF,max(abs(xz.x),abs(xz.y)))))*k;
  #elif defined(MACRO_SHADER)
  return lieOf(macroOnce(xz,px).a)*k;
  #else
  return 0.0;
  #endif
}
