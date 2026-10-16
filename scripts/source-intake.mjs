#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

import { validateSourceIdentityResolutionReceipt } from '../packages/evidence/src/source-resolution.js';
import {
  createSourceAccessObservation,
  createSourceAccessRequest,
} from '../packages/evidence/src/source-access-context.js';
import {
  advanceSourceIntake,
  validateSourceIntakeTransition,
} from '../packages/evidence/src/source-intake.js';

function usage() {
  process.stderr.write([
    'Usage:',
    '  node scripts/source-intake.mjs <resolution-receipt.json>',
    '  node scripts/source-intake.mjs <resolution-receipt.json> --provider <browser-read|reddit-authenticated-read> --canonical-url <reddit-post-url> --evidence-ref <reference>',
    '',
    'The first form emits a capability-gated access request when needed.',
    'The second form binds a trusted observation to that exact blocker and resumes REA evidence discovery.',
  ].join('\n') + '\n');
  process.exitCode = 2;
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const receiptPath = process.argv[2];
if (!receiptPath || receiptPath.startsWith('--')) {
  usage();
} else {
  try {
    const resolutionReceipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (!validateSourceIdentityResolutionReceipt(resolutionReceipt)) {
      throw new Error('input file is not an intact source identity resolution receipt');
    }

    let accessRequest = null;
    let accessObservation = null;
    if (resolutionReceipt.state === 'unresolved' && resolutionReceipt.errorCode === 'ACCESS_CONTEXT_REQUIRED') {
      accessRequest = createSourceAccessRequest({ blockedResolution: resolutionReceipt });
      const provider = argValue('--provider');
      const canonicalUrl = argValue('--canonical-url');
      const evidenceRef = argValue('--evidence-ref');
      const observationArgs = [provider, canonicalUrl, evidenceRef].filter(Boolean).length;
      if (observationArgs !== 0 && observationArgs !== 3) {
        throw new Error('--provider, --canonical-url, and --evidence-ref must be supplied together');
      }
      if (observationArgs === 3) {
        accessObservation = createSourceAccessObservation({
          request: accessRequest,
          provider,
          canonicalUrl,
          evidenceRef,
        });
      }
    }

    const intakeTransition = advanceSourceIntake({
      resolutionReceipt,
      accessRequest,
      accessObservation,
    });
    if (!validateSourceIntakeTransition(intakeTransition)) {
      throw new Error('source intake produced an invalid transition');
    }

    process.stdout.write(`${JSON.stringify({
      contractVersion: 'source-intake-package/v1',
      resolutionReceipt,
      accessRequest,
      accessObservation,
      intakeTransition,
    }, null, 2)}\n`);

    if (intakeTransition.gate !== 'TARGET_IDENTITY_RESOLVED') process.exitCode = 3;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      contractVersion: 'source-intake-error/v1',
      error: error?.message || String(error),
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
