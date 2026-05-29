#!/usr/bin/env node
// Dense before/after benchmark of seam-crossing teleport jump and metric step.
// Reports the worst "extra" distance a single seam-crossing frame adds beyond a
// normal high-speed physics frame, plus the parametric-velocity (metric) step.
const C = require('../course-core.js');
const TAU = C.constants.TAU, W = C.constants.W, R = C.constants.R;
const DT = 1 / 120;
const p = C.levelParams('diamond');
const blankMain = '0'.repeat(p.cols * p.rows);
const blankSide = '0'.repeat(p.sideCols * p.rows);
const SAMPLES = Number(process.env.SAMPLES || 81);
const SPEEDS = [0.06, 0.18, 0.34, 0.55, 0.85, 1.0];

function makeState(route = 'main') {
  return C.makeStateFromSnapshot({
    level: 'diamond',
    snapshot: {
      level: 'diamond', cols: p.cols, sideCols: p.sideCols, rows: p.rows,
      physHz: 120, lifeEvery: 26, lifeRunning: false, lifeStepCounter: 0,
      cells: blankMain, sideCells: blankSide,
      pose: { route, t: (18 + 30) / 2 / 144 * TAU, s: 0, sideQ: 0, sideU: .5, sideDir: 1, faceSign: 1, sideFaceSign: 1, speed: 0, lateralSpeed: 0, headingVec: { x: 0, y: 1, z: 0 }, sideCooldown: 0, transitionGrace: 0 }
    }
  });
}
const pos = st => C.currentRouteFrame(st).contact;
const dist = (a, b) => C.len(C.sub(a, b));
function envelope(r) { return (Math.abs(r.speed || 0) * 2.6 + Math.abs(r.lateralSpeed || 0) * 1.25 + 0.03) * DT; }
function setOutwardHeading(st, fromPositive, alongMix = .2) {
  const out = fromPositive ? C.tangentS('diamond', st.race.t, st.race.s) : C.mul(C.tangentS('diamond', st.race.t, st.race.s), -1);
  const along = C.tangentT('diamond', st.race.t, st.race.s);
  st.race.headingVec = C.norm(C.add(C.mul(along, alongMix), out));
}

function run(kind) {
  let worst = { extra: 0 }, worstMetric = { step: 0 }, n = 0;
  for (const fromPositive of [true, false]) for (const face of [1, -1]) {
    for (let i = 1; i < SAMPLES; i++) {
      const u = i / SAMPLES;
      for (const speed of SPEEDS) {
        const st = makeState(kind === 'enter' ? 'main' : 'side');
        if (kind === 'enter') {
          st.race.t = (18 / 144 * TAU) + (30 - 18) / 144 * TAU * u;
          st.race.s = (fromPositive ? 1 : -1) * (W - speed * DT * .55);
          st.race.faceSign = face;
          setOutwardHeading(st, fromPositive);
        } else {
          st.race.sideDir = fromPositive ? -1 : 1;
          st.race.sideQ = fromPositive ? speed * DT * .55 : TAU - speed * DT * .55;
          st.race.sideU = u;
          st.race.sideFaceSign = face;
          st.race.headingVec = C.sideRouteFrame(st).along;
        }
        st.race.speed = speed;
        const before = pos(st);
        const metricBefore = C.currentRouteFrame(st).alongMetric;
        const beforeRace = { ...st.race };
        const wantRoute = kind === 'enter' ? 'side' : 'main';
        st.frame = 0; C.stepPhysics(st, 1);
        if (st.race.route !== wantRoute) continue;
        n++;
        const extra = Math.max(0, dist(before, pos(st)) - envelope(beforeRace));
        const metricAfter = C.currentRouteFrame(st).alongMetric;
        const step = Math.abs(metricAfter - metricBefore);
        if (extra > worst.extra) worst = { extra, fromPositive, face, u: +u.toFixed(4), speed };
        if (step > worstMetric.step) worstMetric = { step, fromPositive, face, u: +u.toFixed(4), speed, metricBefore, metricAfter };
      }
    }
  }
  return { n, worstExtra: worst, worstMetricStep: worstMetric };
}

const MAX_EXTRA = Number(process.env.MAX_EXTRA || 0.004);
const result = { enter: run('enter'), exit: run('exit') };
const worst = Math.max(result.enter.worstExtra.extra, result.exit.worstExtra.extra);
result.thresholds = { maxExtra: MAX_EXTRA };
result.worstExtra = worst;
result.pass = worst <= MAX_EXTRA;
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exit(1);
