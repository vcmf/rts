// THE GROUND'S MACRO COLOUR (docs/plans/active/l5-macro.md, L5a; docs/proposals/prepainted-terrain.md): the colour
// of what covers the ground (src/look/world/cover.ts), before the banks, the steep ground, the seasons and the light.
// Colour only: the light stays at runtime (paint()). Included by shore.glsl, after the meadow it starts from.
// One function, macro(xz, q), paints it: the bake (src/look/macro.ts) renders it with q = 1 into a texture; the
// shader arm runs it with q = 0 per pixel. The arms (one define, the page's ?macro):
//   MACRO_FLAT    each class's colour alone (no variation, stripes, wear or broken edges): the ablation's arm 1
//   MACRO_SHADER  macro(xz, 0) per pixel: arm 2
//   MACRO_BAKE    the bake, read: arm 3, and arms 4 and 5 (L5b), whose bakes differ (MACRO_STROKES below; the
//                 Kuwahara pass in src/look/macro.ts)
// the cover grid (nearest): class, field id, furrow direction, wear distance; uCoverBox its place: corner, side, cell
// (m: the per-frame cover about the window, a map world's far ring and its bake its whole map's: src/look/macro.ts)
uniform sampler2D uCover;uniform vec4 uCoverBox;
// the snow's lie's zero, a byte (128/255), and under a byte from it the lie is 0: off the fields the bake's 8 bits
// then read 0, so snowAt keeps its own edge there, as the water's shore band does (the seam)
#define LIE0 0.50196078
float lieOf(float a){float d=a-LIE0;return abs(d)<0.003?0.0:d*1.2;}
#ifdef MACRO_BAKE
uniform sampler2D uMacro,uMacroFar;   // the bakes: the tile at SPEC.macro.texel, the far ring at SPEC.macro.far
#endif
// the cover cell at a world point: class (0..9), field id (0 off fields, else a hash in 1..255), furrow direction
// (rad; on a building's yard, B the building it shows: src/look/world/cover.ts), wear distance (m, to the nearest road,
// track or village ground; on a yard to the nearest road or track alone; 25.5 at or past its reach)
// (nearest, no mips: on WebGL2 read with zero derivatives, so a read in a branch the pixels of a quad take differently
// is defined, as arm 4's strokes do)
#ifdef WEBGL2
vec4 coverTex(vec2 uv){return textureGrad(uCover,uv,vec2(0.0),vec2(0.0));}
#else
vec4 coverTex(vec2 uv){return texture2D(uCover,uv);}
#endif
vec4 coverAt(vec2 xz){vec4 t=coverTex((xz-uCoverBox.xy)/uCoverBox.z);return vec4(floor(t.r*255.0+0.5),floor(t.g*255.0+0.5),t.b*3.14159265,t.a*25.5);}
// THE SOIL (docs/plans/done/bare-earth.md): the colour of bare ground, where nothing grows, by its material (the map
// engine's ground material: loam, clay, sand, gravel, rock, peat, earth). Today's cover has no material: every class
// is loam (earth, the map engine's yard, paints as loam). v in 0..1 its variation. Its surface up close: earthOn
#define SOIL_LOAM 0.0
vec3 soilColour(float m,float v){
  return mix(vec3(0.53,0.44,0.33),vec3(0.62,0.52,0.38),v);}   // loam: dry, warm earth (the owner's reference, its value: data/ground-earth-v1.png)
