#!/usr/bin/env node
const C = require('../course-core.js');
const R = require('../replay-core.js');
const TAU = C.constants.TAU, W = C.constants.W, DT = 1/120;
const p = C.levelParams('diamond');
const blank = '0'.repeat(p.cols*p.rows), side = '0'.repeat(p.sideCols*p.rows);
function heading(){const t=(18+30)/2/144*TAU;return C.norm(C.add(C.mul(C.tangentT('diamond',t,W),.12),C.tangentS('diamond',t,W)));}
const run={level:'diamond',snapshot:{level:'diamond',cols:p.cols,sideCols:p.sideCols,rows:p.rows,physHz:120,lifeEvery:26,lifeRunning:false,lifeStepCounter:0,cells:blank,sideCells:side,pose:{route:'main',t:(18+30)/2/144*TAU,s:W-.018,faceSign:1,sideFaceSign:1,speed:.42,lateralSpeed:0,headingVec:heading(),sideCooldown:0,transitionGrace:0}},inputs:[]};
function bitsFor(st){if(st.race.route==='side'){if(st.race.sideU>.56)return 1|8;if(st.race.sideU<.44)return 1|4;}return 1;}
const a=C.makeStateFromSnapshot(run), b=R.makeInitialState(run);let failures=[], entered=false, returned=false, max={pos:0,head:0,speed:0};
function posC(st){return C.currentRouteFrame(st).contact} function posR(st){return C.currentRouteFrame(st).contact}
function dist(a,b){return C.len(C.sub(a,b))} function angle(a,b){return Math.acos(Math.max(-1,Math.min(1,C.dot(C.norm(a),C.norm(b)))))*180/Math.PI}
for(let f=0;f<2200&&!returned;f++){
  const bits=bitsFor(a);
  a.frame=f; b.frame=f; C.stepPhysics(a,bits); R.stepPhysics(b,bits);
  if(a.race.route!==b.race.route)failures.push(`route mismatch frame ${f}: ${a.race.route} != ${b.race.route}`);
  const pc=posC(a), pr=posR(b); const pd=dist(pc,pr); max.pos=Math.max(max.pos,pd);
  const hd=angle(a.race.headingVec,b.race.headingVec); max.head=Math.max(max.head,hd);
  const sd=Math.abs(a.race.speed-b.race.speed); max.speed=Math.max(max.speed,sd);
  if(pd>1e-9)failures.push(`pos mismatch frame ${f}: ${pd}`);
  if(hd>1e-5)failures.push(`heading mismatch frame ${f}: ${hd}`);
  if(sd>1e-12)failures.push(`speed mismatch frame ${f}: ${sd}`);
  if(a.race.route==='side')entered=true; if(entered&&a.race.route==='main')returned=true;
}
const result={pass:failures.length===0&&entered&&returned,entered,returned,max,failures:failures.slice(0,20),failureCount:failures.length,final:{course:a.race,replay:b.race}};
console.log(JSON.stringify(result,null,2));
if(!result.pass)process.exit(1);
