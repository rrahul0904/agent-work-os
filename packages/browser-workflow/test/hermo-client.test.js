import test from 'node:test';
import assert from 'node:assert/strict';
import { HermoClient } from '../src/hermo-client.js';

const key = 'fixture-local-key';
const make = (fetchImpl, sleep) => new HermoClient({ apiKey: key, fetchImpl, sleep });
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('requires local origin and scoped API key', () => {
  for (const baseUrl of ['https://remote.example/', 'http://localhost.evil/', 'http://user:pass@localhost:4317/', 'http://127.0.0.1:4317/else']) {
    assert.throws(() => new HermoClient({ baseUrl, apiKey: key }), { code: 'INVALID_BASE_URL' });
  }
  assert.throws(() => new HermoClient(), { code: 'MISSING_API_KEY' });
});

test('returns published contract without sending secret to another origin', async () => {
  const client = make(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:4317/v1/action-contract');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.redirect, 'manual');
    return reply({ action_id: 'test.lookup' });
  });
  assert.deepEqual(await client.contract(), { action_id: 'test.lookup' });
  assert.throws(() => client.safePath('http://evil.test/v1/runs/1'), { code: 'INVALID_STATUS_URL' });
  assert.throws(() => client.safePath('http://127.0.0.1:4317@evil.test/v1/runs/1'), { code: 'INVALID_STATUS_URL' });
});

test('submits with correct key and returns only independently verified result', async () => {
  let calls = 0;
  const client = make(async (url, options) => {
    calls++;
    if (calls === 1) {
      assert.match(url, /\/v1\/actions\/catalog.lookup\/versions\/1\/runs$/);
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Idempotency-Key'], 'same-request-0001');
      assert.deepEqual(JSON.parse(options.body), { input: { search_query: 'laptop' } });
      return reply({ run_id: 'r01', status_url: '/v1/runs/r01', reused: false }, 202);
    }
    assert.equal(url, 'http://127.0.0.1:4317/v1/runs/r01');
    return calls === 2 ? reply({ status: 'running' }) : reply({ status: 'succeeded', result: { title: 'Laptop' } });
  }, async () => {});
  const receipt = await client.submit('catalog.lookup', { search_query: 'laptop' }, { idempotencyKey: 'same-request-0001' });
  assert.equal(receipt.runId, 'r01');
  const result = await client.waitForRun(receipt);
  assert.deepEqual(result, { title: 'Laptop' });
  assert.equal(calls, 3);
});

test('refuses remote callback and does not replay an uncertain submission', async () => {
  let calls = 0;
  const client = make(async () => { calls++; return reply({ run_id: 'x', status_url: 'https://attacker.example/steal' }, 202); });
  await assert.rejects(client.submit('test.lookup', {}, { idempotencyKey: 'replay-safe-001' }), { code: 'INVALID_STATUS_URL' });
  assert.equal(calls, 1);
  const unreachable = make(async () => { throw new Error(`token=${key}`); });
  await assert.rejects(unreachable.submit('test.lookup', {}, { idempotencyKey: 'replay-safe-001' }), (err) => err.code === 'TRANSPORT_ERROR' && !err.message.includes(key));
});

test('requires validated success and leaves failed submissions for manual inspection', async () => {
  const client = make(async () => reply({ status: 'failed', error: { code: 'EXECUTION_OUTCOME_UNKNOWN' } }));
  await assert.rejects(client.waitForRun({ statusUrl: '/v1/runs/x', runId: 'x' }), { code: 'RUN_NOT_SUCCEEDED' });
  const missingResult = make(async () => reply({ status: 'succeeded' }));
  await assert.rejects(missingResult.waitForRun({ statusUrl: '/v1/runs/x', runId: 'x' }), { code: 'MISSING_RESULT' });
});

test('rejects unsafe action and input before any request', async () => {
  let called = false;
  const client = make(async () => { called = true; return reply({}); });
  await assert.rejects(client.submit('../admin', {}), { code: 'INVALID_ACTION' });
  await assert.rejects(client.submit('example.run', []), { code: 'INVALID_INPUT' });
  await assert.rejects(client.submit('example.run', {}, { idempotencyKey: 'weak' }), { code: 'INVALID_IDEMPOTENCY_KEY' });
  assert.equal(called, false);
});
