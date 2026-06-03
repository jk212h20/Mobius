#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { spawn, spawnSync } = require('child_process');

const PORT = Number(process.env.KLEIN_SMOKE_PORT || 3137);
const URL = `http://127.0.0.1:${PORT}/klein.html?smoke=${Date.now()}`;
const root = path.join(__dirname, '..');

function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryOnce() {
      const req = http.get(URL, res => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry(new Error(`HTTP ${res.statusCode}`));
      });
      req.on('error', retry);
      req.setTimeout(800, () => { req.destroy(new Error('timeout')); });
    }
    function retry(err) {
      if (Date.now() - start > timeoutMs) reject(err);
      else setTimeout(tryOnce, 150);
    }
    tryOnce();
  });
}

function firefoxPath() {
  const candidates = [
    process.env.FIREFOX_BIN,
    '/Applications/Firefox.app/Contents/MacOS/firefox',
    '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
    'firefox',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes('/') && fs.existsSync(c)) return c;
    if (!c.includes('/')) {
      const r = spawnSync('which', [c], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    }
  }
  return null;
}

function parsePngRgba(file) {
  const data = fs.readFileSync(file);
  if (!data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('not a PNG');
  let pos = 8, w = 0, h = 0, bit = 0, color = 0; const idat = [];
  while (pos < data.length) {
    const n = data.readUInt32BE(pos); const typ = data.subarray(pos+4, pos+8).toString('ascii'); const chunk = data.subarray(pos+8, pos+8+n); pos += 12 + n;
    if (typ === 'IHDR') { w = chunk.readUInt32BE(0); h = chunk.readUInt32BE(4); bit = chunk[8]; color = chunk[9]; }
    if (typ === 'IDAT') idat.push(chunk);
    if (typ === 'IEND') break;
  }
  if (bit !== 8 || color !== 6) throw new Error(`expected 8-bit RGBA PNG, got bit=${bit} color=${color}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp, rows = []; let i = 0; let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[i++]; const scan = raw.subarray(i, i + stride); i += stride; const recon = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? recon[x-bpp] : 0, b = prev[x], c = x >= bpp ? prev[x-bpp] : 0, val = scan[x]; let r;
      if (filter === 0) r = val;
      else if (filter === 1) r = val + a;
      else if (filter === 2) r = val + b;
      else if (filter === 3) r = val + Math.floor((a + b) / 2);
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c); const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c); r = val + pr; }
      else throw new Error(`unsupported PNG filter ${filter}`);
      recon[x] = r & 255;
    }
    rows.push(recon); prev = recon;
  }
  return { w, h, rows };
}

function analyzePng(file) {
  const { w, h, rows } = parsePngRgba(file);
  let bright = 0, centralBright = 0, centralColored = 0, levelishNonUi = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const x0 = Math.floor(w * 0.22), x1 = Math.floor(w * 0.82), y0 = Math.floor(h * 0.12), y1 = Math.floor(h * 0.86);
  function isUi(x, y) { return (x < 590 && y < 260) || (x > 930 && y < 330) || (x > 930 && y > 540); }
  function isLevelish(r, g, b) {
    const sum = r + g + b, sat = Math.max(r, g, b) - Math.min(r, g, b);
    return sum > 70 && sat > 25 && !(r > 200 && g > 200 && b > 200) && !(r > 130 && g > 80 && b < 90);
  }
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const k = x * 4, r = row[k], g = row[k+1], b = row[k+2], a = row[k+3];
      if (!a) continue;
      const isBright = r + g + b > 90;
      if (isBright) bright++;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        if (isBright) centralBright++;
        if (g > 70 && b > 90 && r < 210) centralColored++;
      }
      if (!isUi(x, y) && isLevelish(r, g, b)) {
        levelishNonUi++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  const levelBBox = levelishNonUi ? [minX, minY, maxX, maxY] : null;
  return { w, h, bright, centralBright, centralColored, levelishNonUi, levelBBox };
}

async function main() {
  const ff = firefoxPath();
  if (!ff) throw new Error('Firefox not found. Set FIREFOX_BIN to run render smoke test.');
  const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  server.stdout.on('data', d => { logs += d; });
  server.stderr.on('data', d => { logs += d; });
  try {
    await waitForServer();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klein-smoke-'));
    const profile = path.join(tmp, 'profile'); fs.mkdirSync(profile);
    const png = path.join(tmp, 'klein.png');
    const r = spawnSync(ff, ['--headless', '--new-instance', '--profile', profile, '--screenshot', png, '--window-size', '1280,720', URL], { encoding: 'utf8', timeout: 30000 });
    if (r.status !== 0) throw new Error(`Firefox screenshot failed (${r.status})\nstdout=${r.stdout}\nstderr=${r.stderr}`);
    if (!fs.existsSync(png) || fs.statSync(png).size < 5000) throw new Error(`screenshot missing or tiny: ${png}`);
    const stats = analyzePng(png);
    console.log('klein render smoke stats', { ...stats, png });
    if (stats.levelishNonUi < 2000) throw new Error(`level render appears blank/hidden outside UI: ${JSON.stringify(stats)}`);
    console.log('klein render smoke passed');
  } finally {
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 1000).unref();
  }
}

main().catch(err => { console.error(err && err.stack || err); process.exit(1); });
