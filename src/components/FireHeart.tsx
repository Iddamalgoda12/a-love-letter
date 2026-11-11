import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import * as THREE from 'three';

const vertex = `
uniform float uTime; uniform float uProgress; uniform float uBurst; uniform float uReduced; uniform float uSettled; uniform float uTouch;
attribute float aAlong; attribute float aSeed; attribute float aSize; attribute float aKind; attribute vec3 aVelocity;
varying float vAlpha; varying float vKind; varying float vSeed; varying float vAge; varying float vAlong;
void main() {
  float age = uProgress - aAlong;
  vec3 p = position;
  float visible = step(0.0, age);
  float scatterAge = max(0.0, age) * 4.0;
  if (aKind > 0.5) {
    // Sparks begin dispersed, then converge as the drawing point approaches.
    float remaining = max(aAlong-uProgress, 0.0);
    float spread = smoothstep(0.0, .32, remaining);
    p += aVelocity * (.025 + spread * 2.8);
    p.xy += vec2(sin(uTime*.35+aSeed*31.0), cos(uTime*.28+aSeed*23.0)) * .035 * spread * (1.0-uReduced);
    float waiting = 1.0 - step(aAlong, uProgress);
    float afterglow = exp(-scatterAge * 2.2) * step(aAlong, uProgress);
    visible = waiting * (.35 + .65*(1.0-spread)) + afterglow;
    // Once the outline closes, sparks shoot outward from the heart and fade.
    float blast = 1.0 - pow(1.0-uSettled, 2.0);
    vec3 direction = normalize(vec3(position.xy, .01)) * (.45 + aSeed*.8) + aVelocity;
    vec3 flying = position + aVelocity*.025 + direction * blast * 5.0;
    p = mix(p, flying, smoothstep(0.0, .035, uSettled));
    float burstLight = (1.0-smoothstep(.08, 1.0, uSettled)) * (1.0-aSeed*.35);
    visible = mix(visible, burstLight, smoothstep(0.0, .035, uSettled));

  } else {
    float beat1 = pow(max(0.0, sin(uTime*2.15)), 18.0);
    float beat2 = pow(max(0.0, sin(uTime*2.15-.65)), 22.0);
    float beat = (beat1 + beat2*.48)*uSettled*(1.0-uReduced);
    p.xy *= 1.0 + beat*.018;
    visible *= .82 + beat*.3;
  }
  p.xy *= 1.0+uBurst*(.5+aSeed*1.7);
  p += normalize(vec3(position.xy, .3)) * uBurst * aSeed * .7;
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=aSize * (5.0/-mv.z) * (1.0+uBurst*.5);
  vAlpha=visible*(1.0-uBurst*.8)*(aKind>.5?.45:0.0); vKind=aKind; vSeed=aSeed; vAge=scatterAge; vAlong=aAlong;
}`;
const fragment = `
uniform vec3 uColor; uniform float uTime;
varying float vAlpha; varying float vKind; varying float vSeed; varying float vAge; varying float vAlong;
void main(){
 float d=length(gl_PointCoord-.5); if(d>.5) discard;
 float core=exp(-d*d*38.0); float halo=exp(-d*d*9.0)*.25;
 vec3 rose=vec3(1.0, .08, .25);
 vec3 palette = rose;
 if (vSeed < .24) palette = vec3(1.0, .035, .08);
 else if (vSeed < .46) palette = vec3(1.0, .12, .34);
 else if (vSeed < .66) palette = vec3(1.0, .22, .55);
 else if (vSeed < .82) palette = vec3(.72, .10, .75);
 else if (vSeed < .93) palette = vec3(1.0, .38, .40);
 else palette = vec3(1.0, .68, .55);
 vec3 neon = mix(vec3(1.0,.55,.75), vec3(.78,.32,1.0), smoothstep(.3,1.0,vAlong));
 // Shift the whole composition together, so the surrounding cloud cannot
 // mask the heart's changing color. Each particle keeps a slight variation.
 float phase = uTime * 1.05;
 vec3 cycling = .5 + .5*cos(phase + vec3(0.0, 4.18879, 2.09439));
 cycling = .06 + .94*cycling;
 vec3 c = vKind < .5 ? cycling : mix(palette, cycling, .83);
 c = mix(c, neon, vKind < .5 ? .04 : 0.0);
 gl_FragColor=vec4(c,(core+halo)*vAlpha);
}`;
const glowVertex = `uniform float uSize; void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=uSize*(5.0/-mv.z);}`;
const glowFragment = `uniform vec3 uColor; uniform float uOpacity; void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard; float a=exp(-d*d*18.0)*uOpacity;gl_FragColor=vec4(mix(uColor,vec3(1.),exp(-d*d*120.)),a);}`;
function curve(t:number){
 return new THREE.Vector3(1.35*Math.pow(Math.sin(t),3),1.35*(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/16+.08,0);
}
// Map distance along the outline to the curve parameter. The raw equation slows
// almost to a stop at its cusps; this keeps the leading light moving evenly.
const samples=2048;
const distances=new Float32Array(samples+1);
let last=curve(0);
for(let i=1;i<=samples;i++){const point=curve(-i/samples*Math.PI*2);distances[i]=distances[i-1]+point.distanceTo(last);last=point;}
function heartPoint(progress:number){
 const target=Math.max(0,Math.min(1,progress))*distances[samples]; let low=0,high=samples;
 while(low+1<high){const mid=(low+high)>>1;if(distances[mid]<target)low=mid;else high=mid;}
 const span=distances[high]-distances[low]; const fraction=span?(target-distances[low])/span:0;
 return curve(-(low+fraction)/samples*Math.PI*2);
}
const colors=['#ff172f','#ff83bf','#8425ff','#31c9ff','#ffbb16','#f31a45'].map(c=>new THREE.Color(c));
function Trail({burst, reduced, onReady}:{burst:boolean;reduced:boolean;onReady:()=>void}) {
 const material=useRef<THREE.ShaderMaterial>(null!); const head=useRef<THREE.Points>(null!); const headMaterial=useRef<THREE.ShaderMaterial>(null!);
 const animation=useRef({progress:0,burst:0,settled:0,touch:0});
 const uniforms=useMemo(()=>({uTime:{value:0},uProgress:{value:0},uSettled:{value:0},uTouch:{value:0},uBurst:{value:0},uReduced:{value:reduced?1:0},uColor:{value:colors[0].clone()}}),[reduced]);
 const line=useMemo(()=>{
  // A camera-facing ribbon gives the outline real, smoothly antialiased edges.
  const steps=2048, positions=new Float32Array((steps+1)*2*3), sides=new Float32Array((steps+1)*2), indices=new Uint16Array(steps*6);
  const path=Array.from({length:steps+1},(_,i)=>heartPoint(i/steps));
  for(let i=0;i<=steps;i++){
   const prev=path[(i+steps-1)%steps], next=path[(i+1)%steps], point=path[i];
   const tangent=next.clone().sub(prev).normalize(); const nx=-tangent.y, ny=tangent.x;
   // Both heart cusps taper to a single point: adjacent ribbon edges cannot
   // cross or overlap into the bright square that a normal join produces.
   const cuspDistance=Math.min(i,Math.abs(i-steps/2),steps-i);
   const taper=Math.min(1,cuspDistance/10); const width=.09*taper;
   for(let side=0;side<2;side++){const sign=side===0?-1:1;const n=(i*2+side)*3;positions[n]=point.x+nx*width*sign;positions[n+1]=point.y+ny*width*sign;positions[n+2]=.05;sides[i*2+side]=sign;}
   if(i<steps){const n=i*6,v=i*2;indices.set([v,v+1,v+2,v+1,v+3,v+2],n);}
  }
  const shape=new THREE.BufferGeometry();shape.setAttribute('position',new THREE.BufferAttribute(positions,3));shape.setAttribute('aSide',new THREE.BufferAttribute(sides,1));shape.setIndex(new THREE.BufferAttribute(indices,1));shape.setDrawRange(0,0);
  const shader=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
   vertexShader:`uniform float uTime;uniform float uSettled;uniform float uReduced;uniform float uTouch;attribute float aSide;varying float vSide;void main(){vSide=aSide;vec3 p=position;float b1=pow(max(0.,sin(uTime*2.15)),18.);float b2=pow(max(0.,sin(uTime*2.15-.65)),22.);p.xy*=1.+((b1+b2*.48)*uSettled*(1.-uReduced)*.018+uTouch*.015);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
   fragmentShader:`uniform float uTime;uniform float uTouch;uniform float uSettled;uniform float uReduced;varying float vSide;void main(){float d=abs(vSide);float aa=max(fwidth(d),.001);float core=1.-smoothstep(.28-aa,.28+aa,d);float glow=exp(-d*d*5.)*.48;vec3 c=.5+.5*cos(uTime*1.05+vec3(0.,4.18879,2.09439));float beat=pow(max(0.,sin(uTime*2.15)),18.)*uSettled*(1.-uReduced);gl_FragColor=vec4(mix(c,vec3(1.),core*.3),(core*.85+glow)*(1.+uTouch*.45+beat*.18));}`});
  const result=new THREE.Mesh(shape,shader);result.frustumCulled=false;return result;
 },[uniforms]);
 useEffect(()=>()=>{line.geometry.dispose();(line.material as THREE.Material).dispose()},[line]);
 const headUniforms=useMemo(()=>({uColor:{value:colors[0].clone()},uSize:{value:70},uOpacity:{value:1}}),[]);
 const geometry=useMemo(()=>{
  const mobile=window.innerWidth<700; const lineCount=mobile?9000:16000; const sparks=mobile?360000:700000; const count=lineCount+sparks;
  const path=Array.from({length:2049},(_,i)=>heartPoint(i/2048));
  const pos=new Float32Array(count*3),velocity=new Float32Array(count*3),along=new Float32Array(count),seed=new Float32Array(count),size=new Float32Array(count),kind=new Float32Array(count);
  for(let i=0;i<count;i++){
   const line=i<lineCount; const p=line?i/(lineCount-1):Math.random(); const sample=p*2048; const index=Math.min(2047,Math.floor(sample)); const mix=sample-index; const pointX=THREE.MathUtils.lerp(path[index].x,path[index+1].x,mix), pointY=THREE.MathUtils.lerp(path[index].y,path[index+1].y,mix); const s=Math.random();
   const jitter=line?0:.018; pos.set([pointX+(Math.random()-.5)*jitter,pointY+(Math.random()-.5)*jitter,line?.05:(Math.random()-.5)*.04],i*3);
   const angle=Math.random()*Math.PI*2; const speed=(.08+Math.pow(Math.random(),1.1)*1.35);
   velocity.set([Math.cos(angle)*speed,Math.sin(angle)*speed,(Math.random()-.5)*.24],i*3);
   along[i]=p; seed[i]=s; size[i]=line?5.0:(.9+Math.pow(Math.random(),5)*3.4); kind[i]=line?0:1;
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('aVelocity',new THREE.BufferAttribute(velocity,3));g.setAttribute('aAlong',new THREE.BufferAttribute(along,1));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));g.setAttribute('aSize',new THREE.BufferAttribute(size,1));g.setAttribute('aKind',new THREE.BufferAttribute(kind,1));return g;
 },[]);
 useEffect(()=>{ animation.current.progress=0; animation.current.settled=0; const timeline=gsap.timeline(); timeline.to(animation.current,{progress:1,duration:12,ease:'none'}).to(animation.current,{settled:1,duration:4.5,ease:'none',onComplete:onReady}); return()=>{timeline.kill()}},[onReady]);
 useEffect(()=>{const tween=gsap.to(animation.current,{burst:burst?1:0,duration:burst?1.1:.1,ease:'power2.out'});return()=>{tween.kill()}},[burst]);
 useEffect(()=>{let timeline:gsap.core.Timeline | undefined; const reactToTouch=()=>{if(animation.current.settled<.9)return;timeline?.kill();animation.current.touch=0;timeline=gsap.timeline().to(animation.current,{touch:1,duration:.45,ease:'sine.out'}).to(animation.current,{touch:0,duration:1.5,ease:'sine.inOut'});};window.addEventListener('heart:touch',reactToTouch);return()=>{window.removeEventListener('heart:touch',reactToTouch);timeline?.kill()}},[]);
 useFrame((state)=>{
  if(!material.current||!head.current)return; const t=state.clock.elapsedTime; const u=material.current.uniforms; const a=animation.current;
  u.uTime.value=t;u.uProgress.value=a.progress;u.uBurst.value=a.burst;u.uSettled.value=a.settled;u.uTouch.value=a.touch;const lineUniforms=(line.material as THREE.ShaderMaterial).uniforms;lineUniforms.uTime.value=t;lineUniforms.uSettled.value=a.settled;lineUniforms.uTouch.value=a.touch;geometry.setDrawRange(0,a.settled>=.999?0:Infinity);line.geometry.setDrawRange(0,Math.min(2048,Math.floor(a.progress*2048))*6);
  const cycle=(t/1.8)%colors.length;const index=Math.floor(cycle);
  u.uColor.value.copy(colors[index]).lerp(colors[(index+1)%colors.length],cycle-index);headMaterial.current.uniforms.uColor.value.copy(u.uColor.value);
  const p=heartPoint(a.progress);head.current.position.copy(p).multiplyScalar(1+a.burst);head.current.visible=a.settled<.2&&!burst;headMaterial.current.uniforms.uOpacity.value=Math.max(0,1-a.settled*5);
 });
 return <><primitive object={line}/><points geometry={geometry} frustumCulled={false}><shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} blending={THREE.AdditiveBlending}/></points><points ref={head}><bufferGeometry><bufferAttribute attach="attributes-position" args={[new Float32Array([0,0,0]),3]}/></bufferGeometry><shaderMaterial ref={headMaterial} uniforms={headUniforms} vertexShader={glowVertex} fragmentShader={glowFragment} transparent depthWrite={false} blending={THREE.AdditiveBlending}/></points></>;
}
// The interface uses the same GPU particle scene as the drawn heart. A small
// circular buffer is reused for button bursts and each newly written letter.
function InteractionSparks({reduced}:{reduced:boolean}){
 const {camera,gl}=useThree();
 const clock=useRef(0),cursor=useRef(0),lastSpawn=useRef(-100),material=useRef<THREE.ShaderMaterial>(null!);
 const count=10000;
 const geometry=useMemo(()=>{
  const g=new THREE.BufferGeometry();
  const positions=new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage);
  const velocities=new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage);
  const births=new Float32Array(count);births.fill(-100);
  g.setAttribute('position',positions);g.setAttribute('aVelocity',velocities);
  g.setAttribute('aBirth',new THREE.BufferAttribute(births,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize',new THREE.BufferAttribute(new Float32Array(count),1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSeed',new THREE.BufferAttribute(new Float32Array(count),1).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0,0);return g;
 },[]);
 const uniforms=useMemo(()=>({uTime:{value:0},uReduced:{value:reduced?1:0}}),[reduced]);
 useEffect(()=>{
  const spawn=(event:Event)=>{
   const detail=(event as CustomEvent<{x?:number;y?:number}>).detail;const bounds=gl.domElement.getBoundingClientRect();
   const x=detail?.x&&detail.x>0?detail.x:bounds.left+bounds.width/2;
   const y=detail?.y&&detail.y>0?detail.y:bounds.top+bounds.height*.52;
   const point=new THREE.Vector3((x-bounds.left)/bounds.width*2-1,-((y-bounds.top)/bounds.height)*2+1,.5).unproject(camera);
   const direction=point.sub(camera.position).normalize();const origin=camera.position.clone().addScaledVector(direction,(.12-camera.position.z)/direction.z);
   const press=event.type==='heart:touch';const amount=press?850:90;
   const pos=geometry.getAttribute('position') as THREE.BufferAttribute, vel=geometry.getAttribute('aVelocity') as THREE.BufferAttribute;
   const birth=geometry.getAttribute('aBirth') as THREE.BufferAttribute, size=geometry.getAttribute('aSize') as THREE.BufferAttribute, seed=geometry.getAttribute('aSeed') as THREE.BufferAttribute;
   for(let i=0;i<amount;i++){
    const n=cursor.current++%count;const angle=Math.random()*Math.PI*2;const speed=press?.65+Math.random()*2.1:.25+Math.random()*1.0;
    const radius=Math.sqrt(Math.random())*(press?.18:.045);pos.setXYZ(n,origin.x+Math.cos(angle)*radius,origin.y+Math.sin(angle)*radius,.12);vel.setXYZ(n,Math.cos(angle)*speed,Math.sin(angle)*speed,0);
    birth.setX(n,clock.current);size.setX(n,press?2+Math.random()*3:1.5+Math.random()*2.4);seed.setX(n,Math.random());
   }
   for(const attr of [pos,vel,birth,size,seed])attr.needsUpdate=true;lastSpawn.current=clock.current;geometry.setDrawRange(0,Math.min(cursor.current,count));
  };
  window.addEventListener('heart:touch',spawn);window.addEventListener('heart:write',spawn);
  return()=>{window.removeEventListener('heart:touch',spawn);window.removeEventListener('heart:write',spawn)};
 },[camera,gl,geometry]);
 useFrame(state=>{clock.current=state.clock.elapsedTime;if(material.current)material.current.uniforms.uTime.value=clock.current;if(cursor.current&&clock.current-lastSpawn.current>1.5){geometry.setDrawRange(0,0);cursor.current=0;}});
 return <points geometry={geometry} frustumCulled={false} renderOrder={5}><shaderMaterial ref={material} uniforms={uniforms} transparent depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending}
  vertexShader={`uniform float uTime;uniform float uReduced;attribute vec3 aVelocity;attribute float aBirth;attribute float aSize;attribute float aSeed;varying float vAlpha;varying float vSeed;void main(){float age=uTime-aBirth;float life=1.35;float strength=step(0.,age)*(1.-smoothstep(.25,life,age));vec3 p=position+aVelocity*max(age,0.)*(1.-uReduced*.75);p.y-=age*age*.06*(1.-uReduced);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=aSize*(5./-mv.z);vAlpha=strength;vSeed=aSeed;}`}
  fragmentShader={`varying float vAlpha;varying float vSeed;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float core=exp(-d*d*30.);float halo=exp(-d*d*8.)*.3;vec3 c=mix(vec3(1.,.20,.38),vec3(1.,.8,.42),vSeed);c=mix(c,vec3(1.),core*.5);gl_FragColor=vec4(c,(core+halo)*vAlpha);}`}/></points>;
}
function ResponsiveCamera(){
 const {camera,size}=useThree();
 useEffect(()=>{const perspective=camera as THREE.PerspectiveCamera; const aspect=size.width/size.height; perspective.fov=aspect<.8?Math.min(90,2*Math.atan(Math.tan(THREE.MathUtils.degToRad(38/2))*1.05/aspect)*180/Math.PI):38; perspective.updateProjectionMatrix();},[camera,size.width,size.height]);
 return null;
}
export default function FireHeart({burst,reduced,onReady}:{burst:boolean;hover:boolean;reduced:boolean;onReady:()=>void}){
 return <Canvas dpr={[1,1.25]} camera={{position:[0,0,5],fov:38}} gl={{alpha:false,antialias:true,powerPreference:'high-performance'}}><ResponsiveCamera/><Trail burst={burst} reduced={reduced} onReady={onReady}/><InteractionSparks reduced={reduced}/><EffectComposer multisampling={0}><Bloom intensity={.85} luminanceThreshold={.55} luminanceSmoothing={.7} mipmapBlur /></EffectComposer></Canvas>;
}
