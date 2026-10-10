precision highp float;varying vec3 vW;varying vec2 vUv;varying float vDepth;uniform sampler2D uRefl;
#include<painter>

float reflAt(vec2 xz){vec2 uv=(xz+TILE_HALF)/TILE_W;if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)return 0.0;return texture2D(uRefl,uv).r;}
void main(){
  vec3 V=normalize(uCamPos-vW);
  float depth=max(vDepth,0.0);
  float across=vUv.x,along=vUv.y;                                           // stream-space coordinates (metres)
  // 1. depth colour: wet shore → turquoise shallows → deep teal
  vec3 deep=vec3(0.07,0.24,0.31),mid=vec3(0.20,0.46,0.50),shal=vec3(0.48,0.66,0.58),wet=vec3(0.34,0.33,0.22);
  float dn=depth+(G(vW.xz/6.0).g-0.5)*0.35;
  vec3 c=dn<0.25?mix(wet,shal,smoothstep(0.0,0.25,dn)):dn<0.9?mix(shal,mid,smoothstep(0.25,0.9,dn)):mix(mid,deep,smoothstep(0.9,1.9,dn));
  // 2. sky reflection at grazing view (painted sky colour, no real sky)
  float fr=pow(1.0-max(V.y,0.0),2.5);c=mix(c,vec3(0.62,0.74,0.86),fr*0.45*smoothstep(0.2,0.6,dn));
  // 3. tree reflections: trace the mirrored view ray up to crown height, read the baked canopy mask
  vec3 R=reflect(-V,vec3(0.0,1.0,0.0));
  float wob=(G(vec2(across*0.6,along*0.25-uTime*0.25)).r-0.5)*0.9;
  vec2 o=R.xz/max(R.y,0.2);
  float rf=max(reflAt(vW.xz+o*4.0+vec2(wob,0.0)),reflAt(vW.xz+o*7.5+vec2(wob*1.5,0.0)));
  c=mix(c,vec3(0.08,0.17,0.13),smoothstep(0.25,0.6,rf)*0.62*smoothstep(0.15,0.5,dn));
  // 4. flow strokes along the current (scrolling with the water, stretched along the stream)
  float flow=G(vec2(along*0.035-uTime*0.02,across*0.12)).b;
  float flow2=G(vec2(along*0.06-uTime*0.03+0.3,across*0.2+0.2)).g;
  float fl=smoothstep(0.62,0.82,flow*0.55+flow2*0.45)*smoothstep(0.3,0.8,dn);
  c=mix(c,c*1.15+vec3(0.03,0.05,0.05),fl*0.45);
  // shadows (trees + clouds) cool the water
  vec4 lm=LM(vW);float cs=max(cloud(vW)*0.6,(1.0-lm.r)*uShadowsOn);c=mix(c,c*vec3(0.55,0.70,0.88),cs);
  // 5. sun glitter: painted dabs only where the sun reflects toward the camera
  float spec=pow(max(dot(R,uSunDir),0.0),5.0);
  float dab=step(0.80,G(vec2(along*0.45-uTime*0.12,across*0.9)).r)*step(0.55,G(vW.xz/2.3+uTime*0.015).g);
  c+=uSunCol*vec3(1.0,0.86,0.58)*dab*(0.25+spec*1.6)*(1.0-cs)*smoothstep(0.3,0.8,dn);
  // 6. foam: broken painted line at the shore, plus a faint second line
  float g=G(vW.xz/1.4).r,gf=G(vec2(along*0.5-uTime*0.05,across)).g;
  float foam=smoothstep(0.08,0.02,abs(dn-0.12-(gf-0.5)*0.1))*step(0.42,g);
  foam=max(foam,smoothstep(0.05,0.0,abs(dn-0.42-(gf-0.5)*0.15))*step(0.62,g)*0.6);
  c=mix(c,vec3(0.92,0.92,0.84)*mix(1.0,0.8,cs),foam*0.85);
  // season: winter ice (pale, cracked), snow at the edges
  float ice=clamp(uSeason-2.3,0.0,0.7)/0.7;
  if(ice>0.0){vec3 ic=mix(vec3(0.66,0.76,0.82),vec3(0.84,0.88,0.90),smoothstep(0.5,0.0,dn));
    float crack=smoothstep(0.03,0.0,abs(G(vW.xz/9.0).g-0.5))*0.5;ic*=1.0-crack;ic=mix(ic,ic*vec3(0.62,0.72,0.88),cs);
    c=mix(c,ic,ice*0.9);}
  c*=1.0+(G(vW.xz/4.0).r-0.5)*uGrainAmt*0.14;
  gl_FragColor=vec4(atmos(mist(c,vW,lm,0.0),vW),depthA(vW));}