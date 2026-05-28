#!/usr/bin/env node
const C = require('../course-core.js');
const TAU = C.constants.TAU;
const W = C.constants.W;
const DT = 1 / 120;
const p = C.levelParams('diamond');
const blankMain = '0'.repeat(p.cols * p.rows);
const blankSide = '0'.repeat(p.sideCols * p.rows);

// This is a deterministic regression test for the Diamond Ring seam. It samples
// legal seam-crossing states immediately before route changes and fails if the
// route switch adds visible teleport distance beyond a normal high-speed frame.
const maxExtra = Number(process.env.MAX_EXTRA || 0.0015);
const samples = Number(process.env.SAMPLES || 21);

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
function pos(st) { return C.currentRouteFrame(st).contact; }
function dist(a, b) { return C.len(C.sub(a, b)); }
function normalFrameEnvelope(beforeRace) {
  // Generous upper envelope for one rendered 120Hz physics frame. A seam switch
  // should never add more than epsilon beyond this even at high speed.
  const speed = Math.abs(beforeRace.speed || 0);
  const lateral = Math.abs(beforeRace.lateralSpeed || 0);
  return (speed * 2.6 + lateral * 1.25 + 0.03) * DT;
}
function setOutwardHeading(st, fromPositive, alongMix = .2) {
  const out = fromPositive ? C.tangentS('diamond', st.race.t, st.race.s) : C.mul(C.tangentS('diamond', st.race.t, st.race.s), -1);
  const along = C.tangentT('diamond', st.race.t, st.race.s);
  st.race.headingVec = C.norm(C.add(C.mul(along, alongMix), out));
}
function testEnter() {
  const failures = [];
  let worst = null, count = 0;
  for (const fromPositive of [true, false]) for (const face of [1, -1]) {
    for (let i = 1; i < samples; i++) {
      const u = i / samples;
      for (const speed of [.06, .18, .34, .55, .85]) {
        const st = makeState('main');
        st.race.t = (18 / 144 * TAU) + (30 - 18) / 144 * TAU * u;
        // Put the car just inside the edge so this frame crosses the seam naturally.
        st.race.s = (fromPositive ? 1 : -1) * (W - speed * DT * .55);
        st.race.faceSign = face;
        st.race.speed = speed;
        setOutwardHeading(st, fromPositive);
        const before = pos(st);
        const beforeRace = { ...st.race };
        st.frame = 0;
        C.stepPhysics(st, 1);
        if (st.race.route !== 'side') continue;
        count++;
        const d = dist(before, pos(st));
        const allowed = normalFrameEnvelope(beforeRace);
        const extra = Math.max(0, d - allowed);
        const rec = { type: 'enter', fromPositive, face, u: +u.toFixed(4), speed, d, allowed, extra, sideQ: st.race.sideQ, sideU: st.race.sideU };
        if (!worst || extra > worst.extra) worst = rec;
        if (extra > maxExtra) failures.push(rec);
      }
    }
  }
  return { count, worst, failures };
}
function testExit() {
  const failures = [];
  let worst = null, count = 0;
  for (const toPositive of [true, false]) for (const sideFaceSign of [1, -1]) {
    for (let i = 1; i < samples; i++) {
      const u = i / samples;
      for (const speed of [.06, .18, .34, .55, .85]) {
        const st = makeState('side');
        st.race.sideDir = toPositive ? -1 : 1;
        st.race.sideQ = toPositive ? speed * DT * .55 : TAU - speed * DT * .55;
        st.race.sideU = u;
        st.race.sideFaceSign = sideFaceSign;
        st.race.speed = speed;
        st.race.headingVec = C.sideRouteFrame(st).along;
        const before = pos(st);
        const beforeRace = { ...st.race };
        st.frame = 0;
        C.stepPhysics(st, 1);
        if (st.race.route !== 'main') continue;
        count++;
        const d = dist(before, pos(st));
        const allowed = normalFrameEnvelope(beforeRace);
        const extra = Math.max(0, d - allowed);
        const rec = { type: 'exit', toPositive, sideFaceSign, u: +u.toFixed(4), speed, d, allowed, extra, t: st.race.t, s: st.race.s };
        if (!worst || extra > worst.extra) worst = rec;
        if (extra > maxExtra) failures.push(rec);
      }
    }
  }
  return { count, worst, failures };
}

const enter = testEnter();
const exit = testExit();
const failures = [...enter.failures, ...exit.failures];
const result = {
  pass: failures.length === 0,
  thresholds: { maxExtra },
  enter: { count: enter.count, worst: enter.worst, failures: enter.failures.slice(0, 10) },
  exit: { count: exit.count, worst: exit.worst, failures: exit.failures.slice(0, 10) },
  failureCount: failures.length
};
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exit(1);
