const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const MobiusReplay = require('./replay-core.js');

const port = process.env.PORT || 3000;
const root = __dirname;
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
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
