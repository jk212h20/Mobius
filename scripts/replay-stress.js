#!/usr/bin/env node
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/tmp/node_modules/playwright')); }
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = path.join(root, 'index.html');
const levels = (process.env.LEVELS || 'mobius,figure8,trefoil').split(',').filter(Boolean);
const scenarios = (process.env.SCENARIOS || 'straight,wiggle,terrain,life,mark').split(',').filter(Boolean);
const iterations = Number(process.env.ITERATIONS || 2);
const maxFrames = Number(process.env.MAX_FRAMES || 26000);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const level of levels) {
      for (const scenarioName of scenarios) {
        for (let i = 0; i < iterations; i++) {
          const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
          const errors = [];
          page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message || String(e))));
          page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });
          const url = 'file://' + index + `?level=${encodeURIComponent(level)}&autotest=1`;
          const scenario = scenarioName === 'mark' ? 'wiggle' : scenarioName;
          const markFrame = scenarioName === 'mark' ? 300 : 0;
          console.log(`\n== ${level} ${scenarioName} #${i + 1} ==`);
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForFunction(() => window.__mobiusStarted || (window.__mobiusRuntimeErrors && window.__mobiusRuntimeErrors.length), null, { timeout: 45000 });
            await page.waitForFunction(() => typeof window.__makeVerifiedTestRun === 'function', null, { timeout: 45000 });
            const result = await page.evaluate(({ scenario, markFrame, maxFrames }) => window.__makeVerifiedTestRun({ scenario, markFrame, maxFrames }), { scenario, markFrame, maxFrames });
            const summary = {
              pass: result && result.pass,
              level,
              scenario: scenarioName,
              frames: result && result.frames,
              failures: result && result.failures,
              verify: result && result.verification && result.verification.finished,
              runtimeErrors: await page.evaluate(() => window.__mobiusRuntimeErrors || []),
              errors
            };
            console.log(JSON.stringify(summary, null, 2));
            if (!summary.pass || summary.runtimeErrors.length || errors.length) failures.push(summary);
          } catch (err) {
            const failure = { pass: false, level, scenario: scenarioName, error: String(err && err.stack || err), errors };
            console.log(JSON.stringify(failure, null, 2));
            failures.push(failure);
          } finally {
            await page.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error('\nFAILURES:', JSON.stringify(failures, null, 2));
    process.exit(1);
  }
  console.log('\nAll replay stress checks passed.');
})().catch(e => { console.error(e.stack || e); process.exit(1); });
