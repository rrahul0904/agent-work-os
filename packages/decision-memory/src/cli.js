#!/usr/bin/env node
// Explicit, local-only Phase A controls; no automatic capture, network or MCP.
import { DecisionMemory } from './index.js';

function parse(argv) {
  const [command, ...tokens] = argv;
  const flags = {}; const args = [];
  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i];
    if (!item.startsWith('--')) { args.push(item); continue; }
    const key = item.slice(2);
    if (['history', 'repair'].includes(key)) flags[key] = true;
    else { if (!tokens[i + 1] || tokens[i + 1].startsWith('--')) throw new Error(`missing --${key} value`); flags[key] = tokens[++i]; }
  }
  return { command, flags, args };
}
const csv = value => value ? value.split(',').map(x => x.trim()).filter(Boolean) : [];
const display = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
export async function run(argv) {
  const { command, flags: f, args } = parse(argv);
  if (!command || command === 'help') {
    process.stdout.write('memory <init|log|list|search|inspect|edit|retract|handoff|recall|export|doctor> [--root directory] [flags]\n' +
      'log: --claim --choice --rationale --source --source-hash --actor [--verification verified] [--paths a,b]\n' +
      'edit: <id> --expect <revision> [--claim/--choice/--rationale/--source/--source-hash/--actor/--verification/--sensitivity/--paths/--tags]\n' +
      'retract: <id> --expect <revision> --reason text; handoff: --session --goal [--thread --machine --last-actions --changed-files --tasks --risks --next --checks]; recall: <handoff-id> --session <new-session-id> [--machine]\n'); return;
  }
  const root = f.root ?? process.cwd();
  const memory = command === 'init' ? await DecisionMemory.init(root, f.repository) : await DecisionMemory.open(root);
  if (command === 'init') return display({ scope: memory.scope });
  if (command === 'log') return display(await memory.log({ claim:f.claim, choice:f.choice, rationale:f.rationale, source:f.source, sourceHash:f['source-hash'], actor:f.actor, affectedPaths:csv(f.paths), tags:csv(f.tags), verification:f.verification, sensitivity:f.sensitivity, supersedesId:f.supersedes }));
  if (command === 'list' || command === 'search') return display(await memory.list({ history: Boolean(f.history), query: command === 'search' ? (args[0] ?? f.query ?? '') : '' }));
  if (command === 'inspect') return display(await memory.inspect(args[0]));
  if (command === 'edit') {
    const edits = {}; for (const k of ['claim','choice','rationale','source','actor','verification','sensitivity']) if (f[k] !== undefined) edits[k] = f[k];
    if (f['source-hash'] !== undefined) edits.sourceHash = f['source-hash'];
    if (f.paths !== undefined) edits.affectedPaths = csv(f.paths);
    if (f.tags !== undefined) edits.tags = csv(f.tags);
    return display(await memory.edit(args[0], Number(f.expect), edits));
  }
  if (command === 'retract') return display(await memory.retract(args[0], Number(f.expect), f.reason));
  if (command === 'handoff') return display(await memory.handoff({ fromSessionId:f.session, nativeThreadId:f.thread, machineId:f.machine, goal:f.goal, lastActions:csv(f['last-actions']), changedFiles:csv(f['changed-files']), openTasks:csv(f.tasks), risks:csv(f.risks), nextAction:f.next, checks:csv(f.checks) }));
  if (command === 'recall') return display(await memory.recall(args[0], f.session, f.machine ?? ''));
  if (command === 'export') return process.stdout.write(await memory.export(f.format ?? 'json'));
  if (command === 'doctor') {
    const result = await memory.doctor({ repair: Boolean(f.repair) }); display(result); if (!result.ok) process.exitCode = 2; return;
  }
  throw new Error(`unknown memory command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) run(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
