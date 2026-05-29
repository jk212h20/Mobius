#!/usr/bin/env node
const { chromium } = (() => { try { return require('playwright'); } catch (_) { return require('/tmp/node_modules/playwright'); } })();
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.stack || e)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?level=diamond&autotest=1');
  await page.waitForFunction(() => window.__diamondJerkProbe || window.__mobiusStarted, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const result = await page.evaluate(async () => {
    if (typeof window.__diamondJerkProbe !== 'function') return { pass: false, failures: ['missing __diamondJerkProbe'], globals: Object.keys(window).filter(k => k.includes('diamond')).sort() };
    const cases = [
      window.__diamondJerkProbe({ maxFrames: 2200, name: 'outer-entry' }),
      window.__diamondJerkProbe({ maxFrames: 2200, name: 'outer-entry-repeat' })
    ];
    return { pass: cases.every(c => c.pass), cases, failures: cases.flatMap(c => c.failures || []) };
  });
  result.pageErrors = errors;
  if (errors.length) result.pass = false;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (!result.pass) process.exit(1);
})();
