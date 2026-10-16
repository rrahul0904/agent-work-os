import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import handler from './api/research.js';

function invoke(method,body){
  return new Promise((resolve,reject)=>{
    const req={method,body};
    const res={code:200,status(n){this.code=n;return this},json(payload){resolve({status:this.code,payload})}};
    Promise.resolve(handler(req,res)).catch(reject);
  });
}

const original=process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
const get=await invoke('GET');
assert.equal(get.status,200);
assert.equal(get.payload.live,false);
const post=await invoke('POST',{task:'research',question:'What does this say?',evidence:[{id:'D1.C1',title:'Doc',text:'Evidence text'}]});
assert.equal(post.status,503);
assert.match(post.payload.error,/not configured/i);
const bad=await invoke('POST',{task:'research',question:''});
assert.equal(bad.status,503); // provider guard happens before validation in local-only mode
if(original) process.env.OPENAI_API_KEY=original;

const wrapper=await readFile(new URL('./app.js',import.meta.url),'utf8');
assert.match(wrapper,/legacy-app\.js/);
assert.match(wrapper,/v03\.js/);
assert.match(wrapper,/v03-contract\.js/);

const legacy=await readFile(new URL('./legacy-app.js',import.meta.url),'utf8');
assert.match(legacy,/indexedDB\.open\('research-ledger',2\)/);
assert.match(legacy,/research-ledger:last-brief/);
assert.match(legacy,/agent-work-os-research-handoff/);
assert.match(legacy,/function retrieve\(/);
assert.match(legacy,/function renderBrief\(/);

const history=await readFile(new URL('./v03.js',import.meta.url),'utf8');
assert.match(history,/research-ledger-history/);
assert.match(history,/Version graph/);
assert.match(history,/Branch from this/);
assert.match(history,/snapshotSha256/);
assert.match(history,/evidenceSetSha256/);

const canonical=await readFile(new URL('./v03-contract.js',import.meta.url),'utf8');
assert.match(canonical,/research-version-graph\/v1/);
assert.match(canonical,/agent-work-os\/research-handoff\/v1/);
assert.match(canonical,/production_deploy/);
assert.match(canonical,/irreversibleActionsRequireApproval:\s*true/);

for(const path of ['../../contracts/research-version-graph-v1.schema.json','../../contracts/research-handoff-v1.schema.json']){
  const schema=JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
}

console.log('research-ledger API + v0.3 browser contract smoke tests passed');
