// The shore band (docs/plans/done/w4-water-surface.md): within WATER_BAND m of the shoreline the tile's terrain and
// the water paint the same colour, from inputs both have at a world point (the water data, the bank normals, the
// light map, the paint grain), so the shore is painted from the data whichever surface the depth test keeps. Where
// the two surfaces meet on screen they intersect, so they share the point there and the colours match.
// BANKN: the fine bank normals (docs/plans/done/w2-river-banks.md); BANKN_OFF, the bank check's sabotage, leaves
// the given normal. SHORE: the band itself (needs the water data, WATERDATA, and the bank normals).
// Derivatives (paint()'s, the grain's mip levels, aastep's) are undefined in a branch some pixels of a 2×2 quad skip,
// so every branch here and in its callers reaches past where what it computes has weight by 1.5 times the deciding
// value's screen derivative (fw: fwidth of the shore distance, taken outside any branch): a quad with one pixel that
// needs the branch takes it whole (the shore distance changes across a quad by at most its fwidth).
// Hard edges threshold the grain's soft blotches (G), never its per-texel noise (R): that speckles under a pixel.
// fwidth on WebGL1 needs GL_OES_standard_derivatives: the including shaders enable it (Babylon drops the line on
// WebGL2).
#ifdef BANKN
#ifndef BANKN_OFF
uniform sampler2D uBankN;   // x, z of the authored surface's normal, the weight
#endif
vec3 bankNormal(vec3 N,vec2 xz){
  #ifdef BANKN_OFF
  return N;
  #else
  vec4 bk=texture2D(uBankN,(xz+TILE_HALF)/TILE_W);vec2 b=bk.xy*2.0-1.0;
  return normalize(mix(N,vec3(b.x,sqrt(max(0.0,1.0-dot(b,b))),b.y),bk.z));
  #endif
}
#endif
// a pixel's footprint on the ground, m: thin painted marks widen or fade with it (a mark under a pixel shimmers)
float pxGround(vec3 wp){vec2 f=fwidth(wp.xz);return max(f.x,f.y);}
// the ground's colour through the seasons (summer, early and late autumn, winter: uSeason 0..3), for the terrain and
// the shore band alike
// The season turns what is green (docs/plans/done/ground-surface.md): a colour takes the whole turn as far as it is
// green, a quarter of it where it is not (bare earth, stone, gravel, a cut bank, dry gold), so a ploughed field or a bank
// does not melt into the autumn meadow, smoothly across every edge
vec3 groundSeason(vec3 c){
  vec3 au=mix(c,vec3(0.68,0.59,0.37),0.78),la=mix(c,vec3(0.52,0.42,0.27),0.6),wi=mix(c,vec3(0.46,0.42,0.34),0.7);
  // the autumn turns (to late autumn) by greenness: a yellow-green counts as green, a grey road, earth, stone and dry gold
  // (green no higher than red or blue) take a quarter. Winter mutes every colour, as before
  float g=mix(0.25,1.0,smoothstep(-0.005,0.03,c.g-max(c.r,c.b)));au=mix(c,au,g);la=mix(c,la,g);
  return uSeason<1.0?mix(c,au,uSeason):uSeason<2.0?mix(au,la,uSeason-1.0):mix(la,wi,uSeason-2.0);}
