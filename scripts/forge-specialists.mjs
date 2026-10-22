#!/usr/bin/env node
// Read-only operator CLI. Does not contact an LLM or dispatch tasks.
import { proposeForgeSpecialists, buildForgeQuestionBatch, buildForgeContextHandoff } from '../services/control-api/src/forge-specialist-routing.js';

const command = process.argv[2];
if (!['propose', 'questions', 'handoff'].includes(command) || process.argv.length !== 3) {
  console.error('Usage: node scripts/forge-specialists.mjs propose|questions|handoff < input.json');
  process.exitCode = 2;
} else {
  try {
    const chunks = []; let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 128 * 1024) throw new Error('forge_cli_input_too_large');
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = command === 'propose' ? proposeForgeSpecialists(input)
      : command === 'questions' ? buildForgeQuestionBatch(input.questions, input.options)
        : buildForgeContextHandoff(input.plan, input.options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write('REA Forge specialists: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
