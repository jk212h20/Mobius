#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const MobiusCourse = require('../course-core.js');
const MobiusReplay = require('../replay-core.js');

const TAU = Math.PI * 2;
const p = MobiusReplay.levelParams('diamond');
const blankMain = '0'.repeat(p.cols * p.rows);
const blankSide = '0'.repeat(p.sideCols * p.rows);
const START_T = 2.50;
const OPEN_MID = (18 + 30) / 2 / 144 * TAU;
const MAX_FRAMES = Number(process.env.MAX_FRAMES || 50000);

function snapshot() {
  return {
    reason: 'diamond-coin-natural-fixture',
    level: 'diamond',
    cols: p.cols,
    sideCols: p.sideCols,
    rows: p.rows,
    physHz: 120,
    lifeEvery: 26,
    lifeRunning: false,
    lifeStepCounter: 0,
    cells: blankMain,
    sideCells: blankSide,
    worldHash: '9f4d99d1d3648935',
    pose: {
      route: 'main',
      t: START_T,
      s: 0,
      sideQ: 0,
      sideU: 0.5,
      sideDir: 1,
      faceSign: 1,
      sideFaceSign: 1,
      speed: 0,
      lateralSpeed: 0,
      headingVec: { x: -Math.sin(START_T), y: Math.cos(START_T), z: 0 },
      sideCooldown: 0.45,
      transitionGrace: 0.35
    }
  };
}
function makeRun(inputs = []) {
  return { schema: 1, type: 'mobius-inputs-only', runId: 'diamond-coin-natural-fixture', buildSha: 'local-test', level: 'diamond', snapshot: snapshot(), inputs };
}
function copyState(st) {
  return {
    ...st,
    cells: st.cells,
    sideCells: st.sideCells,
    coins: st.coins.map(c => ({ spec: c.spec, collected: c.collected })),
    race: {
      ...st.race,
      headingVec: st.race.headingVec && { ...st.race.headingVec },
      upVec: st.race.upVec && { ...st.race.upVec }
    }
  };
}
function predict(st, bits, frames = 10) {
  const s = copyState(st);
  for (let i = 0; i < frames && !s.finished; i++) {
    s.frame = (st.frame || 0) + i;
    MobiusCourse.stepPhysics(s, bits);
  }
  return s;
}
function got(st, n) { return !!st.coins[n - 1].collected; }
function coinList(st) { return st.coins.filter(c => c.collected).map(c => c.spec.n); }
function fwdDelta(a, b) { return MobiusReplay.constants ? ((b - a) % TAU + TAU) % TAU : ((b - a) % TAU + TAU) % TAU; }
function stage(st, specs) {
  for (const n of [1, 2, 3]) if (!got(st, n)) return { type: 'main', n, t: specs[n - 1].t, s: 0, face: 1 };
  if (!got(st, 6)) {
    if (st.race.route !== 'side') return { type: 'entry', side: 1, t: OPEN_MID, s: 1.4 + 0.3, face: 1 };
    for (const n of [4, 5, 6]) if (!got(st, n)) return { type: 'side', n, q: specs[n - 1].q, u: 0.5, dir: 1, face: 1 };
  }
  if (st.race.route === 'side') return { type: 'exit', dir: 1 };
  for (const n of [7, 8, 9]) if (!got(st, n)) return { type: 'main', n, t: specs[n - 1].t, s: 0, face: -1 };
  if (!got(st, 12)) {
    if (st.race.route !== 'side') return { type: 'entry', side: 1, t: OPEN_MID, s: 1.4 + 0.3, face: -1 };
    for (const n of [10, 11, 12]) if (!got(st, n)) return { type: 'side', n, q: specs[n - 1].q, u: 0.5, dir: 1, face: -1 };
  }
  if (st.race.route === 'side') return { type: 'exit', dir: 1 };
  return { type: 'done' };
}
function cost(s, target) {
  const r = s.race;
  if (s.finished) return -1e9;
  let c = 0;
  const t = ((r.t % TAU) + TAU) % TAU;
  if (target.type === 'main') {
    if (r.route !== 'main') c += 999;
    c += fwdDelta(t, target.t) * 8 + Math.abs(r.s - target.s) * 8;
    if (r.faceSign !== target.face) c += 300;
  } else if (target.type === 'entry') {
    if (r.route === 'side') return -1e6;
    if (r.route !== 'main') c += 999;
    c += fwdDelta(t, target.t) * 5 + Math.abs(r.s - target.s) * 12;
    if (r.faceSign !== target.face) c += 300;
  } else if (target.type === 'side') {
    if (r.route !== 'side') c += 999;
    const dq = target.dir > 0 ? Math.max(0, target.q - r.sideQ) : Math.max(0, r.sideQ - target.q);
    c += dq * 10 + Math.abs(r.sideU - target.u) * 20;
    if (r.sideFaceSign !== target.face) c += 300;
  } else if (target.type === 'exit') {
    if (r.route !== 'side') return -1e6;
    c += (target.dir > 0 ? TAU - r.sideQ : r.sideQ) * 4 + Math.abs(r.sideU - 0.5) * 6;
  }
  c -= r.speed * 0.5;
  return c;
}
function chooseBits(st, specs) {
  const target = stage(st, specs);
  if (target.type === 'done') return { bits: 0, target };
  let best = { cost: Infinity, bits: 1, target };
  for (const bits of [1, 5, 9, 0, 2, 4, 8]) {
    const c = cost(predict(st, bits), target);
    if (c < best.cost) best = { cost: c, bits, target };
  }
  return best;
}
function generateRun() {
  const run = makeRun([]);
  const specs = MobiusReplay.diamondCoinSpecs();
  const st = MobiusCourse.makeStateFromSnapshot(run);
  const inputs = [];
  let lastBits = -1;
  for (let frame = 0; frame < MAX_FRAMES && !st.finished; frame++) {
    st.frame = frame;
    const chosen = chooseBits(st, specs);
    if (chosen.bits !== lastBits) {
      inputs.push({ frame, bits: chosen.bits });
      lastBits = chosen.bits;
    }
    MobiusCourse.stepPhysics(st, chosen.bits);
  }
  if (!st.finished) throw new Error(`diamond fixture did not finish; coins=${coinList(st).join(',')}`);
  return makeRun(inputs);
}

const run = generateRun();
const verifiedInputsOnly = MobiusReplay.verifyRun(run, { maxFrames: MAX_FRAMES });
const finished = verifiedInputsOnly.summary.finished;
const claim = JSON.parse(JSON.stringify(run));
claim.type = 'mobius-run-claim';
claim.finished = { ...finished, worldHashEnd: verifiedInputsOnly.summary.endHash };
const verifiedClaim = MobiusReplay.verifyRun(claim, { maxFrames: MAX_FRAMES });

const result = {
  pass: verifiedInputsOnly.pass && verifiedClaim.pass && finished && finished.kind === 'coins',
  inputsOnly: { pass: verifiedInputsOnly.pass, failures: verifiedInputsOnly.failures, summary: verifiedInputsOnly.summary },
  claim: { pass: verifiedClaim.pass, failures: verifiedClaim.failures, summary: verifiedClaim.summary },
  coins: verifiedInputsOnly.state.coins.filter(c => c.collected).map(c => c.spec.n),
  inputDeltas: run.inputs.length
};
console.log(JSON.stringify(result, null, 2));
if (process.env.WRITE_RUN) fs.writeFileSync(path.resolve(process.env.WRITE_RUN), JSON.stringify(claim, null, 2));
if (!result.pass) process.exit(1);