// The world position's screen derivatives, taken by each shader's main before any branch (macroDerivs): the ground's
// reads (the meadow's here, the macro colour's, src/look/shaders/macro.glsl) pass them explicitly, so a read in a
// branch the pixels of a 2×2 quad take differently (a class edge, the shore band's sides) still picks its mip level
// right. Where no main sets them they are 0, the finest level. Without them, on the Mac's GPU, the macro bake differed
// run to run. WebGL1 has no textureGrad: there the reads take their implicit derivatives.
vec2 pMdx=vec2(0.0),pMdy=vec2(0.0);
void macroDerivs(vec2 xz){pMdx=dFdx(xz);pMdy=dFdy(xz);}
float pxMacro(){return max(abs(pMdx.x)+abs(pMdy.x),abs(pMdx.y)+abs(pMdy.y));}   // the pixel's footprint, m (pxGround's)
// a texture over world space at s m a repeat, uv = xz/s (+ an offset)
#ifdef WEBGL2
vec4 texM(sampler2D t,vec2 uv,float s){return textureGrad(t,uv,pMdx/s,pMdy/s);}
#else
vec4 texM(sampler2D t,vec2 uv,float s){return texture2D(t,uv);}
#endif
// THE GROUND before the banks and the seasons (the terrain's and the shore band's alike): the meadow (yellow-green,
// dry gold, teal-green hollows), its flower patches; the cover over it (L5a) is the macro colour's (macro.glsl)
vec3 groundMeadow(vec2 xz){
  float n1=texM(uGrain,xz/150.0,150.0).g,n2=texM(uGrain,xz/53.0+0.31,53.0).g;
  vec3 c=mix(vec3(0.33,0.45,0.20),vec3(0.55,0.58,0.27),smoothstep(0.35,0.66,n1));      // meadow → yellow-green
  c=mix(c,vec3(0.70,0.64,0.40),smoothstep(0.62,0.76,n2)*0.45);                         // dry gold
  c=mix(c,vec3(0.24,0.40,0.33),smoothstep(0.64,0.80,1.0-n1)*0.6);                      // teal-green hollows
  // flower patches: orange and white flecks (complementary accents)
  float fpat=smoothstep(0.60,0.68,texM(uGrain,xz/70.0+vec2(0.71,0.13),70.0).g);
  float fl=step(0.86,texM(uGrain,xz/1.6,1.6).r)*fpat;c=mix(c,vec3(0.99,0.56,0.14),fl);
  return mix(c,vec3(0.96,0.93,0.84),step(0.93,texM(uGrain,xz/1.3+0.5,1.3).r)*fpat*0.8);}
// steep ground goes stony (ny: the normal's y)
vec3 groundSteep(vec3 c,float ny){return mix(c,vec3(0.55,0.52,0.46),smoothstep(0.80,0.62,ny)*0.5);}
#include<macro>
// the light the ground under a point bounces (LC4): its colour (the class, through the season and the mood's earth,
// toward the snow's white where snow lies there: snowAt) times the light that reaches it (the sun's colour, its light
// map's sun, a third of it in shadow: the sky's), fading with the height h above it (gone by about 8 m). shade: the
// caster's own shadow on that ground, for what the light map does not hold (a unit's shadow side)
vec3 bounceAt(vec2 xz,float y,float h,float shade){
  vec3 g=earthMix(groundSeason(groundBounce(xz)));
  g=mix(g,vec3(0.80,0.81,0.84),snowLies(vec3(0.0,1.0,0.0),vec3(xz.x,y,xz.y)));
  float sun=min(mix(1.0,LM(vec3(xz.x,y,xz.y)).r,uShadowsOn),1.0-shade);   // a caster's own shade, whatever the shadows' switch
  vec3 sunC=uSunCol;
  #ifdef KEEP_HUE
  sunC=mix(vec3(dot(uSunCol,vec3(0.3,0.59,0.11))),uSunCol,uUnitTint);   // units: the sun white-balanced as in their direct light (0027), the ground's own cast whole
  #endif
  return g*sunC*mix(0.35,1.0,sun)*(1.0-smoothstep(0.0,8.0,h));}
