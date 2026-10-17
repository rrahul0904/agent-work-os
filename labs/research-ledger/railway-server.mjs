import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import researchHandler from './api/research.js';
import sourceStatusHandler from './api/source-status.js';

const port = Number(process.env.PORT || 3000);
const root = dirname(fileURLToPath(import.meta.url));
const maxBody = 256 * 1024;
const staticFiles = new Set([
  'index.html',
  'styles.css',
  'completion.css',
  'db-schema.js',
  'app.js',
  'completion.js',
  'semantic-core.js',
  'semantic-worker.js',
  'semantic-search.js',
  'hybrid-brief.js',
  'retrieval-benchmark.html',
  'retrieval-benchmark-core.js',
  'retrieval-benchmark.js'
]);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co; worker-src 'self' blob:; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
};

function send(res, status, payload, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(payload) : payload);
}

async function readJson(req) {
  let total = 0;
  const chunks = [];
  for await(const chunk of req) {
    total += chunk.length;
    if (total > maxBody) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function apiResponse(res) {
  return {
    code: 200,
    status(code) { this.code = code; return this; },
    json(payload) { send(res, this.code, payload); }
  };
}

async function serveStatic(pathname, method, res) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!staticFiles.has(requested)) return send(res, 404, { error: 'Not found' });
  const file = join(root, requested);
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not-file');
    const body = await readFile(file);
    res.writeHead(200, {
      ...securityHeaders,
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': extname(file) === '.html' ? 'no-store' : 'public, max-age=300'
    });
    res.end(method === 'HEAD' ? undefined : body);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      return send(res, 200, { ok: true, service: 'research-ledger', version: '0.3.0' });
    }

    if (url.pathname === '/api/research' || url.pathname === '/api/source-status') {
      const body = req.method === 'POST' ? await readJson(req) : {};
      const handler = url.pathname.endsWith('source-status') ? sourceStatusHandler : researchHandler;
      return await handler({ method: req.method, body }, apiResponse(res));
    }

    if (!['GET', 'HEAD'].includes(req.method || '')) return send(res, 405, { error: 'Method not allowed' });
    return await serveStatic(url.pathname, req.method, res);
  } catch (error) {
    return send(res, error.status || 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`research-ledger listening on ${port}`));
