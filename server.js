const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const MobiusReplay = require('./replay-core.js');

const port = process.env.PORT || 3000;
const root = __dirname;
const dataDir = process.env.MOBIUS_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, '.data');
const leaderboardFile = path.join(dataDir, 'leaderboard.json');
const buildSha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || (() => { try { return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore','pipe','ignore'] }).toString().trim(); } catch { return 'local-dev'; } })();

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function readBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
function safeLevel(level) {
  return ['mobius', 'figure8', 'trefoil'].includes(level) ? level : null;
}
function sanitizeText(value, max = 32) {
  return String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
}
function shortHash(value) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}
function loadLeaderboard() {
  try { return JSON.parse(fs.readFileSync(leaderboardFile, 'utf8')); }
  catch { return { schema: 1, levels: { mobius: [], figure8: [], trefoil: [] } }; }
}
function saveLeaderboard(board) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = leaderboardFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2));
  fs.renameSync(tmp, leaderboardFile);
}
function publicEntry(e) {
  return { id: e.id, level: e.level, rank: e.rank, time: e.time, frame: e.frame, inputs: e.inputs, handle: e.handle || '', address: e.address || '', submittedAt: e.submittedAt, buildSha: e.buildSha, replayPass: true, hasReplay: !!e.run };
}
function rankedEntries(board, level) {
  const rows = (board.levels[level] || []).slice().sort((a, b) => a.time - b.time || a.submittedAt.localeCompare(b.submittedAt)).slice(0, 10);
  return rows.map((e, i) => publicEntry({ ...e, rank: i + 1 }));
}
function normalizeRunPayload(payload) {
  if (payload && (payload.type === 'mobius-run-claim' || payload.type === 'mobius-inputs-only')) return payload.run;
  return payload && (payload.run || payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    const level = safeLevel(url.searchParams.get('level') || 'mobius');
    if (!level) return json(res, 400, { ok: false, error: 'unsupported level' });
    const board = loadLeaderboard();
    return json(res, 200, { ok: true, buildSha, level, entries: rankedEntries(board, level) });
  }
  if (url.pathname === '/api/run' && req.method === 'GET') {
    const level = safeLevel(url.searchParams.get('level') || 'mobius');
    const id = sanitizeText(url.searchParams.get('id') || '', 80);
    if (!level || !id) return json(res, 400, { ok: false, error: 'missing level/id' });
    const board = loadLeaderboard();
    const entry = (board.levels[level] || []).find(e => e.id === id);
    if (!entry || !entry.run) return json(res, 404, { ok: false, error: 'replay not found' });
    return json(res, 200, { ok: true, buildSha, entry: publicEntry(entry), run: entry.run });
  }
  if (url.pathname === '/api/runs' && req.method === 'POST') {
    try {
      const payload = JSON.parse(await readBody(req) || '{}');
      const run = normalizeRunPayload(payload);
      const level = safeLevel(run && (run.level || run.snapshot && run.snapshot.level));
      if (!level) return json(res, 400, { ok: false, error: 'only mobius, figure8, and trefoil lap runs are supported for the leaderboard right now' });
      const verification = MobiusReplay.verifyRun(run, { maxFrames: Math.round(120 * 300) });
      if (!verification.pass || verification.summary.finished?.kind !== 'lap') return json(res, 422, { ok: false, buildSha, failures: verification.failures, summary: verification.summary });
      const finished = verification.summary.finished;
      const board = loadLeaderboard();
      board.levels[level] = board.levels[level] || [];
      const handle = sanitizeText(payload.handle || run.handle || 'ANON', 24) || 'ANON';
      const address = sanitizeText(payload.address || run.address || '', 96);
      const id = shortHash(JSON.stringify({ level, snapshot: run.snapshot, inputs: run.inputs, finished }));
      const storedRun = JSON.parse(JSON.stringify(run));
      const entry = { id, level, time: finished.time, frame: finished.frame, inputs: (run.inputs || []).length, handle, address, submittedAt: new Date().toISOString(), buildSha: run.buildSha || run.snapshot?.buildSha || buildSha, run: storedRun };
      const existing = board.levels[level].findIndex(e => e.id === id);
      if (existing >= 0) board.levels[level][existing] = { ...board.levels[level][existing], ...entry };
      else board.levels[level].push(entry);
      board.levels[level].sort((a, b) => a.time - b.time || a.submittedAt.localeCompare(b.submittedAt));
      board.levels[level] = board.levels[level].slice(0, 10);
      saveLeaderboard(board);
      const entries = rankedEntries(board, level);
      const saved = entries.find(e => e.id === id) || null;
      return json(res, 200, { ok: true, buildSha, level, saved, entries, summary: verification.summary });
    } catch (err) {
      return json(res, 400, { ok: false, error: String(err && err.message || err) });
    }
  }
  if (url.pathname === '/api/verify-run' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}');
      const run = payload.run || payload;
      const verification = MobiusReplay.verifyRun(run);
      json(res, verification.pass ? 200 : 422, { ok: verification.pass, buildSha, failures: verification.failures, summary: verification.summary });
    } catch (err) {
      json(res, 400, { ok: false, error: String(err && err.message || err) });
    }
    return;
  }
  if (url.pathname === '/api/version') {
    json(res, 200, { buildSha });
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const file = path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    let out = data;
    if (path.basename(file) === 'index.html') {
      out = Buffer.from(data.toString('utf8').replace('<script src="replay-core.js"></script>', `<script>window.__MOBIUS_BUILD_SHA=${JSON.stringify(buildSha)}</script><script src="replay-core.js"></script>`));
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'cache-control': path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=60'
    });
    res.end(out);
  });
});

server.listen(port, () => {
  console.log(`Mobius topology racer listening on ${port} (${buildSha})`);
});