// a hard painted edge, anti-aliased over about two pixels (no shimmer when the view moves): 0 below t, 1 above
float aastep(float t,float v){
  #ifdef WATER_SAB_STEP
  return step(t,v);   // the shimmer check's sabotage: aliased edges
  #else
  float w=max(fwidth(v)*1.2,1e-5);return smoothstep(t-w,t+w,v);
  #endif
}
#ifdef ROADS
// THE ROADS (docs/plans/active/roads.md): rutted dirt over the tile, laid in each road's frame (the road frame, built by
// tools/build-look-data.ts, four floats: the signed distance across the nearest line, the distance along it, its half
// width, a junction weight), its edge ragged into the grass, fading out over the tile's last metres (the apron paints
// the road class's colour, the same earth). On it: wheel tracks of pale beige dust (a pair on a track, on a road a
// pair and a fainter outer one), rough-edged, wandering a little, cut into pieces of uneven length, each track at its
// own places; trodden patches, pale dust, streaks along the road; trampled flat at a junction; the grit of the owner's
// photo (data/road-grit-v1.png, uRoadOn once it has loaded) at two scales (WebGL2 only: its reads follow the early
// returns, which texM's explicit gradients make safe). Browner and wetter in late autumn
uniform sampler2D uRoadSegs,uRoadGrid,uRoadGrit;uniform float uRoadOn,uRoadSegN;
vec3 roadEarth(){return vec3(0.60,0.53,0.42);}   // (the season turns it as the rest of the ground: groundSeason)
// one wheel track: its centre wandering across by up to 0.35 m along the way, its edges rough (a fine noise eating
// into them), cut into pieces (about 2 to 8 m, gaps of 1 to 4 m) at its own places (k: its seed)
float track1(float a,vec2 xz,float s,float c,float k){
  float off=(mValue(vec2(s/13.0,k))-0.5)*0.7,w=0.3+0.22*mValue(vec2(s/7.0,k+5.0))+(mValue(xz/0.35+k*3.0)-0.5)*0.22;
  float t=1.0-smoothstep(w*0.5,w,abs(a-c-off));
  float piece=mValue(vec2(s/3.2,k+11.0))*0.7+mValue(vec2(s/1.1,k+17.0))*0.3;
  return t*smoothstep(0.42,0.52,piece);}
// the nearest road at xz, exactly (its segments listed in the grid's cell, src/look/main.ts): the signed distance
// across its line (continuous, also past a dead end), the distance along it (plus 10 km a line), its half width, and
// the distance to it (past a dead end, to its end: a round cap); jn a junction weight (another line's side within 2.6
// m, the paint's reach, fading out over 6 m), past how far past a dead end. hw 0: no road near. Only where the cover's
// distance to a line says one is near (one read, most of the tile)
vec4 roadAt(vec2 xz,out float jn,out float dist,out float past){
  jn=0.0;dist=1e9;past=0.0;
  if(coverAt(xz).w>5.5)return vec4(0.0);   // (the 2 m cells: the paint reaches 2.6 m, the cells 1.4 m beyond)
  vec2 g=(xz+TILE_HALF)/ROAD_CELL;
  if(any(lessThan(g,vec2(0.0)))||any(greaterThanEqual(g,vec2(ROAD_N))))return vec4(0.0);
  vec2 c=floor(g);float best=1e9,other=1e9,bestLine=-1.0;vec4 r=vec4(0.0);bool done=false;
  for(int k=0;k<ROAD_SLOTS/4;k++){
    if(done)break;
    vec4 ids=texture2D(uRoadGrid,vec2(c.x*float(ROAD_SLOTS/4)+float(k)+0.5,c.y+0.5)/vec2(ROAD_N*float(ROAD_SLOTS/4),ROAD_N));
    for(int q=0;q<4;q++){float id=q==0?ids.x:q==1?ids.y:q==2?ids.z:ids.w;if(id<0.0){done=true;break;}
      vec4 s0=texture2D(uRoadSegs,vec2(id*2.0+0.5,0.5)/vec2(uRoadSegN*2.0,1.0)),s1=texture2D(uRoadSegs,vec2(id*2.0+1.5,0.5)/vec2(uRoadSegN*2.0,1.0));
      vec2 d=s0.zw-s0.xy;float len=length(d);vec2 u=d/len;float t0=dot(xz-s0.xy,u),t=clamp(t0,0.0,len);vec2 p=s0.xy+u*t;
      float dd=length(xz-p),score=dd-s1.y,side=dot(xz-s0.xy,vec2(-u.y,u.x));
      if(s1.z!=bestLine&&bestLine>=0.0){if(score<best)other=min(other,best);else{other=min(other,score);continue;}}
      if(score<best){best=score;bestLine=s1.z;dist=dd;past=max(0.0,max(-t0,t0-len));r=vec4(side,s1.x+t+s1.z*10000.0,s1.y,0.0);}}}
  jn=1.0-smoothstep(2.6,6.0,other);
  return r;}
