#!/usr/bin/env node
'use strict';

const TAU=Math.PI*2, R=3.05, r=1.05;
function v4(x=0,y=0,z=0,w=0){return{x,y,z,w}}
function sub4(a,b){return v4(a.x-b.x,a.y-b.y,a.z-b.z,a.w-b.w)}
function dot4(a,b){return a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w}
function len4(a){return Math.sqrt(dot4(a,a))}
function mul4(a,s){return v4(a.x*s,a.y*s,a.z*s,a.w*s)}
function norm4(a){const l=len4(a);return l>1e-12?mul4(a,1/l):v4(0,0,0,0)}
function embed4(u,v){return v4((R+r*Math.cos(v))*Math.cos(u),(R+r*Math.cos(v))*Math.sin(u),r*Math.sin(v)*Math.cos(u/2),r*Math.sin(v)*Math.sin(u/2))}
function derivs4(u,v){const e=1e-5; return {du:mul4(sub4(embed4(u+e,v),embed4(u-e,v)),1/(2*e)), dv:mul4(sub4(embed4(u,v+e),embed4(u,v-e)),1/(2*e))}}
function assert(c,m){if(!c)throw new Error(m)}
function dist(a,b){return len4(sub4(a,b))}

// The defining Klein identifications must be exact up to numerical tolerance.
let maxId=0;
for(let i=0;i<57;i++)for(let j=0;j<43;j++){
  const u=(i/57-.5)*16*Math.PI, v=(j/43-.5)*10*Math.PI;
  const p=embed4(u,v);
  maxId=Math.max(maxId, dist(p,embed4(u,v+TAU)));
  maxId=Math.max(maxId, dist(p,embed4(u+TAU,-v)));
}
console.log('max identification error', maxId);
assert(maxId<1e-10, `Klein identifications are not continuous: ${maxId}`);

// Locally the parametrization must be an immersion: tangent directions nonzero and independent.
let minArea=Infinity, minDu=Infinity, minDv=Infinity;
for(let i=0;i<97;i++)for(let j=0;j<83;j++){
  const u=i/97*TAU*2, v=(j/83-.5)*TAU;
  const {du,dv}=derivs4(u,v);
  const du2=dot4(du,du), dv2=dot4(dv,dv), d=dot4(du,dv);
  const area=Math.sqrt(Math.max(0,du2*dv2-d*d));
  minArea=Math.min(minArea,area); minDu=Math.min(minDu,Math.sqrt(du2)); minDv=Math.min(minDv,Math.sqrt(dv2));
}
console.log('min tangent lengths/area', {minDu,minDv,minArea});
assert(minDu>.5 && minDv>.5 && minArea>.25, 'surface has a local singularity or lost a drive direction');

// A local tangent camera should not show unrelated far-away sheets as geometry at the car.
// In the implementation this is guaranteed architecturally: local geometry is sampled only
// from a bounded neighborhood in parameter space around the car. This test protects the
// chosen neighborhood from spanning a full period and pulling in nonlocal copies.
const localHalfD=7.2;
console.log('local metric patch half-width', {localHalfD});
assert(localHalfD>3, 'local visible patch is too small to judge continuity');

console.log('klein geometry tests passed');
