import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const MAX_URLS = 8;
const MAX_BYTES = 64 * 1024;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 7000;

function isPrivateV4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 192 && p[1] === 0 && p[2] === 2) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19)) ||
    (p[0] === 198 && p[1] === 51 && p[2] === 100) ||
    (p[0] === 203 && p[1] === 0 && p[2] === 113) ||
    p[0] >= 224;
}

function isPrivateV6(ip) {
  const s = String(ip).toLowerCase();
  return s === '::' ||
    s === '::1' ||
    s.startsWith('fc') ||
    s.startsWith('fd') ||
    /^fe[89ab]/.test(s) ||
    s.startsWith('ff') ||
    s.startsWith('::ffff:') ||
    s.startsWith('2001:db8:');
}

function hostnameOf(url) {
  return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
}

export function validatePublicHttpUrl(raw) {
  const url = new URL(String(raw));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only public HTTP(S) URLs are allowed');
  if (url.username || url.password) throw new Error('Credential-bearing URLs are refused');
  const host = hostnameOf(url);
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    throw new Error('Local/private hostnames are refused');
  }
  if (isIP(host)) throw new Error('IP-literal URLs are refused; use a public hostname');
  return url;
}

async function resolvePublicAddress(url) {
  const answers = await lookup(hostnameOf(url), { all: true, verbatim: true });
  if (!answers.length) throw new Error('Hostname did not resolve');
  for (const answer of answers) {
    if ((answer.family === 4 && isPrivateV4(answer.address)) || (answer.family === 6 && isPrivateV6(answer.address))) {
      throw new Error('Hostname resolves to a private or non-routable network destination');
    }
  }
  return answers[0];
}

function pinnedLookup(answer) {
  return (_hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (options?.all) return callback(null, [{ address: answer.address, family: answer.family }]);
    return callback(null, answer.address, answer.family);
  };
}

function requestPinned(url, answer) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'ResearchLedger-Freshness/0.3',
        'Range': `bytes=0-${MAX_BYTES - 1}`,
        'Accept': 'text/html,text/plain,application/json,application/pdf;q=0.8,*/*;q=0.2'
      },
      lookup: pinnedLookup(answer),
      servername: hostnameOf(url)
    }, resolve);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      const error = new Error('Request timed out');
      error.name = 'AbortError';
      req.destroy(error);
    });
    req.on('error', reject);
    req.end();
  });
}

function readBounded(response) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    response.on('data', chunk => {
      if (settled || size >= MAX_BYTES) return;
      const remain = MAX_BYTES - size;
      const slice = chunk.length > remain ? chunk.subarray(0, remain) : chunk;
      chunks.push(Buffer.from(slice));
      size += slice.length;
      if (size >= MAX_BYTES) {
        finish();
        response.destroy();
      }
    });
    response.on('end', finish);
    response.on('aborted', () => {
      if (!settled) reject(new Error('Response aborted before the bounded sample completed'));
    });
    response.on('error', error => {
      if (!settled) reject(error);
    });
  });
}

function header(response, name) {
  const value = response.headers[name];
  return Array.isArray(value) ? value.join(', ') : String(value || '');
}

async function boundedFetch(raw) {
  let url = validatePublicHttpUrl(raw);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const answer = await resolvePublicAddress(url);
    const response = await requestPinned(url, answer);
    const status = response.statusCode || 0;

    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = header(response, 'location');
      response.resume();
      if (!location) throw new Error('Redirect missing location');
      url = validatePublicHttpUrl(new URL(location, url).toString());
      continue;
    }

    const body = await readBounded(response);
    const etag = header(response, 'etag');
    const lastModified = header(response, 'last-modified');
    const contentLength = header(response, 'content-length');
    const contentType = header(response, 'content-type');
    const fingerprint = createHash('sha256')
      .update(`${status}\n${etag}\n${lastModified}\n${contentLength}\n${contentType}\n`)
      .update(body)
      .digest('hex');

    return {
      url: String(url),
      ok: status >= 200 && status < 300,
      status,
      etag,
      lastModified,
      contentLength,
      contentType,
      fingerprint,
      sampledBytes: body.length,
      fetchedAt: new Date().toISOString()
    };
  }
  throw new Error('Too many redirects');
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ service: 'source-status', maxUrls: MAX_URLS, maxSampleBytes: MAX_BYTES, dnsPinning: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const urls = Array.isArray(req.body?.urls) ? req.body.urls.slice(0, MAX_URLS) : [];
  if (!urls.length) return res.status(400).json({ error: 'At least one URL is required' });
  const results = [];
  for (const raw of urls) {
    try {
      results.push(await boundedFetch(raw));
    } catch (error) {
      results.push({ url: String(raw), ok: false, error: error.name === 'AbortError' ? 'Request timed out' : error.message, fetchedAt: new Date().toISOString() });
    }
  }
  return res.status(200).json({ results });
}