vec3 roadPaint(vec3 c,vec2 xz){
  float jn,dist,past;vec4 r=roadAt(xz,jn,dist,past);float hw=r.z,a=r.x,s=r.y;if(hw<0.2)return c;
  // the patterns laid along the road (by s) give way at a junction, where s jumps from one line to the other, to the
  // same patterns laid in the world (by xz)
  float wobS=(mValue(vec2(s/4.0,7.3))-0.5)*1.6+(mValue(vec2(s/1.1,2.1))-0.5)*0.7,wobW=(mValue(xz/4.0+7.3)-0.5)*1.6+(mValue(xz/1.1+2.1)-0.5)*0.7;
  float wob=mix(wobS,wobW,jn)+(mValue(xz/0.6)-0.5)*0.5;
  // (out to about 1.6 m past the line's side: the class map's 2 m cells, under it, end within 1.4 m of it)
  float inside=(1.0-smoothstep(hw+0.2+wob*0.3,hw+1.9+wob*0.5,dist))*(1.0-smoothstep(TILE_HALF-30.0,TILE_HALF-4.0,max(abs(xz.x),abs(xz.y))));
  if(inside<=0.0)return c;
  float tr=hw>3.0?max(max(track1(a,xz,s,-0.9,1.0),track1(a,xz,s,0.9,2.0)),0.6*max(track1(a,xz,s,-2.6,3.0),track1(a,xz,s,2.6,4.0))):max(track1(a,xz,s,-0.8,1.0),track1(a,xz,s,0.8,2.0));
  tr*=(1.0-jn)*(1.0-smoothstep(0.0,0.8,past));   // none at a junction, nor round a dead end's cap
  float st=mix(mValue(vec2(s/11.0,a*1.3))*0.6+mValue(vec2(s/3.3,a*3.7+9.0))*0.4,mValue(xz/3.0+5.0),jn);   // streaks along the road
  float trod=max(smoothstep(0.6,0.8,mValue(xz/2.7+13.0)),jn*0.5),dust=smoothstep(0.55,0.85,mValue(xz/4.1-7.0));   // trodden patches, pale dust
  float g=0.0;
  #ifdef WEBGL2
  g=(texM(uRoadGrit,xz/1.9,1.9).r*0.6+textureGrad(uRoadGrit,mat2(0.8253,-0.5646,0.5646,0.8253)*xz/3.1+0.37,mat2(0.8253,-0.5646,0.5646,0.8253)*pMdx/3.1,mat2(0.8253,-0.5646,0.5646,0.8253)*pMdy/3.1).r*0.4-0.5)*uRoadOn;
  #endif
  vec3 col=roadEarth()*mix(0.93,1.07,st)*mix(1.0,0.9,trod)*mix(1.0,1.1,dust)*(1.0+g*1.2);
  col=mix(col,vec3(0.74,0.66,0.52)*mix(0.95,1.05,st)*(1.0+g*0.6),tr*0.75);   // the tracks: pale beige dust
  return mix(c,col,inside);}
