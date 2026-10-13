import http from 'node:http';
import { analyzeObservations, normalizeKeyword } from './engine.mjs';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY_BYTES = 256 * 1024;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store'
  });
  res.end(payload);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid JSON body'), { statusCode: 400 });
  }
}

async function googleAutocomplete(seedKeyword, language = 'en') {
  const url = new URL('https://suggestqueries.google.com/complete/search');
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('hl', language);
  url.searchParams.set('q', seedKeyword);
  const response = await fetch(url, { headers: { 'user-agent': 'seo-keyword-intelligence/0.1' } });
  if (!response.ok) throw new Error(`autocomplete failed with HTTP ${response.status}`);
  const data = await response.json();
  const suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
  return suggestions.slice(0, 25).map((keyword) => ({ keyword, source: 'google-autocomplete' }));
}

async function yepRequest(path, body, apiKey) {
  const response = await fetch(`https://api.yepapi.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'user-agent': 'seo-keyword-intelligence/0.1'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const message = payload?.error?.message || payload?.error || `YepAPI ${path} failed with HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return payload?.data?.keywords || [];
}

function asObservations(rows, source) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    keyword: row.keyword,
    source,
    volume: row.volume ?? null,
    difficulty: row.difficulty ?? null,
    cpc: row.cpc ?? null,
    competition: row.competition ?? null,
    intent: row.intent ?? 'unknown',
    metadata: {
      competitionLevel: row.competitionLevel,
      serpFeatures: row.serpFeatures,
      trend: row.trend
    }
  })).filter((row) => normalizeKeyword(row.keyword));
}

async function research(input) {
  const seedKeyword = normalizeKeyword(input.seedKeyword || input.seed || '');
  if (!seedKeyword) throw Object.assign(new Error('seedKeyword is required'), { statusCode: 400 });
  if (seedKeyword.length > 160) throw Object.assign(new Error('seedKeyword is too long'), { statusCode: 400 });

  const language = String(input.language || 'en').slice(0, 10);
  const locationCode = Number.isFinite(Number(input.locationCode)) ? Number(input.locationCode) : 2840;
  const useYepApi = input.useYepApi === true;
  const extraObservations = Array.isArray(input.observations) ? input.observations.slice(0, 1000) : [];
  const warnings = [];
  const observations = [...extraObservations];

  try {
    observations.push(...await googleAutocomplete(seedKeyword, language));
  } catch (error) {
    warnings.push({ provider: 'google-autocomplete', error: error.message });
  }

  if (useYepApi) {
    const apiKey = process.env.YEP_API_KEY;
    if (!apiKey) {
      warnings.push({ provider: 'yepapi', error: 'useYepApi=true but YEP_API_KEY is not configured' });
    } else {
      const payload = { keyword: seedKeyword, limit: Math.min(Number(input.limit || 50), 100), location_code: locationCode, language };
      const [ideasResult, relatedResult] = await Promise.allSettled([
        yepRequest('/v1/seo/keywords/ideas', payload, apiKey),
        yepRequest('/v1/seo/keywords/related', payload, apiKey)
      ]);

      if (ideasResult.status === 'fulfilled') observations.push(...asObservations(ideasResult.value, 'yepapi-ideas'));
      else warnings.push({ provider: 'yepapi-ideas', error: ideasResult.reason?.message || String(ideasResult.reason) });

      if (relatedResult.status === 'fulfilled') observations.push(...asObservations(relatedResult.value, 'yepapi-related'));
      else warnings.push({ provider: 'yepapi-related', error: relatedResult.reason?.message || String(relatedResult.reason) });

      const autocompleteKeywords = observations
        .filter((item) => item.source === 'google-autocomplete')
        .map((item) => normalizeKeyword(item.keyword))
        .filter(Boolean)
        .slice(0, 100);

      if (autocompleteKeywords.length) {
        try {
          const enriched = await yepRequest('/v1/seo/keywords', { keywords: autocompleteKeywords, location_code: locationCode, language }, apiKey);
          observations.push(...asObservations(enriched, 'yepapi-metrics'));
        } catch (error) {
          warnings.push({ provider: 'yepapi-metrics', error: error.message });
        }
      }
    }
  }

  const analysis = analyzeObservations(observations, input.options || {});
  return {
    seedKeyword,
    mode: useYepApi ? 'hybrid' : 'free-discovery',
    warnings,
    ...analysis
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, service: 'seo-keyword-intelligence' });
    if (req.method === 'POST' && url.pathname === '/research') return json(res, 200, await research(await readJson(req)));
    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || 'internal_error' });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`seo-keyword-intelligence listening on http://${HOST}:${PORT}\n`);
});
