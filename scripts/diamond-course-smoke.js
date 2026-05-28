#!/usr/bin/env node
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/tmp/node_modules/playwright')); }
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = path.join(root, 'index.html');
const maxFrames = Number(process.env.MAX_FRAMES || 9000);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message || String(e))));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });
  try {
    await page.goto('file://' + index + '?level=diamond&autotest=1', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.__mobiusStarted || (window.__mobiusRuntimeErrors && window.__mobiusRuntimeErrors.length), null, { timeout: 45000 });
    await page.waitForFunction(() => typeof window.__diamondCourseSmoke === 'function', null, { timeout: 45000 });
    const result = await page.evaluate(maxFrames => window.__diamondCourseSmoke({ maxFrames }), maxFrames);
    const runtimeErrors = await page.evaluate(() => window.__mobiusRuntimeErrors || []);
    const summary = { ...result, runtimeErrors, errors };
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.pass || runtimeErrors.length || errors.length) process.exit(1);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e.stack || e); process.exit(1); });