#else
vec3 roadPaint(vec3 c,vec2 xz){return c;}
#endif
#if defined(WATERDATA)&&defined(BANKN)
#define SHORE
// THE BANKS (W5, docs/plans/done/w5-banks.md; docs/art-bible.md §6c, research §2.9): painted over a ground colour
// c at a point land m from the water (≥ 0), h m above it, where the authored surface's normal has y = ny. Damp grass
// near the water; bare earth on steep ground near it (cut banks); pale gravel on low, gentle ground near it (point
// bars); last, the wet line at the water, wider on gentle ground (a dark edge to the pale bar). WATER_SAB_BANKS (the banks check's sabotage): none
vec3 bankPaint(vec3 c,vec2 xz,float land,float h,float ny){
  #ifdef WATER_SAB_BANKS
  return c;
  #else
  // far out (a pixel over about 0.12 m) the edges widen with the pixel and the pebbles go: under a pixel they shimmer
  vec2 fw=fwidth(xz);float px=max(fw.x,fw.y),far=smoothstep(0.12,0.35,px),e=0.1*far;
  float gr=G(xz/3.0).g-0.5;
  c=mix(c*vec3(0.80,0.86,0.80),c,smoothstep(1.0,6.0,land+gr*1.5));                                   // damp grass
  float earth=smoothstep(0.985,0.85-e,ny)*smoothstep(4.0,1.0,land+gr);   // from gentler slopes than W5 had, so a cut bank reads as earth under the temperate earth (#88), its top edge under 1 at every zoom
  c=mix(c,vec3(0.56,0.35,0.16)*(0.9+0.2*G(xz/2.0).g),earth);                                          // bare earth
  float bar=smoothstep(0.8,0.2,h)*smoothstep(4.5,1.0,land+gr)*smoothstep(0.86-e,0.95+e,ny);
  vec3 gv=vec3(0.66,0.65,0.60)*(0.88+0.24*G(xz/1.1).g);gv=mix(gv,vec3(0.50,0.49,0.45),smoothstep(0.58,0.68,G(xz/2.9+0.3).g)*0.5*(1.0-far));
  c=mix(c,gv,bar*0.9);                                                                                  // gravel: pale grey, darker pebbles
  float wetW=mix(0.35,0.8,smoothstep(0.75,0.97,ny)),ww=max(wetW,2.0*px);   // the line at least 2 pixels wide, its ink spread
  return mix(c,c*vec3(0.58,0.64,0.62),(1.0-smoothstep(0.0,ww,land+gr*0.4))*wetW/ww);                    // the wet line
  #endif
}
#if defined(MEADOW)&&defined(MEADOW_UNDER)
// THE GROUND UNDER THE NEAR GRASS AND CROPS (docs/plans/done/crop-depth.md): darker, in the plant's own deep tone (a
// deep green under grass and the green crop, a deep ochre under wheat and stubble), as the growth there says (the
// meadow map: G the grass, B its height factor, A the crop; src/look/meadow.ts) and the season's height (meadow.glsl,
// as the clumps), so the gaps between the blades read as depth and shade. Only where the clumps are drawn: uUnder is
// the meadow's (src/look/meadow.ts, each frame): its reach from the focus (x to y m) and its strength (z: 0 with the
// meadow off, and less as the camera rises: zoomed out the clumps thin to the outer ring's). The terrain and the
// water's land side both take it (one ground: the seam)
uniform sampler2D uMeadow;uniform vec3 uUnder;
#define UNDER_GRASS vec3(0.62,0.74,0.55)   // the ground's colour times this: a deep green
#define UNDER_CROP vec3(0.74,0.58,0.42)    // a deep ochre, toward orange
#define UNDER_AMT 0.45                     // how far toward them
vec3 meadowUnder(vec3 alb,vec2 xz){
  float near=uUnder.z*(1.0-smoothstep(uUnder.x,uUnder.y,length(xz-uFocus.xz)));
  if(near<=0.0)return alb;
  vec4 m=texture2D(uMeadow,(xz+TILE_HALF)/TILE_W);
  // (a crop by its height as the clumps: the low green crop half, the wheat cut to stubble half as the harvest goes)
  if(m.a>m.g){float k=coverAt(xz).x;bool green=k>6.5&&k<7.5;float h=green?0.5:mix(1.0,0.5,smoothstep(0.55,0.95,uSeason));
    return mix(alb,alb*(green?UNDER_GRASS:UNDER_CROP),clamp(m.a*h*cropSeasonK(k,uSeason),0.0,1.0)*near*UNDER_AMT);}
  return mix(alb,alb*UNDER_GRASS,clamp(m.g*m.b*grassSeasonK(uSeason),0.0,1.0)*near*UNDER_AMT);}
#else
vec3 meadowUnder(vec3 alb,vec2 xz){return alb;}
#endif
// the shore band's ground: the terrain's (groundAt, stony where steep) with the banks painted over it, through the
// seasons: the same colour the terrain paints there
vec3 landAlbedo(vec2 xz,float land,float h){float ny=bankNormal(vec3(0.0,1.0,0.0),xz).y;
  return meadowUnder(groundSeason(bankPaint(groundSteep(roadPaint(dirtOn(groundAt(xz,pxMacro()),xz,pxMacro()),xz),ny),xz,land,h,ny)),xz);}
