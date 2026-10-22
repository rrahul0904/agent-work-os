import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeScope, buildBriefing, appendKnowledge, readKnowledge, storePathForWorkspace, prepareContextPrompt } from '../src/index.js';
const rec = (id, kind, scope, body, more={}) => ({id,kind,scope,body,source:'local:review',approved:true,reviewedBy:'owner',...more});

test('strict path normalization prevents traversal or host paths', () => {
  assert.equal(normalizeScope('/apps/api'),'/apps/api');
  assert.equal(normalizeScope('/'),'/');
  for (const value of ['/apps/../secrets', '/apps//api', 'C:/temp', '/apps\\api', '/./x', '/../x']) assert.throws(() => normalizeScope(value), /INVALID_SCOPE/);
});
test('inherit rules and scope memory without sibling leaks', () => {
  const rows=[rec('rootrule','rule','/','never deploy without gate'),rec('apirule','rule','/apps/api','use authenticated client'),rec('westrule','rule','/apps/web','frontend only'),rec('apimemory','memory','/apps/api','JWT token refresh'),rec('webmemory','memory','/apps/web','css variables')];
  const result=buildBriefing(rows,{target:'/apps/api/handlers',intent:'fix token refresh'});
  assert.deepEqual(result.included,['apirule','rootrule','apimemory']);
  assert.doesNotMatch(result.text,/frontend|css variables/);
  assert.equal(result.digest,buildBriefing(rows,{target:'/apps/api/handlers',intent:'fix token refresh'}).digest);
});
test('mandatory rules are never truncated; optional omitted by budget', () => {
  const mandatory=rec('base','rule','/','D'.repeat(250));
  assert.throws(() => buildBriefing([mandatory],{budgetChars:256}),/MANDATORY_RULE_OVER_BUDGET/);
  const result=buildBriefing([mandatory,rec('extra','memory','/','E'.repeat(250))],{budgetChars:430});
  assert.deepEqual(result.included,['base']); assert.deepEqual(result.omitted,['extra']);
});
test('unreviewed content, duplicate IDs, invalid bodies rejected', () => {
  assert.throws(()=>buildBriefing([{...rec('note','memory','/','body'), approved:false}]),/NOT_REVIEWED/);
  assert.throws(()=>buildBriefing([rec('note','memory','/','a'),rec('note','memory','/','b')]),/DUPLICATE_ID/);
});
test('workspace isolated persistence, deterministic opt-in injection, no opt-out change', async () => {
  const tmp=await mkdtemp(path.join(os.tmpdir(),'awos-context-'));
  try {
    const one=path.join(tmp,'one'), two=path.join(tmp,'two'), root=path.join(tmp,'private');
    await mkdir(one); await mkdir(two);
    const row=rec('reviewed-rule','rule','/','Use gate before release');
    await appendKnowledge(one,row,{root});
    assert.equal((await readKnowledge(one,{root})).length,1);
    assert.equal((await readKnowledge(two,{root})).length,0);
    assert.notEqual(await storePathForWorkspace(one,root),await storePathForWorkspace(two,root));
    await assert.rejects(appendKnowledge(one,row,{root}),/DUPLICATE_ID/);
    const off=await prepareContextPrompt({cwd:one,prompt:'change API'},{enabled:false,root});
    assert.equal(off.prompt,'change API');
    const on=await prepareContextPrompt({cwd:one,prompt:'change API'},{enabled:true,root});
    assert.match(on.prompt,/Use gate before release/); assert.match(on.prompt,/USER REQUEST:\nchange API/);
    assert.deepEqual(on.context.included,['reviewed-rule']);
  } finally { await rm(tmp,{recursive:true,force:true}); }
});
test('reject symlink store files', async () => {
  const tmp=await mkdtemp(path.join(os.tmpdir(),'awos-context-'));
  try {
    const cwd=path.join(tmp,'repo'), root=path.join(tmp,'storage'); await mkdir(cwd); await mkdir(root);
    const filename=await storePathForWorkspace(cwd,root);
    const decoy=path.join(tmp,'decoy'); await writeFile(decoy,'secret'); await symlink(decoy,filename);
    await assert.rejects(readKnowledge(cwd,{root}),/UNSAFE_STORE_FILE/);
    await assert.rejects(appendKnowledge(cwd,rec('a-rule','rule','/','body'),{root}),/UNSAFE_STORE_FILE/);
  } finally { await rm(tmp,{recursive:true,force:true}); }
});
