#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/tmp/node_modules/playwright')); }

const root = path.resolve(__dirname, '..');
const dataDir = process.env.MOBIUS_DATA_DIR || path.join('/tmp', `mobius-persist-${Date.now()}`);
const port = Number(process.env.PORT || 34123);
const base = `http://127.0.0.1:${port}`;

function request(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(base + pathname, { method, headers: data ? { 'content-type': 'application/json', 'content-length': data.length } : {} }, res => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', c => out += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(out) }); }
        catch { resolve({ status: res.statusCode, text: out }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
function waitForServer(proc) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const tick = async () => {
      if (proc.exitCode !== null) return reject(new Error('server exited early'));
      try { const r = await request('GET', '/api/version'); if (r.status === 200) return resolve(); } catch {}
      if (Date.now() > deadline) return reject(new Error('server did not start'));
      setTimeout(tick, 250);
    };
    tick();
  });
}
function startServer() {
  fs.mkdirSync(dataDir, { recursive: true });
  const proc = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), MOBIUS_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', d => process.stdout.write('[server] ' + d));
  proc.stderr.on('data', d => process.stderr.write('[server err] ' + d));
  return proc;
}
async function makeRun() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('file://' + path.join(root, 'index.html') + '?level=mobius&autotest=1', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => typeof window.__makeVerifiedTestRun === 'function', null, { timeout: 45000 });
    const result = await page.evaluate(() => window.__makeVerifiedTestRun({ scenario: 'straight', maxFrames: 22000 }));
    await page.close();
    if (!result || !result.pass || !result.run) throw new Error('failed to create verified run: ' + JSON.stringify(result && result.failures));
    return result.run;
  } finally {
    await browser.close();
  }
}
(async () => {
  let proc = startServer();
  try {
    await waitForServer(proc);
    const run = await makeRun();
    const post = await request('POST', '/api/runs', { run, handle: 'PERSIST_TEST', address: 'test-prize-address' });
    console.log('POST', post.status, JSON.stringify(post.json && { ok: post.json.ok, saved: post.json.saved }));
    if (post.status !== 200 || !post.json.ok || !post.json.saved) throw new Error('submission not saved');
    const id = post.json.saved.id;
    proc.kill();
    await new Promise(r => proc.once('exit', r));
    proc = startServer();
    await waitForServer(proc);
    const lb = await request('GET', '/api/leaderboard?level=mobius');
    const found = lb.json && lb.json.entries && lb.json.entries.find(e => e.id === id);
    const replay = await request('GET', `/api/run?level=mobius&id=${encodeURIComponent(id)}`);
    console.log('GET leaderboard', lb.status, !!found, 'GET replay', replay.status, replay.json && replay.json.ok);
    if (!found) throw new Error('saved entry missing after restart');
    if (replay.status !== 200 || !replay.json.ok || !replay.json.run) throw new Error('stored replay missing after restart');
    console.log(`Persistence test passed. Data dir: ${dataDir}`);
  } finally {
    if (proc && proc.exitCode === null) proc.kill();
  }
})().catch(e => { console.error(e.stack || e); process.exit(1); });