// the bed: silt in pools, pale gravel where the current runs, weed in slow deeper water; the damp edge at depth 0
// la: the ground at the water's edge (used to 0.3 m deep)
vec3 bedAlbedo(vec2 xz,float depth,float speed,vec3 la){
  float g=G(xz/1.7).r,g2=G(xz/6.0+0.2).g;
  vec3 mud=mix(vec3(0.29,0.26,0.16),vec3(0.36,0.32,0.20),g2);
  vec3 gravel=mix(vec3(0.56,0.50,0.37),vec3(0.70,0.64,0.50),g);
  vec3 b=mix(mud,gravel,smoothstep(0.45,0.85,speed+(g2-0.5)*0.3));
  b=mix(b,vec3(0.21,0.29,0.15),smoothstep(0.60,0.78,G(xz/4.3+0.6).g)*smoothstep(0.4,0.8,depth)*(1.0-speed));
  return mix(la,b,smoothstep(0.0,0.3,depth));}   // at depth 0, the ground at the water's edge
const vec3 FOAM=vec3(0.93,0.92,0.84);
// THE ICE (W5b, docs/plans/done/w5-banks.md): the frost, 0 until late autumn (season 2), 1 in winter (3)
float frost(){return clamp(uSeason-2.0,0.0,1.0);}
// the ice at a point of the water, from the water data's speed sp there (0..1) and its depth d, so the terrain's band
// and the water paint it alike: x the ice (0..1), y the rime along its edge (on the ice's side). Slow water freezes
// first: the speed, less a bonus in the shallows and jittered by the grain's blotches, under a threshold that rises
// with the frost (none at 0, 0.66 in full winter): shelves along the banks and the bars in late autumn, the pools
// closed over in winter, the riffles open (deep water from about 0.75; shallow riffle edges can freeze). The ice's edge hard, as wide as a pixel at least (aastep);
// the rime soft (below). The ice covers every layer of the water. WATER_SAB_EVENICE (the winter check's sabotage):
// W4's ice, even over the whole water
vec2 iceAt(vec2 xz,float sp,float d){
  #ifdef WATER_SAB_EVENICE
  return vec2(clamp(uSeason-2.3,0.0,0.7)/0.7,0.0);
  #else
  float F=frost();if(F<=0.0)return vec2(0.0);   // uniform: no derivatives lost
  float v=sp-0.22*(1.0-smoothstep(0.05,0.4,d))+(G(xz/2.3+0.4).g-0.5)*0.16,vt=mix(-0.32,0.66,F);
  // the rime: soft, brightening over the last 0.06 of speed to the ice's edge (about 0.3 m where the speed changes
  // fastest), so it adds no hard edge of its own (a hard line there shimmered, and a width from the screen
  // derivatives steps by 2×2 pixels); broken softly by the grain's blotches
  float ice=1.0-aastep(vt,v);
  return vec2(ice,ice*smoothstep(vt-0.06,vt,v)*smoothstep(0.25,0.45,G(xz/1.3+0.2).g));
  #endif
}
// THE STONES' FOAM (W5a, research §4.4): the stones in the water (src/look/nature.ts), at most STONES: x, z, radius,
// the flow's direction (rad); a radius of 0 ends the list. Per stone, in the flow's frame: a thin pillow arc upstream,
// and a wake of two broken streaks downstream, 6 radii long, widening, drifting with the current; on the water only
// (s, the shore distance, above 0). Painted last (withStones), over every layer of the water, by the terrain's band
// and the water alike. A stone is skipped past 8 radii plus 3 pixels: its foam reaches 6.3 radii, so a 2×2 quad with a
// pixel that needs it takes it whole (derivatives, above). The lines widen to 1.5 pixels at least, their ink spread,
// and fade by half far out. WATER_SAB_NOFOAM: none (the foam check's sabotage)
uniform vec4 uStones[STONES];
float stoneFoam(vec2 xz,float s){
  float f=0.0,tw=mod(uTime,40.0);   // 40 s: a whole number of the breaks' periods
  #ifndef WATER_SAB_NOFOAM
  if(s<-1.5*fwidth(s))return 0.0;   // on land (the foam is the water's), past the derivatives' margin
  vec2 fw=fwidth(xz);float px=max(fw.x,fw.y),far=smoothstep(0.12,0.35,px);
  for(int k=0;k<STONES;k++){
    vec4 st=uStones[k];if(st.z<=0.0)break;
    vec2 d=xz-st.xy;float r=st.z,cut=8.0*r+3.0*px;if(dot(d,d)>cut*cut)continue;
    vec2 fl=vec2(cos(st.w),sin(st.w));float a=dot(d,fl),b=dot(d,vec2(-fl.y,fl.x));
    float pw=0.06+0.1*r,pwx=max(pw,0.75*px);
    float pillow=(1.0-aastep(pwx,abs(length(d)-1.2*r)))*smoothstep(0.3*r,-0.5*r,a)*pw/pwx;
    float L=6.0*r,t=clamp(a/L,0.0,1.0),hf=r*(0.9+0.9*t),w=0.06+0.12*r*(1.0-0.5*t),wx=max(w,0.75*px);
    float brk=aastep(0.42,G(vec2((a-tw*0.5)*0.35,b*0.7)+st.xy*0.13).g);
    float wake=(1.0-aastep(wx,abs(abs(b)-hf)))*smoothstep(-0.2*r,0.3*r,a)*(1.0-t)*brk*w/wx;
    f=max(f,max(pillow,wake*0.85));
  }
  f*=(1.0-0.5*far)*aastep(0.0,s);
  #endif
  return f;}