// a class's colour; v in 0..1 its variation (0.5: the flat arm's)
vec3 classColour(float k,float v){
  return k<1.5?mix(vec3(0.27,0.43,0.21),vec3(0.38,0.50,0.25),v)      // pasture (0 is the meadow: groundMeadow)
        :k<2.5?mix(vec3(0.17,0.29,0.22),vec3(0.25,0.36,0.25),v)      // wood floor
        :k<3.5?mix(vec3(0.57,0.50,0.39),vec3(0.62,0.55,0.44),v)      // road: beige earth (docs/plans/done/roads.md: the near tile paints
                                                                       // its tracks over it, roadPaint in shore.glsl, on the same earth), no
                                                                       // blue near the French coat's hue
        :k<4.5?mix(vec3(0.63,0.55,0.43),vec3(0.68,0.60,0.47),v)      // track: the track's earth (TRACK_EARTH in shore.glsl, docs/plans/done/roads.md)
        :k<5.5?mix(vec3(0.45,0.41,0.34),vec3(0.53,0.48,0.39),v)      // village ground (trodden earth: cellColour mixes grass in), darker
                                                                       // than the Austrian white in autumn too (the guard: it keeps its earth)
        :k<6.5?mix(vec3(0.51,0.47,0.32),vec3(0.57,0.52,0.36),v)      // wheat: olive-gold straw (the warm sun turns it gold), between the dark coats and the white
        :k<7.5?mix(vec3(0.37,0.50,0.20),vec3(0.45,0.56,0.24),v)      // green crop
        :k<8.5?mix(vec3(0.60,0.59,0.50),vec3(0.67,0.65,0.55),v)      // stubble: grey straw (the warm sun turns pale straw orange)
        :k<9.5?mix(vec3(0.58,0.48,0.36),vec3(0.64,0.53,0.40),v)       // ploughed: dry earth, lighter than the dark coats
        :soilColour(SOIL_LOAM,v);                                     // bare: trodden, dry earth, no grass (its surface: earthOn)
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
float stripeValue(float k){return k<6.5?0.05:k<7.5?0.06:k<8.5?0.06:k<9.5?0.09:0.0;}   // bare: none
float stripeSnow(float k){return k<8.5?0.3:0.5;}
// roads, tracks and the village ground are trodden: they hold less snow, so they still read in winter
float trodden(float k){return k>2.5&&k<3.5?0.45:k>3.5&&k<4.5?0.35:k>4.5&&k<5.5?0.2:k>9.5?0.3:0.0;}   // bare: as a track
// worn grass near roads, tracks and the village: thinning to trodden earth over a few metres, broken by the grain
vec3 wear(vec3 c,vec4 cv,Grain g){
  float w=1.0-smoothstep(0.5,4.0,cv.w+(g.wear-0.5)*3.0);
  return cv.x>1.5?c:mix(c,vec3(0.56,0.53,0.45),w*(0.3+0.4*g.wearDab));}
// the class lookup's point, pushed by the grain's soft blotches (±1.5 m) so a class edge wanders like a painted one
#ifdef RELIEF
// THE RELIEF'S TONE (src/look/relief.ts; ?relief, src/look/main.ts): R the hillshade, G the crest, 0.5 flat; lighter
// turned to the sun and on a crest, darker turned away and in a valley, which is also a little cooler; uReliefK its
// strength. Baked into the macro colour (src/look/macro.ts); the shader arm's colour (groundAt) and the live roads'
// and yards' paint (shore.glsl) take it too, so they match the ground beside them
uniform sampler2D uRelief;uniform float uReliefK;
vec3 reliefTone(vec3 c,vec2 xz){vec2 r=(texture2D(uRelief,(xz-FAR_O)/FAR_W).rg-0.5)*2.0;
  c*=clamp(1.0+uReliefK*(0.9*r.x+0.25*r.y),0.7,1.3);   // (never so dark a valley turns black)
  return mix(c,c*vec3(0.9,0.96,1.06),uReliefK*0.6*max(0.0,-r.y));}
#endif
vec2 coverWarp(vec2 xz){return xz+(vec2(blot(xz,23.0),blot(xz+11.0,23.0))-0.5)*COVER_WARP;}
// The class colour's warp (macro(), and the views that show its classes). A map world's cover is finer than the demo's
// (src/look/world/from-map.ts, MAP_COVER_CELL): there a second, fine warp (blotches 2.5 m across, COVER_FINE) breaks a
// slanted class edge's cell steps into a painted wander; the slow warp alone moves the steps but keeps their shape.
// Off on the demo's cover (its cells COVER_CELL) and on WebGL1. Only the class colour takes it: on the bake's arm (the
// default) that is once, at the bake; the per-frame reads (the dirt's gate, the roads') keep the slow warp alone
vec2 coverWarpFine(vec2 xz){
  vec2 w=coverWarp(xz);
  #ifdef WEBGL2
  if(uCoverBox.w<COVER_CELL-0.01)w+=(vec2(blot(xz+5.3,2.5),blot(xz+17.9,2.5))-0.5)*COVER_FINE;
  #endif
  return w;}
// THE DIRT SURFACE (docs/plans/done/ground-surface.md): where the ground is bare (a track, the village's trodden
// ground, ploughed land, bare earth, a little on the road, the worn ground by the lines), the dirt texture (the
// owner's, scratches, drag marks and splats, about DIRT_M m a repeat) in its value, around 1 so the class colour holds
// on average. Mipmapped: its fine marks average out where a pixel spans them, so they do not flicker
// the ground's surfaces, packed (src/look/macro.ts, one texture unit for two: decision 0049): R the dirt, G the earth
uniform sampler2D uSurf;uniform float uDirtOn;   // 1 once the dirt texture has loaded (src/look/macro.ts)
uniform float uEarthOn;   // the earth's surface (earthOn, below): 1 once its texture has loaded
// how far a pixel of macro colour c takes the earth's cracks (earthOn), at footprint px: the colour is the mask (the bake
// painted the soil where the ground is bare), as far as it reads as bare loam (its red over its green by 1.10 to 1.18:
// the grass, wheat, stubble and village stay under) and is no saturated colour (a meadow's orange flower is no earth:
// the soil's red over its blue is under half its red), up close (from a 6 to a 25 cm footprint). The dirt (dirtOn)
// hands over to the cracks by this one weight
float earthWeight(vec3 c,float px){
  return smoothstep(1.10,1.18,c.r/max(c.g,0.01))*(1.0-smoothstep(0.5,0.6,(c.r-c.b)/max(c.r,0.01)))*(1.0-smoothstep(0.06,0.25,px))*uEarthOn;}
const float DIRT_M=15.0;
// a class's bareness: 1 on track, village, ploughed and bare, a little on the road (dust). The worn ground by the lines
// takes the dirt's marks by wearOf
float classBare(float k){return k>3.5&&k<4.5?1.0:k>4.5&&k<5.5?1.0:k>8.5?1.0:k>2.5&&k<3.5?0.4:0.0;}
float wearOf(vec4 cv){return (1.0-smoothstep(0.5,4.0,cv.w))*0.5*step(cv.x,1.5);}
// px: the pixel's footprint (m): the marks fade out as it spans them (the mipmap averages them to their mean)
vec3 dirtOn(vec3 c,vec2 xz,float px){
  #if defined(MACRO_FLAT)||defined(MACRO_SAB_ONECLASS)
  return c;   // the flat arm and the class check's sabotage: the class colour alone
  #endif
  float fade=(1.0-smoothstep(0.35,0.9,px))*uDirtOn;if(fade<=0.0)return c;
  // the unwarped cell and its four corners 1.5 m off (the warp's reach) first, five cheap reads: most ground is grass
  // far from a line and returns here. The warped lookup (four more reads) only near bare ground, so its edge wanders as
  // the macro colour's does
  vec4 c0=coverAt(xz);
  float near=classBare(c0.x)+classBare(coverAt(xz+vec2(1.5)).x)+classBare(coverAt(xz-vec2(1.5)).x)+classBare(coverAt(xz+vec2(1.5,-1.5)).x)+classBare(coverAt(xz+vec2(-1.5,1.5)).x);
  if(near<=0.0&&c0.w>=7.0)return c;   // the wear's reach (4 m) and the warp's to another cell's centre (2.8 m)
  vec4 cv=coverAt(coverWarp(xz));float k=cv.x,b=classBare(k);
  if(k>4.5&&k<5.5)b*=smoothstep(0.42,0.6,blot(xz+0.7,13.0));   // the village: its trodden patches, not the grass between (cellColour)
  #ifdef WEBGL2
  if(k>2.5&&k<4.5)b*=smoothstep(TILE_HALF-30.0,TILE_HALF-4.0,max(abs(xz.x),abs(xz.y)));   // on the tile the roads are painted (roadPaint, live or baked: shore.glsl), their own grit
  #endif
  b=max(b,wearOf(cv))*fade*(1.0-earthWeight(c,px));if(b<=0.0)return c;   // (where the cracks lie, not the dirt too)
  // two reads at unrelated scales and offsets, so the texture's own marks (a dark smear) do not repeat in rows, about
  // its measured mean (0.458), so the class colour holds on average
  float d=(texM(uSurf,xz/DIRT_M,DIRT_M).r+texM(uSurf,xz/(DIRT_M*1.618)+vec2(0.37,0.61),DIRT_M*1.618).r)*0.5;
  return c*mix(1.0,clamp(1.0+(d-0.458)*0.8,0.6,1.35),b);}
// (colour, the snow's lie as LIE0 + lie/1.2). q 1: the bake's, the edges blended over 9 taps a metre apart with a
// darker margin where classes meet (a headland or a verge); q 0: one tap. px: the footprint, m (the bake's texel, or
// the pixel's)
#if defined(MEADOW)&&(defined(MEADOW_UNDER)||defined(GRASS_FLOW)||defined(MEADOW_MAP))
// the meadow map (src/look/meadow.ts: G the grass's growth, B its height factor, A the crop's): the ground's
// under-layer (shore.glsl), the bare ground where nothing grows (bareOf) and the combed meadow's strokes (groundAt)
// read it (MEADOW_MAP: the bake, src/look/macro.ts)
uniform sampler2D uMeadow;
#define HAS_MEADOW_MAP
// the meadow map's texel at a point, read once a pixel (the bare earth, the under-layer and the strokes share it)
vec2 pMeadowXZ=vec2(1e9);vec4 pMeadow;
vec4 meadowTexel(vec2 xz){if(xz!=pMeadowXZ){pMeadowXZ=xz;pMeadow=texture2D(uMeadow,(xz+TILE_HALF)/TILE_W);}return pMeadow;}
#endif
#ifdef HAS_MEADOW_MAP
// how much grass grows at a point, 0..1 (the meadow map: none in the formation zones and on the banks); beyond the tile
// it counts as growing, faded in over its last 10 m, so a zone or a bank meeting the edge leaves no seam
float meadowGrowth(vec2 xz){
  float edge=smoothstep(TILE_HALF-11.0,TILE_HALF-1.0,max(abs(xz.x),abs(xz.y)));
  return mix(edge<1.0?smoothstep(0.15,0.7,meadowTexel(xz).g):1.0,1.0,edge);}
// the same, read apart from the pixel's one cached texel (the bake's several taps round a point: bareOf)
float growthAt(vec2 xz){
  float edge=smoothstep(TILE_HALF-11.0,TILE_HALF-1.0,max(abs(xz.x),abs(xz.y)));
  return mix(edge<1.0?smoothstep(0.15,0.7,texture2D(uMeadow,(xz+TILE_HALF)/TILE_W).g):1.0,1.0,edge);}
// the bareness at a point of class k: a grassy class (meadow, pasture, a copse's floor) by the grass that does not
// grow there, its edge wandering by the grain (no line along the map's texels), the bare class whole
// (the growth at the cover's warped point, four taps a metre apart: the map's 2 m cells would step along a diagonal
// edge, so the earth's edge wanders as the classes' do. Where the macro colour is made: the bake, or the shader arm)
// Beyond the meadow map (the tile: past it, and over its last 10 m, the growth counts as whole), the margins from the
// cover itself, by the same rule the grass is placed by (src/look/nature.ts coverAllows: every point 2.5 m round a
// grassy class, so no seam where the map ends and the far ring has its margins too). w: the cover's warped point
// (coverWarp, as macro() reads the class)
float bareOf(float k,vec2 xz,vec2 w){if(k>9.5)return 1.0;if(k>2.5)return 0.0;
  float gr=0.25*(growthAt(w+vec2(1.0))+growthAt(w-vec2(1.0))+growthAt(w+vec2(1.0,-1.0))+growthAt(w+vec2(-1.0,1.0)));
  // (the far bake's texel is 4 m: a 2.5 m margin covers part of one, so it paints as part soil, by the share of the
  // ring round it that is another class)
  float te=smoothstep(TILE_HALF-11.0,TILE_HALF-1.0,max(abs(w.x),abs(w.y)));
  if(te>0.0){float n=0.0;for(int i=0;i<8;i++){float a=float(i)*0.7853982;n+=step(coverAt(w+vec2(cos(a),sin(a))*2.5).x,2.5);}
    gr=min(gr,mix(1.0,1.0-0.7*(1.0-smoothstep(4.0,8.0,n)),te));}
  if(gr>=1.0)return 0.0;
  return 1.0-smoothstep(0.0,1.0,gr+(texM(uGrain,xz/9.0+0.21,9.0).g-0.5)*0.6*(1.0-gr));}
#endif
// THE EARTH'S SURFACE up close (docs/plans/done/bare-earth.md): the owner's cracked earth (data/ground-earth-v1.png,
// its value) multiplies bare ground's value, about its mean (0.632) so the soil's colour holds on average, read twice
// at unrelated scales and offsets (no repeat in rows), fading out as the pixel spans it (the mipmap keeps the mean).
// Bare ground: the bare class, and a grassy class where nothing grows (bareOf), the earth texture being loam (soilColour)
const float EARTH_M=5.0;
vec3 earthOn(vec3 c,vec2 xz,float px){
  #if defined(MACRO_FLAT)||defined(MACRO_SAB_ONECLASS)
  return c;
  #endif
  float e=earthWeight(c,px);if(e<=0.0)return c;   // (the mask: earthWeight, above)
  // (the second read turned: its gradients turned with it, for the anisotropic filter)
  mat2 R=mat2(0.8253,-0.5646,0.5646,0.8253);vec2 u2=R*xz/(EARTH_M*1.618)+vec2(0.37,0.61);
  #ifdef WEBGL2
  float d2=textureGrad(uSurf,u2,R*pMdx/(EARTH_M*1.618),R*pMdy/(EARTH_M*1.618)).g;
  #else
  float d2=texture2D(uSurf,u2).g;
  #endif
  float d=texM(uSurf,xz/EARTH_M,EARTH_M).g*0.6+d2*0.4;
  return c*mix(1.0,clamp(1.0+(d-0.632)*1.3,0.45,1.4),e);}
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
// the brush pattern of the default: the tile at two unrelated scales and turns, warped by a slow noise (meadowPattern, and the
// combed meadow's short grass)
float meadowBrush(vec2 xz,float px){
  vec2 w=(vec2(mValue(xz/23.0),mValue(xz/23.0+41.0))-0.5)*3.0;
  return brushAt((xz+w)/7.3,7.3,px)*0.6+brushAt(mat2(0.8253,-0.5646,0.5646,0.8253)*(xz-w)/(7.3/2.618)+0.37,7.3/2.618,px)*0.4;}
#ifdef GRASS_FLOW
// the combed meadow's broad part, a multiplier (in the bake, meadowPattern): soft bands where the flow leans to or from
// the sun, soft masses (where no grass grows groundAt divides it out, so the ground there is as the default)
float combBroad(vec2 xz){vec3 fl=flowTex(xz);return (1.0+0.1*dot(fl.xy,FLOW_SUN)*mix(0.35,1.0,fl.z))*mix(0.93,1.07,mValue(xz/11.0+3.0));}
// the brush combed along the flow (?grass=flow, docs/plans/done/grass-flow.md): each FLOW_CELL m cell reads the tile
// in its own frame, turned to the flow at its centre and stretched along it (a varying turn of one frame would smear
// far from the origin), the four nearest blended bilinearly with their contrast kept (the sum's spread over the
// weights' norm, about the tile's mean), at the two scales of the default; on near pixels only (strokeK)
#define FLOW_CELL 5.0
// x: the brush, combed; y: the comb's own strokes, value noise stretched seven times along the flow (3.5 m by 0.5 m),
// about 0.5 (blended as the brush); 3 reads a cell, 12 a pixel
uniform sampler2D uComb;   // the comb's noise, tiling (src/look/flow.ts: COMB_PERIOD lattice cells a repeat, a define)
float combAt(vec2 p,float o){
  #ifdef WEBGL2
  vec4 t=textureLod(uComb,p/COMB_PERIOD,0.0);
  #else
  vec4 t=texture2D(uComb,p/COMB_PERIOD);
  #endif
  return o>0.5?t.g:t.r;}
vec2 combedBrush(vec2 xz,float px){
  vec2 g=xz/FLOW_CELL-0.5,id=floor(g),f=fract(g);float s=0.0,sc=0.0,ww=0.0;
  for(int k=0;k<4;k++){
    vec2 o=vec2(float(k-(k/2)*2),float(k/2)),cc=(id+o+0.5)*FLOW_CELL;
    float w=(o.x>0.5?f.x:1.0-f.x)*(o.y>0.5?f.y:1.0-f.y);
    vec2 u=flowTex(cc).xy,d=xz-cc,l=vec2(dot(d,u)/3.0,dot(d,vec2(-u.y,u.x)))+vec2(mHash(id+o),mHash(id+o+7.7))*7.3;
    float b=brushAt(l/(7.3/2.618)+0.37,7.3/2.618,px);   // (one scale, the finer: the strokes show up close)
    vec2 dl=vec2(dot(d,u),dot(d,vec2(-u.y,u.x)))+vec2(mHash(id+o+3.1),mHash(id+o+9.4))*40.0;
    float cm=combAt(vec2(dl.x/3.5,dl.y/0.5),0.0);   // (one octave)
    s+=(b-0.585)*w;sc+=(cm-0.5)*w;ww+=w*w;}
  float n=1.0/sqrt(max(ww,1e-4));
  return vec2(0.585+s*n,0.5+sc*n);}
#endif
#ifdef GRASS_FLOW
// the strokes by the footprint px (m a pixel): whole up close, gone by the default zoom's far half, so the widest
// zooms see the soft masses and bands, not hundreds of 5 m strokes (the owner, 2026-10-17: zoomed out "weird"); the
// bake's texel (0.5 m) is past the fade, so the bake holds none: the bake arm adds them at runtime (groundAt)
float strokeK(float px){return 1.0-smoothstep(STROKE_FOOT*0.07/0.15,STROKE_FOOT,px);}   // (STROKE_FOOT 0.15 m: src/look/main.ts)
// the strokes' multiplier at a point: lighter along the comb, a deeper green in its gaps (never toward black: the
// owner, "use a darker green"), k their weight (strokeK)
// the strokes' value at a point, signed, at full weight (the near bake renders it: src/look/macro.ts, combNear)
float combDv(vec2 xz,float px){vec3 fl=flowTex(xz);vec2 cb=combedBrush(xz,px);return ((cb.x-0.585)*0.6+(cb.y-0.5)*mix(0.35,0.8,fl.z))*0.6;}   // 0.6: the strides softer, the near grass carries the look (the owner)
#endif
#if defined(MEADOW)&&defined(GRASS_FLOW)
// the strokes multiplier from their value dv at its weight: lighter along the comb, a deeper green in its gaps
vec3 combFromDv(float dv){float deep=1.0-smoothstep(-0.22,0.0,dv);return (1.0+max(dv,0.0)*1.25)*mix(vec3(1.0),vec3(0.70,0.86,0.66),deep);}
// the near bake (combNear): the strokes value over a square round the focus (uCombNearRect: its corner x0, z0 and side,
// m; 0 outside)
uniform sampler2D uCombNear;uniform vec4 uCombNearRect;
float nearComb(vec2 xz){vec2 uv=(xz-uCombNearRect.xy)/uCombNearRect.z;
  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)return 0.0;return texture2D(uCombNear,uv).r;}
