#!/usr/bin/env node
// Execute an existing, owner-tested Hermo workflow through its published API.
import { randomUUID } from 'node:crypto';
import { HermoClient, HermoClientError } from '../packages/browser-workflow/src/hermo-client.js';

const usage = 'Usage: HERMO_API_KEY=<scoped-key> node scripts/hermo.mjs contract | run <action-id> <json-input> [idempotency-key]';

async function main() {
  const [command, actionId, jsonInput, optionalKey] = process.argv.slice(2);
  if (!['contract', 'run'].includes(command)) throw new Error(usage);
  const client = new HermoClient({ baseUrl: process.env.HERMO_BASE_URL, apiKey: process.env.HERMO_API_KEY });
  if (command === 'contract') {
    process.stdout.write(`${JSON.stringify(await client.contract(), null, 2)}\n`);
    return;
  }
  if (!actionId || !jsonInput) throw new Error(usage);
  let input;
  try { input = JSON.parse(jsonInput); }
  catch { throw new Error('Input must be valid JSON, e.g. {"search_query":"laptop"}.'); }
  const idempotencyKey = optionalKey || process.env.HERMO_IDEMPOTENCY_KEY || randomUUID();
  // Print before POST: the key is required to safely recover a lost admission response.
  process.stderr.write(`Idempotency-Key: ${idempotencyKey}\n`);
  const receipt = await client.submit(actionId, input, { idempotencyKey });
  process.stderr.write(`Accepted run: ${receipt.runId}${receipt.reused ? ' (existing)' : ''}\n`);
  const result = await client.waitForRun(receipt, {
    onStatus: (status) => process.stderr.write(`Run status: ${status}\n`),
    timeoutMs: Number(process.env.HERMO_POLL_TIMEOUT_MS || 120000)
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  if (error instanceof HermoClientError) process.stderr.write(`${error.code}: ${error.message}\n`);
  else process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
