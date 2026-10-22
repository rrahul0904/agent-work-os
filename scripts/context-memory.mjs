#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { appendKnowledge, readKnowledge, buildBriefing } from '../packages/path-context/src/index.js';

async function main() {
  const [action, directory = process.cwd(), ...rest] = process.argv.slice(2);
  const cwd = path.resolve(directory);
  const root = process.env.AGENT_WORK_OS_CONTEXT_HOME;
  if (action === 'add') {
    if (rest.length !== 1) throw new Error('add requires a JSON record filename');
    const row = JSON.parse(await readFile(rest[0], 'utf8'));
    const saved = await appendKnowledge(cwd, row, {root});
    process.stdout.write(JSON.stringify({saved:saved.id, scope:saved.scope})+'\n');
  } else if (action === 'list') {
    const records = await readKnowledge(cwd,{root});
    process.stdout.write(JSON.stringify(records.map(({id,kind,scope,source,reviewedBy})=>({id,kind,scope,source,reviewedBy})),null,2)+'\n');
  } else if (action === 'preview') {
    const [target = '/', ...intent] = rest;
    const records = await readKnowledge(cwd,{root});
    const briefing = buildBriefing(records,{target,intent:intent.join(' ')});
    process.stdout.write(JSON.stringify(briefing,null,2)+'\n');
  } else {
    process.stderr.write('Usage: node scripts/context-memory.mjs add|list|preview /absolute/workspace [record.json | /scope intent...]\n');
    process.exitCode = 2;
  }
}
main().catch((error)=>{ process.stderr.write(error.message+'\n'); process.exitCode = 1; });
