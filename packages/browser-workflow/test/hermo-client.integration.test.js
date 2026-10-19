import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { HermoClient } from '../src/hermo-client.js';

test('real HTTP loopback fixture: submit, poll and produce result with no unsafe retry', async (t) => {
  let posted = 0;
  let polled = 0;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer fixture-scope');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && req.url === '/v1/actions/fixture.lookup/versions/1/runs') {
      posted++;
      assert.equal(req.headers['idempotency-key'], 'fixed-request-001');
      let body = '';
      for await (const chunk of req) body += chunk;
      assert.deepEqual(JSON.parse(body), { input: { query: 'hello' } });
      res.writeHead(202);
      res.end(JSON.stringify({ run_id: 'r-101', status_url: '/v1/runs/r-101' }));
    } else if (req.method === 'GET' && req.url === '/v1/runs/r-101') {
      polled++;
      res.end(JSON.stringify(polled === 1 ? { status: 'queued' } : { status: 'succeeded', result: { greeting: 'hello' } }));
    } else {
      res.writeHead(404);
      res.end('{}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); });
  const { port } = server.address();
  const client = new HermoClient({ baseUrl: `http://127.0.0.1:${port}`, apiKey: 'fixture-scope', sleep: async () => {} });
  const receipt = await client.submit('fixture.lookup', { query: 'hello' }, { idempotencyKey: 'fixed-request-001' });
  const result = await client.waitForRun(receipt);
  assert.deepEqual(result, { greeting: 'hello' });
  assert.equal(posted, 1);
  assert.equal(polled, 2);
});
