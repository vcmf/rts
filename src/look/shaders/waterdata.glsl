// The water data (docs/plans/done/w3-water-data.md, src/look/world/water-data.ts): depth, shore distance and flow
// over the tile. W3 reads it in the debug views only (WATER_DEBUG); without that define nothing here is compiled
#ifdef WATER_DEBUG
uniform sampler2D uWater;uniform float uWaterView;
vec4 waterTexel(vec2 xz,float bias){vec2 uv=(xz+TILE_HALF)/TILE_W;
  #ifdef WATER_SAB_FLIP
  uv.y=1.0-uv.y;   // the page check's sabotage: the texture read upside down
  #endif
  return texture2D(uWater,uv,bias);}
vec4 waterTexel(vec2 xz){return waterTexel(xz,0.0);}
float waterDepth(vec4 t){return WATER_D0+t.r*(WATER_D1-WATER_D0);}
float waterSdf(vec4 t){return (t.g*2.0-1.0)*WATER_SDF;}
vec2 waterFlow(vec4 t){return (t.ba*255.0-128.0)/127.0;}   // 128 ± 127: 0 exactly at 128
vec3 depthView(float d){return d>0.0?mix(vec3(0.62,0.88,0.96),vec3(0.03,0.12,0.40),clamp(d/1.5,0.0,1.0)):mix(vec3(0.42,0.33,0.20),vec3(0.93,0.91,0.86),clamp(d/WATER_D0,0.0,1.0));}
// uWaterView: 1 depth (blues by depth; dry ground brown to pale by its height above the water, to the range's end), 2 shore distance
// (1 m bands, blue in the water, red on land, the shore white), 3 flow (an arrow per 2 m cell over the depth, its
// length by speed), 4 the raw texel's RGB, 5 its alpha (grey)
vec3 waterView(vec2 xz){
  vec4 t=waterTexel(xz);
  if(uWaterView>4.5)return vec3(t.a);
  if(uWaterView>3.5)return t.rgb;
  if(uWaterView<1.5)return depthView(waterDepth(t));
  if(uWaterView<2.5){float s=waterSdf(t),w=max(fwidth(s),1e-4);
    vec3 c=(s>0.0?vec3(0.20,0.40,0.90):vec3(0.85,0.35,0.20))*(0.55+0.45*fract(s));
    return mix(vec3(1.0),c,smoothstep(w,2.5*w,abs(s)));}
  // the cell's centre, read at the finest level (its derivatives jump at every cell's edge: a bias, not a seam)
  vec2 cc=(floor(xz/2.0)+0.5)*2.0,f=waterFlow(waterTexel(cc,-16.0)),p=xz-cc;float sp=length(f);
  vec3 c=depthView(waterDepth(t))*0.7;
  if(sp<0.02)return c;
  vec2 d=f/sp,e=vec2(-d.y,d.x);float a=dot(p,d),b=abs(dot(p,e)),L=0.15+0.8*sp,
    arrow=max(step(b,0.07)*step(-L,a)*step(a,L-0.3),step(L-0.3,a)*step(a,L)*step(b,(L-a)*0.8));
  return mix(c,mix(vec3(1.0,0.95,0.3),vec3(1.0,0.2,0.1),sp),arrow);}
#endif
