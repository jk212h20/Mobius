#!/usr/bin/env node
const { chromium } = (() => { try { return require('playwright'); } catch (_) { return require('/tmp/node_modules/playwright'); } })();
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', msg => { if (msg.type() === 'error') console.error('[browser]', msg.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?level=diamond&autotest=1');
  await page.waitForFunction(() => window.__physInfo && window.MobiusCourse);
  await page.waitForTimeout(1000);
  const result = await page.evaluate(async () => {
    const C = window.MobiusCourse, TAU = Math.PI * 2, W = C.constants.W, DT = 1 / 120;
    function vdist(a,b){ const dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }
    function cdot(a,b){ return a.x*b.x+a.y*b.y+a.z*b.z; }
    function clen(a){ return Math.sqrt(cdot(a,a)); }
    function angle(a,b){ return Math.acos(Math.max(-1,Math.min(1,cdot(a,b)/(clen(a)*clen(b)))))*180/Math.PI; }
    function currentVisual() {
      const fr = currentRouteFrame();
      const fw = tangentPlaneHeading(fr.up, fr.along).clone();
      const speedAmt = clamp(Math.abs(race.speed) / MAX_SPEED, 0, 1);
      const pos = fr.contact.clone().addScaledVector(fr.up, CAR_HEIGHT * cameraSettings.height).addScaledVector(fw, -cameraSettings.back);
      const look = pos.clone().addScaledVector(fw, cameraSettings.ahead + cameraSettings.speedAhead * speedAmt).addScaledVector(fr.up, -(cameraSettings.down + cameraSettings.speedDown * speedAmt));
      return { route: race.route, car: {x:fr.contact.x,y:fr.contact.y,z:fr.contact.z}, cam:{x:pos.x,y:pos.y,z:pos.z}, look:{x:look.x,y:look.y,z:look.z}, up:{x:fr.up.x,y:fr.up.y,z:fr.up.z}, heading:{x:fw.x,y:fw.y,z:fw.z}, t:race.t, s:race.s, sideQ:race.sideQ, sideU:race.sideU, speed:race.speed, lateralSpeed:race.lateralSpeed };
    }
    async function one(fromPositive, u, speed) {
      setRaceMode(true);
      for (const c of cells) { c.frontOn = false; c.backOn = false; }
      for (const c of sideCells) { c.frontOn = false; c.backOn = false; }
      race.route = 'main'; race.faceSign = 1; race.sideFaceSign = 1; race.sideCooldown = 0; race.transitionGrace = 0;
      race.t = sideLoopT0() + (sideLoopT1() - sideLoopT0()) * u;
      race.s = (fromPositive ? 1 : -1) * (W - speed * DT * .55);
      race.speed = speed;
      const out = fromPositive ? tangentS(race.t, race.s) : tangentS(race.t, race.s).multiplyScalar(-1);
      const along = tangentT(race.t, race.s);
      race.headingVec = along.clone().multiplyScalar(.2).add(out).normalize();
      const before = currentVisual();
      updateRaceCamera(DT);
      const after = currentVisual();
      return { fromPositive, u, speed, before, after, carJump: vdist(before.car, after.car), camJump: vdist(before.cam, after.cam), lookJump: vdist(before.look, after.look), upAngle: angle(before.up, after.up), headingAngle: angle(before.heading, after.heading), routeChanged: before.route !== after.route };
    }
    const samples = [];
    for (const fromPositive of [true,false]) for (const u of [.1,.25,.5,.75,.9]) for (const speed of [.2,.6,.9]) samples.push(await one(fromPositive,u,speed));
    samples.sort((a,b)=>Math.max(b.camJump,b.headingAngle/10,b.upAngle/10)-Math.max(a.camJump,a.headingAngle/10,a.upAngle/10));
    return { worst: samples.slice(0,10), runtimeErrors: window.__mobiusRuntimeErrors || [] };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
