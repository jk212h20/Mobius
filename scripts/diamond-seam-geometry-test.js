#!/usr/bin/env node
const C = require('../course-core.js');
const TAU = C.constants.TAU;
const W = C.constants.W;
const samples = Number(process.env.SAMPLES || 1600);
const maxNormalStepDeg = Number(process.env.MAX_NORMAL_STEP_DEG || 0.6);
const maxAlongStepDeg = Number(process.env.MAX_ALONG_STEP_DEG || 0.7);
const maxSeamPositionGap = Number(process.env.MAX_SEAM_GAP || 1e-5);
function angle(a, b) { return Math.acos(Math.max(-1, Math.min(1, C.dot(C.norm(a), C.norm(b))))) * 180 / Math.PI; }
function dist(a, b) { return C.len(C.sub(a, b)); }
function routeFrame(q, u, sideDir = 1, sideFaceSign = 1) { return C.sideRouteFrame({ level: 'diamond', race: { sideQ: q, sideU: u, sideDir, sideFaceSign } }); }
let worstNormal = { deg: 0 }, worstAlong = { deg: 0 }, worstGap = { gap: 0 };
const failures = [];
for (const u of [0.05, 0.25, 0.5, 0.75, 0.95]) {
  for (let i = 0; i < samples; i++) {
    const q0 = i / samples * TAU;
    const q1 = (i + 1) / samples * TAU;
    const n0 = C._debug.sideLoopNormal(q0, u);
    const n1 = C._debug.sideLoopNormal(q1, u);
    const nd = angle(n0, n1);
    if (nd > worstNormal.deg) worstNormal = { q: q0, u, deg: nd };
    if (nd > maxNormalStepDeg) failures.push({ type: 'normal-step', q: q0, u, deg: nd });
    const a0 = routeFrame(q0, u).along;
    const a1 = routeFrame(q1, u).along;
    const ad = angle(a0, a1);
    if (ad > worstAlong.deg) worstAlong = { q: q0, u, deg: ad };
    if (ad > maxAlongStepDeg) failures.push({ type: 'along-step', q: q0, u, deg: ad });
  }
}
for (const positive of [true, false]) for (let i = 0; i <= 64; i++) {
  const u = i / 64;
  const t = 18 / 144 * TAU + (30 - 18) / 144 * TAU * u;
  const main = C.rawPoint('diamond', t, positive ? W : -W);
  const side = C._debug.sideLoopCore(positive ? 0 : TAU, positive ? u : 1 - u);
  const gap = dist(main, side);
  if (gap > worstGap.gap) worstGap = { positive, u, gap };
  if (gap > maxSeamPositionGap) failures.push({ type: 'seam-gap', positive, u, gap });
}
const result = { pass: failures.length === 0, thresholds: { maxNormalStepDeg, maxAlongStepDeg, maxSeamPositionGap }, worstNormal, worstAlong, worstGap, failureCount: failures.length, failures: failures.slice(0, 10) };
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exit(1);
