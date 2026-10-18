#!/usr/bin/env node
/** Read-only static gate. A passing result is never an attestation of test execution or deployment. */
import { readFile } from 'node:fs/promises';
import { auditPortfolioContract } from '../packages/portfolio-contracts/src/index.js';
const [contractPath, mappingsPath, previousPath, approvalsPath] = process.argv.slice(2);
if (!contractPath || !mappingsPath || Boolean(previousPath) !== Boolean(approvalsPath)) {
  console.error('Usage: node scripts/portfolio-contracts.mjs CONTRACT.md test-mappings.json [PREVIOUS-CONTRACT.md change-approvals.json]');
  process.exit(2);
}
try {
  const result = auditPortfolioContract({
    currentMarkdown: await readFile(contractPath, 'utf8'),
    testMappings: JSON.parse(await readFile(mappingsPath, 'utf8')),
    ...(previousPath ? {
      previousMarkdown: await readFile(previousPath, 'utf8'),
      approvals: JSON.parse(await readFile(approvalsPath, 'utf8'))
    } : {})
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.readyForIndependentVerification) process.exitCode = 1;
} catch (error) {
  console.error(`Portfolio contract audit failed: ${error.message}`);
  process.exitCode = 1;
}
