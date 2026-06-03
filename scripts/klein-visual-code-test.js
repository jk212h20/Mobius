#!/usr/bin/env node
'use strict';
const TAU=Math.PI*2, R=3.05, r=1.05;
function mod(x,m){return ((x%m)+m)%m}
function embed4(u,v){return {x:(R+r*Math.cos(v))*Math.cos(u),y:(R+r*Math.cos(v))*Math.sin(u),z:r*Math.sin(v)*Math.cos(u/2),w:r*Math.sin(v)*Math.sin(u/2)}}
function areaCode(u,v){const p=embed4(u,v); const base=mod(Math.atan2(p.y,p.x)/TAU,1); const band1=.5+.5*Math.sin(1.7*p.x+2.1*p.y+3.4*p.z+4.2*p.w); const band2=.5+.5*Math.sin(3.3*p.x-1.4*p.y+2.6*p.z-3.8*p.w); const band3=.5+.5*Math.cos(2.2*p.x+3.1*p.y-4.1*p.z+1.9*p.w); return {base,band1,band2,band3}}
function circDist(a,b){let d=Math.abs(a-b); return Math.min(d,1-d)}
function codeDist(a,b){return Math.max(circDist(a.base,b.base),Math.abs(a.band1-b.band1),Math.abs(a.band2-b.band2),Math.abs(a.band3-b.band3))}
let max=0;
for(let i=0;i<80;i++)for(let j=0;j<70;j++){
  const u=(i/80-.5)*20*Math.PI, v=(j/70-.5)*16*Math.PI;
  const a=areaCode(u,v);
  max=Math.max(max, codeDist(a,areaCode(u,v+TAU)));
  max=Math.max(max, codeDist(a,areaCode(u+TAU,-v)));
}
console.log('max visual code identification error', max);
if(max>1e-10) throw new Error(`visual code is not Klein-invariant: ${max}`);
console.log('klein visual code test passed');
