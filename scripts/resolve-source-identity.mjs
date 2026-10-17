#!/usr/bin/env node

import { lookup } from 'node:dns/promises';

import {
  createSourceIdentityResolver,
  validateSourceIdentityResolutionReceipt,
} from '../packages/evidence/src/source-resolution.js';

function usage() {
  console.error('Usage: node scripts/resolve-source-identity.mjs <source-id> <reddit-share-url>');
  process.exitCode = 2;
}

const [, , sourceId, sourceUrl] = process.argv;
if (!sourceId || !sourceUrl) {
  usage();
} else {
  const resolver = createSourceIdentityResolver({
    resolveHost: (hostname) => lookup(hostname, { all: true, verbatim: true }),
  });

  try {
    const receipt = await resolver({ sourceId, url: sourceUrl, profile: 'reddit-share' });
    if (!validateSourceIdentityResolutionReceipt(receipt)) {
      throw new Error('source identity resolver produced an invalid receipt');
    }
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    if (receipt.state !== 'resolved') process.exitCode = 3;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      contractVersion: 'source-identity-resolution-error/v1',
      sourceId,
      requestedUrl: sourceUrl,
      error: error?.message || String(error),
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