#endif
vec3 meadowPattern(vec3 c,float k,vec2 xz,float px){
  float gr=k<0.5?1.0:k<1.5?0.75:0.0;if(gr<=0.0)return c;
  float b=meadowBrush(xz,px);
  float cl=mix(clumpAt(xz),mValue(xz/3.2),smoothstep(0.35,1.2,px));
  float t=(1.0+(b-0.585)*1.1)*mix(0.93,1.07,cl);   // the gain makes up the contrast the bake texel blurs away
  // the combed meadow (docs/plans/done/grass-flow.md), in the bake (the shader arm keeps the default pattern): where
  // grass grows the broad soft bands where the flow leans to or from the sun (fixed per map), soft masses and the clump
  // field; where none grows (the zones, the banks) the default pattern exactly. The strokes: at runtime (groundAt)
  #if defined(GRASS_FLOW)&&!defined(MACRO_SHADER)
  t=mix(t,combBroad(xz)*mix(0.93,1.07,clumpAt(xz)),meadowGrowth(xz));
  #endif
  return c*mix(1.0,t,gr);}
#endif
vec4 macro(vec2 xz,float q,float px){
  vec2 w=coverWarpFine(xz);vec4 cv=coverAt(w);Grain g=grainAt(xz);vec3 c;float e=0.0;
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
  #ifdef HAS_MEADOW_MAP
  // bare where nothing grows: a grassy class's ground with no grass on it (a formation zone, a bank, a field's margin:
  // the meadow map's growth) is the soil, not the grass's green (the owner, 2026-10-18)
  e=bareOf(cv.x,xz,w);if(e>0.0)c=mix(c,soilColour(SOIL_LOAM,smoothstep(0.3,0.7,g.v)),e);
  #endif
  // (bare soil on a grassy class keeps that class's snow: whole. Trodden as the bare class, a formation zone's breadth
  // of snow showed the snow's own pattern repeating, docs/plans/done/bare-earth.md)
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
    vec4 cv=coverAt(coverWarpFine(o));
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
// the tile's bake, handing over to the far ring's over the tile's last 60 m: each read only where it has weight (texM
// takes its own gradients under WebGL2: safe in a branch), the same colour with one read fewer nearly everywhere
vec4 bakeOnce(vec2 xz){if(xz!=pMacroXZ){pMacroXZ=xz;
  float w=smoothstep(TILE_HALF-60.0,TILE_HALF,max(abs(xz.x),abs(xz.y)));
  #ifdef WEBGL2
  vec4 a=w<1.0?texM(uMacro,(xz+TILE_HALF)/TILE_W,TILE_W):vec4(0.0),b=w>0.0?texM(uMacroFar,(xz-FAR_O)/FAR_W,FAR_W):vec4(0.0);
  pMacro=mix(a,b,w);   // the side not read has no weight
  #else
  pMacro=mix(texM(uMacro,(xz+TILE_HALF)/TILE_W,TILE_W),texM(uMacroFar,(xz-FAR_O)/FAR_W,FAR_W),w);   // WebGL1: texture2D takes its gradients from the quad, so both read always
  #endif
  }
  return pMacro;}
#endif
// THE GROUND'S COLOUR the terrain and the shore band start from, by arm (every painted material has one: setArm,
// src/look/macro.ts; with none, the shader arm's)
vec3 groundAt(vec2 xz,float px){
  #if defined(MACRO_BAKE)&&defined(MEADOW)&&defined(GRASS_FLOW)
  // the strokes of the comb on the bake (which holds the rest: meadowPattern): the tops of grass that stands, so by
  // the growth of the meadow (the owner, 2026-10-17: the strokes alone, with no grass, looked wrong. The growth keeps to
  // meadow and pasture and fades over their edges), by the footprint (strokeK: near pixels only), none under the snow
  // And by the clumps around them: the rings are centred on the focus, not the camera, so the ground at the bottom of the
  // frame stands under the sparser outer rings (the owner, 2026-10-18: strides at the bottom with no grass). Over the
  // inner ring only (STROKE_RINGS: its fade out, m from the focus)
  float rd=length(xz-uFocus.xz),ring=1.0-smoothstep(STROKE_RINGS.x,STROKE_RINGS.y,rd);
  vec3 g=bakeOnce(xz).rgb;float sk=strokeK(px)*ring*(1.0-smoothstep(2.0,2.8,uSeason));
  #ifdef GRASS_NO_STROKES
  sk=0.0;
  #endif
  // (the growth read only where it is used: the strokes, and the autumn value-keeping, groundSeason; a summer pixel past
  // the strokes skips it: on every ground pixel it cost up to 0.9 ms, the paired bench, docs/plans/done/dof-v2.md)
  float grow=sk>0.0||uSeason>0.0?meadowGrowth(xz):1.0;pFlowGrow=grow;
  if(sk*grow>0.0)g*=combFromDv(nearComb(xz)*sk*grow);   // (one read: the near bake, src/look/macro.ts)
  return g;
  #elif defined(MACRO_BAKE)
  return bakeOnce(xz).rgb;
  #elif defined(MACRO_SHADER)
  #ifdef RELIEF
  return reliefTone(macroOnce(xz,px).rgb,xz);
  #else
  return macroOnce(xz,px).rgb;
  #endif
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
  return coverAt(coverWarpFine(xz)).x;
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