// the stones' foam over a colour at a point of the water (s: the shore distance; sh: the sun's shadow there; ice: the
// ice there, iceAt's x: it covers the foam, so stones in the open riffles keep theirs in winter)
vec3 withStones(vec3 c,vec3 wp,float s,float sh,float ice){
  float cs=max(cloud(wp)*0.6,sh);
  return mix(c,FOAM*mix(1.0,0.78,cs),stoneFoam(wp.xz,s)*0.85*(1.0-0.9*ice));}
// the ground at the water's edge, lit with the authored surface's normal: t its water texel
vec3 shoreLand(vec3 wp,vec4 t,float occ,float sh){return paint(landAlbedo(wp.xz,max(-waterSdf(t),0.0),-waterDepth(t)),bankNormal(vec3(0.0,1.0,0.0),wp.xz),wp,occ,0.12,1.0,sh);}
// the water's lower layers (research §2.8, layers 1, 2, 7, the shore foam, the ice): d the depth, s the shore distance,
// sp the speed (0..1), ia the ice there (iceAt, computed once by the caller)
vec3 shoreWater(vec3 wp,float d,float s,float sp,float occ,float sh,vec2 ia){
  float dd=max(d,0.0);
  // 1. the bed seen through the water, painted at the surface's point: no refraction offset (an offset by the depth,
  // a bilinear field, makes the point's screen derivatives jump at every texel's edge, and with them the grain's
  // level of detail)
  // no snow settles under the water: it fades out over the first 5 cm of depth (the shore keeps the land's)
  pSnowK=1.0-smoothstep(0.0,0.05,dd);
  // the ground at the water's edge shows through to 0.3 m (painted only there, past it by the derivatives' margin)
  vec3 la=vec3(0.0);if(dd<0.3+1.5*fwidth(dd))la=landAlbedo(wp.xz,0.0,0.0);
  vec3 pg=pGround;pGround*=pSnowK;   // nor the ground's bounce (LC5): the bed under the water takes none
  vec3 bed=paint(bedAlbedo(wp.xz,dd,sp,la),bankNormal(vec3(0.0,1.0,0.0),wp.xz),wp,occ,0.12,1.0,sh);
  pSnowK=1.0;pGround=pg;
  // 2. absorption, red first; the painted ramp (shallow green-ochre, turquoise, deep teal) in bands broken by the grain
  float dn=dd*(1.0+0.35*(G(wp.xz/5.0).g-0.5)*uGrainAmt);
  vec3 T=exp(-vec3(3.0,1.5,1.1)*dn);
  float b=(1.0-T.g)*3.0+(G(wp.xz/2.0).r-0.5)*0.5;
  vec3 wc=earthOf(mix(mix(vec3(0.34,0.50,0.38),vec3(0.14,0.37,0.40),smoothstep(0.9,1.1,b)),vec3(0.06,0.22,0.28),smoothstep(2.0,2.2,b)));   // the mood's earth, as the bed and the far ring's river line (paint)
  vec3 c=bed*T+wc*(1.0-T);
  // 7. tree and cloud shadows cool the water, deep water more (the bed is already shadowed)
  float cs=max(cloud(wp)*0.6,sh);c=mix(c,c*vec3(0.58,0.70,0.88),cs*smoothstep(0.1,0.8,dd));
  // the shore foam: a broken line about 0.2 m in and a fainter one farther out, hard-edged (thresholded grain)
  // Far out (a pixel over about 0.12 m) the line widens to at least 1.5 pixels with its ink spread over the width,
  // its breaks (0.3 m blotches) close up and the faint second line goes: under a pixel they would shimmer
  float gr=G(wp.xz/9.0+0.5).g,gb=G(wp.xz/23.0+0.2).g,j=(G(wp.xz/3.1+0.7).g-0.5)*0.25;
  float px=pxGround(wp),far=smoothstep(0.12,0.35,px),hw=max(0.14,0.75*px);
  float foam=(1.0-aastep(hw,abs(s-0.22-j)))*mix(aastep(0.5,gr)*aastep(0.42,gb),1.0,far)*0.14/hw;
  foam=max(foam,(1.0-aastep(0.05,abs(s-0.60-j*1.5)))*aastep(0.62,gr)*aastep(0.5,gb)*0.6*(1.0-far));
  c=mix(c,FOAM*mix(1.0,0.78,cs),foam*0.85);
  // winter (W5b): the open water darker and colder; the ice (iceAt) pale and cracked, darker over deep water, with
  // drifts of snow on it, near the banks mostly; the rime white along its edge
  if(frost()>0.0){   // uniform: the grain's derivatives hold
    float F=frost();
    c=mix(c,earthOf(vec3(0.05,0.12,0.20))*mix(1.0,0.75,cs),F*0.75*smoothstep(0.0,0.3,dd));
    vec3 ic=earthOf(mix(vec3(0.48,0.60,0.70),vec3(0.66,0.75,0.82),smoothstep(0.6,0.0,dd)));   // bluer and darker than the snow
    // the cracks: thin lines where the grain crosses its middle, at least 1.5 pixels wide, their ink spread (the
    // derivative taken before abs(): at the line's centre abs() folds it to 0)
    float gc=G(wp.xz/9.0).g-0.5,fc=fwidth(gc),cw=max(0.03,1.5*fc);
    ic*=1.0-(1.0-smoothstep(cw-1.2*fc,cw+1.2*fc,abs(gc)))*0.5*0.03/cw;
    ic=mix(ic,vec3(0.86,0.88,0.92),aastep(0.62,G(wp.xz/6.0+0.7).g+0.25*(1.0-smoothstep(0.3,2.0,s)))*0.85*F);
    ic=mix(ic,vec3(0.95,0.96,0.98),ia.y*0.9);
    c=mix(c,mix(ic,ic*vec3(0.62,0.72,0.88),cs),ia.x*0.9);}
  return c;}
// the band's colour at a drawn point: t its water texel, occ its occlusion, sh its sun shadow, fw the shore distance's
// fwidth, ia the ice there (iceAt, computed once by the caller). Near the shore both sides are painted and blended over about a pixel: the water's side has its depth there
// (the depth and the shore distance are separate channels; on a cut bank the water at the shore is already tinted), so
// the shoreline is a hard painted edge, anti-aliased
vec3 shore(vec3 wp,vec4 t,float occ,float sh,float fw,vec2 ia){
  // m: the blend below reaches 1.2 fw past the shore (aastep), and a quad spans up to fw more, so each side's branch
  // reaches 2.5 fw past it (derivatives, above)
  float s=waterSdf(t),m=2.5*fw+1e-3;vec3 land=vec3(0.0),water=vec3(0.0);
  if(s<m)land=shoreLand(wp,t,occ,sh);
  if(s>-m)water=shoreWater(wp,waterDepth(t),s,length(waterFlow(t)),occ,sh,ia);
  return mix(land,water,aastep(0.0,s))*(1.0+(G(wp.xz/4.0).r-0.5)*uGrainAmt*0.14);}   // the gouache grain, on both sides (continuous at the shore)
#endif
