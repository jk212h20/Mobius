#!/usr/bin/env node
const C = require('../course-core.js');
const TAU = C.constants.TAU;
const maxRatio = Number(process.env.MAX_RATIO || 2.8);
const minRatio = Number(process.env.MIN_RATIO || 0.35);
const maxStepRatio = Number(process.env.MAX_STEP_RATIO || 1.45);
const samples = Number(process.env.SAMPLES || 720);
function d(a,b){return C.len(C.sub(a,b));}
const failures=[]; let worst={ratio:1}, worstStep={ratio:1};
for(const u of [0.05,0.25,0.5,0.75,0.95]){
  let prevLen=null;
  for(let i=0;i<samples;i++){
    const q0=i/samples*TAU, q1=(i+1)/samples*TAU;
    const seg=d(C._debug.sideLoopCore(q0,u),C._debug.sideLoopCore(q1,u));
    const mid=(q0+q1)/2;
    const nominal=seg/(TAU/samples);
    if(prevLen!==null){const r=Math.max(seg/prevLen,prevLen/seg); if(r>worstStep.ratio)worstStep={q:mid,u,ratio:r,seg,prevLen}; if(r>maxStepRatio)failures.push({type:'step-ratio',q:mid,u,ratio:r,seg,prevLen});}
    prevLen=seg;
  }
}
// compare local metric near seams to central side-loop median-ish metric
for(const u of [0.05,0.25,0.5,0.75,0.95]){
  const ref=[]; for(let i=240;i<480;i+=20){const q0=i/samples*TAU,q1=(i+1)/samples*TAU;ref.push(d(C._debug.sideLoopCore(q0,u),C._debug.sideLoopCore(q1,u))/(TAU/samples));}
  ref.sort((a,b)=>a-b); const median=ref[Math.floor(ref.length/2)];
  for(let i=0;i<samples;i++){
    const q0=i/samples*TAU,q1=(i+1)/samples*TAU,mid=(q0+q1)/2;
    if(!(mid<2.3||mid>TAU-2.3))continue;
    const metric=d(C._debug.sideLoopCore(q0,u),C._debug.sideLoopCore(q1,u))/(TAU/samples);
    const ratio=metric/median;
    const rec={q:mid,u,ratio,metric,median};
    if(Math.max(ratio,1/ratio)>Math.max(worst.ratio,1/worst.ratio))worst=rec;
    if(ratio>maxRatio||ratio<minRatio)failures.push({type:'metric-ratio',...rec});
  }
}
const result={pass:failures.length===0,thresholds:{minRatio,maxRatio,maxStepRatio},worst,worstStep,failureCount:failures.length,failures:failures.slice(0,20)};
console.log(JSON.stringify(result,null,2));
if(!result.pass)process.exit(1);
