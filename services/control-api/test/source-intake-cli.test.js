import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSourceIdentityResolver } from '../../../packages/evidence/src/source-resolution.js';

const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';

async function blockedReceipt() {
  const resolve = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('blocked', { status: 403 }),
  });
  return resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: '2026-10-16T19:25:00.000Z' });
}

test('source intake CLI emits access request before trusted context is available', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awos-source-intake-'));
  try {
    const receiptPath = join(dir, 'blocked.json');
    await writeFile(receiptPath, JSON.stringify(await blockedReceipt()), 'utf8');
    const result = spawnSync(process.execPath, ['scripts/source-intake.mjs', receiptPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.equal(result.status, 3);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.contractVersion, 'source-intake-package/v1');
    assert.equal(payload.accessRequest.requiredCapability, 'reddit-authenticated-or-browser-read');
    assert.equal(payload.accessObservation, null);
    assert.equal(payload.intakeTransition.gate, 'ACCESS_CONTEXT_REQUIRED');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('source intake CLI binds trusted observation and resumes REA discovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awos-source-intake-'));
  try {
    const receiptPath = join(dir, 'blocked.json');
    await writeFile(receiptPath, JSON.stringify(await blockedReceipt()), 'utf8');
    const stdout = execFileSync(process.execPath, [
      'scripts/source-intake.mjs', receiptPath,
      '--provider', 'browser-read',
      '--canonical-url', canonicalUrl,
      '--evidence-ref', 'browser-session:rea-229:redirect',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const payload = JSON.parse(stdout);
    assert.equal(payload.accessObservation.target.postId, '1abc234');
    assert.equal(payload.intakeTransition.gate, 'TARGET_IDENTITY_RESOLVED');
    assert.equal(payload.intakeTransition.nextAction, 'REA_EVIDENCE_DISCOVERY');
    assert.equal(payload.intakeTransition.accessObservationSha256, payload.accessObservation.observationSha256);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
