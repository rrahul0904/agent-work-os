import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {compileContext,priceSession} from "../src/index.js";
const fixturePath=fileURLToPath(new URL("../../../docs/reverse-engineering/minnimemory-context-economics.fixtures.json",import.meta.url));
const fixtures=JSON.parse(await readFile(fixturePath,"utf8"));
test("REA owned fixtures: scoped selection and unsafe exclusions",()=>{
 for(const case_ of fixtures.fileLayoutCases.filter(x=>x.sources)){
  const result=compileContext({scope:"repo-a",task:case_.task,sources:case_.sources,budgetBytes:4096});
  for(const p of case_.expect.mustInclude??[]) assert.ok(result.manifest.selected.some(s=>s.path===p),case_.id+" missing "+p);
  for(const p of case_.expect.mustExcludeCurrent??[]) assert.ok(result.manifest.omitted.some(s=>s.path===p),case_.id+" stale "+p);
  for(const p of case_.expect.neverInclude??[]) assert.ok(!result.manifest.selected.some(s=>s.path===p),case_.id+" unsafe "+p);
  assert.equal(result.manifest.grantsExecutionAuthority,false);
 }
});
test("REA owned synthetic price cases retain UNKNOWN and exact arithmetic",()=>{
 for(const case_ of fixtures.costCases.filter(x=>x.rates)){
  const actual=priceSession({rates:case_.rates,usage:case_.usage,profile:{mode:"synthetic"}});
  if(case_.expectedCost==="UNKNOWN") assert.equal(actual.status,"UNKNOWN");
  else assert.ok(Math.abs(actual.totalUSD-case_.expectedCostUSD)<=case_.tolerance);
 }
});
