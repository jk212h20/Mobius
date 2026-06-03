#!/usr/bin/env node
'use strict';

const TAU=Math.PI*2, R=3.05, r=1.05, projectionAngle=.72;
function mod(x,m){return ((x%m)+m)%m}
function v3(x=0,y=0,z=0){return {x,y,z}}
function sub(a,b){return v3(a.x-b.x,a.y-b.y,a.z-b.z)}
function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z}
function cross(a,b){return v3(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x)}
function mul(a,s){return v3(a.x*s,a.y*s,a.z*s)}
function len(a){return Math.sqrt(dot(a,a))}
function norm(a){const l=len(a); return l>1e-12?mul(a,1/l):v3(0,0,0)}
function addScaled(a,b,s){return v3(a.x+b.x*s,a.y+b.y*s,a.z+b.z*s)}
function embed4(u,v){return {x:(R+r*Math.cos(v))*Math.cos(u), y:(R+r*Math.cos(v))*Math.sin(u), z:r*Math.sin(v)*Math.cos(u/2), w:r*Math.sin(v)*Math.sin(u/2)}}
function project4(p,mode=2){
  if(mode===0)return v3(p.x,p.y,p.z);
  if(mode===1){const d=5.2,k=d/(d-p.w); return v3(p.x*k,p.y*k,p.z*k)}
  const ca=Math.cos(projectionAngle),sa=Math.sin(projectionAngle);
  const z=p.z*ca-p.w*sa,w=p.z*sa+p.w*ca,d=6.4,k=d/(d-w); return v3(p.x*k,p.y*k,z*k);
}
function pos(u,v,mode=2){return project4(embed4(u,v),mode)}
function basisAt(u,v,mode=2){
  const e=.002,p=pos(u,v,mode),pu=mul(sub(pos(u+e,v,mode),pos(u-e,v,mode)),1/(2*e)),pv=mul(sub(pos(u,v+e,mode),pos(u,v-e,mode)),1/(2*e));
  const eu=norm(pu); let ev=addScaled(pv,eu,-dot(pv,eu)); ev=norm(ev); let n=norm(cross(eu,ev)); if(dot(n,n)<.5)n=v3(0,0,1); return {p,eu,ev,n,guu:dot(pu,pu),gvv:dot(pv,pv)};
}
function frameStep(state,dt,accel=1,steer=0,oldWrap=false){
  state={...state};
  state.speed+=accel*1.55*dt; state.speed*=Math.exp(-.48*dt); state.speed=Math.max(-.7,Math.min(1.75,state.speed));
  state.heading+=steer*(1.45+.75*Math.abs(state.speed))*dt*Math.sign(state.speed||1);
  const coordU=oldWrap?state.u:state.uUnwrapped;
  const b=basisAt(coordU,state.v);
  const gu=Math.sqrt(Math.max(b.guu,.0001)), gv=Math.sqrt(Math.max(b.gvv,.0001));
  const du=Math.cos(state.heading)*state.speed/gu*dt, dv=Math.sin(state.heading)*state.speed/gv*dt;
  state.uUnwrapped+=du; state.u+=du; state.v+=dv;
  if(oldWrap){
    while(state.u>=TAU){state.u-=TAU; state.v=-state.v; state.heading=-state.heading;}
    while(state.u<0){state.u+=TAU; state.v=-state.v; state.heading=-state.heading;}
  } else state.u=mod(state.uUnwrapped,TAU*2);
  state.v=mod(state.v+Math.PI,TAU)-Math.PI;
  return state;
}
function carFrame(state,oldWrap=false){
  const b=basisAt(oldWrap?state.u:state.uUnwrapped,state.v);
  const forward=norm(addScaled(mul(b.eu,Math.cos(state.heading)),b.ev,Math.sin(state.heading)));
  const right=norm(cross(forward,b.n)); const up=norm(cross(right,forward));
  return {p:b.p,forward,up,n:b.n};
}
function angle(a,b){return Math.acos(Math.max(-1,Math.min(1,dot(norm(a),norm(b)))))}
function assert(cond,msg){if(!cond)throw new Error(msg)}

function maxAcrossSeam(oldWrap){
  let maxPos=0,maxUp=0,maxFwd=0;
  for(const vv of [-2.4,-1.1,-.2,.7,1.9])for(const h of [-1.2,-.2,.6,1.4]){
    let s={u:TAU-.0005,uUnwrapped:TAU-.0005,v:vv,heading:h,speed:.28};
    const before=carFrame(s,oldWrap);
    s=frameStep(s,.01,0,0,oldWrap);
    const after=carFrame(s,oldWrap);
    maxPos=Math.max(maxPos,len(sub(after.p,before.p)));
    maxUp=Math.max(maxUp,angle(after.up,before.up));
    maxFwd=Math.max(maxFwd,angle(after.forward,before.forward));
  }
  return {maxPos,maxUp,maxFwd};
}

const fixed=maxAcrossSeam(false);
console.log('fixed/unwrapped seam deltas', fixed);
assert(fixed.maxPos<0.03, `position jump too large: ${fixed.maxPos}`);
assert(fixed.maxUp<0.08, `up-frame jump too large: ${fixed.maxUp}`);
assert(fixed.maxFwd<0.08, `forward-frame jump too large: ${fixed.maxFwd}`);

const old=maxAcrossSeam(true);
console.log('old/wrapped seam deltas', old);
assert(old.maxUp>1.0, 'regression check expected old wrapped chart to have a large normal flip');
console.log('klein smoothness test passed');
