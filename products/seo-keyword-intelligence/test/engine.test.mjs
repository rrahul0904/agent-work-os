import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeObservations, inferIntent, normalizeKeyword } from '../src/engine.mjs';

test('normalizes punctuation, unicode and whitespace', () => {
  assert.equal(normalizeKeyword('  N8N   Self–Hosted Requirements!! '), 'n8n self hosted requirements');
});

test('infers common intent classes', () => {
  assert.equal(inferIntent('best n8n hosting'), 'commercial');
  assert.equal(inferIntent('buy managed n8n hosting'), 'transactional');
  assert.equal(inferIntent('how to self host n8n'), 'informational');
});

test('deduplicates equivalent observations and keeps provenance', () => {
  const result = analyzeObservations([
    { keyword: 'n8n self hosted requirements', source: 'google-autocomplete', volume: 1200, difficulty: 31 },
    { keyword: 'N8N self-hosted requirements', source: 'yepapi-related', volume: 1100, difficulty: 34 },
    { keyword: 'requirements for self hosting n8n', source: 'yepapi-ideas', volume: 900, difficulty: 29 },
    { keyword: 'n8n pricing', source: 'google-autocomplete', volume: 5400, difficulty: 55, cpc: 6.3 }
  ]);

  assert.equal(result.summary.inputObservations, 4);
  assert.equal(result.summary.providerCount, 3);
  assert.ok(result.summary.canonicalOpportunities < 4);

  const requirements = result.opportunities.find((item) => item.aliases.some((alias) => alias.toLowerCase().includes('requirements')));
  assert.ok(requirements);
  assert.ok(requirements.sources.includes('google-autocomplete'));
  assert.ok(requirements.sources.includes('yepapi-related'));
  assert.ok(requirements.confidenceScore > 50);
  assert.equal(requirements.reviewState, 'needs-human-review');
});

test('ranks commercial opportunities without auto-approving content', () => {
  const result = analyzeObservations([
    { keyword: 'best n8n hosting', source: 'a', volume: 3500, difficulty: 22, cpc: 8.2 },
    { keyword: 'what is n8n', source: 'a', volume: 4000, difficulty: 62, cpc: 0.8 }
  ]);

  const best = result.opportunities.find((item) => item.keyword === 'best n8n hosting');
  assert.equal(best.intent, 'commercial');
  assert.equal(best.pageType, 'commercial-article');
  assert.equal(best.reviewState, 'needs-human-review');
});
