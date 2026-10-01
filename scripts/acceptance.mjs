import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-acceptance-'));
const port = 18787 + Math.floor(Math.random()*500);
const env = { ...process.env, AGENT_WORK_OS_HOST:'127.0.0.1', AGENT_WORK_OS_PORT:String(port), AGENT_WORK_OS_TOKEN:'acceptance-token', AGENT_WORK_OS_STATE_PATH:path.join(temp,'state.json'), AGENT_WORK_OS_SERVER_URL:`ws://127.0.0.1:${port}/ws`, AGENT_WORK_OS_HOME:path.join(temp,'daemon-home'), AGENT_WORK_OS_MACHINE_NAME:'acceptance-machine', AGENT_WORK_OS_ENABLE_ECHO:'true' };
const repo = path.join(temp, 'repo');
await mkdir(path.join(repo, 'src'), { recursive: true });
await writeFile(path.join(repo, 'src', 'a.js'), 'first\nneedle alpha\nthird\n');
await writeFile(path.join(repo, '.env'), 'SECRET=needle\n');
const children = [];
function start(args){const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));return child;}
start(['services/control-api/src/index.js']);
await waitFor(async()=> (await fetch(`http://127.0.0.1:${port}/health`)).ok, 8000, 'api health');
start(['runtime/daemon/src/index.js']);
const machine = await waitFor(async()=>{const s=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();return s.machines.find(m=>m.name==='acceptance-machine'&&m.status==='online');},8000,'daemon registration');

const unauthorizedHarness = await fetch(`http://127.0.0.1:${port}/api/machines/${encodeURIComponent(machine.id)}/harness/status`, {
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({cwd:repo})
});
assert.equal(unauthorizedHarness.status,401);

const harnessHeaders = {'content-type':'application/json','authorization':'Bearer acceptance-token'};
const harnessStatusResponse = await fetch(`http://127.0.0.1:${port}/api/machines/${encodeURIComponent(machine.id)}/harness/status`, {
  method:'POST',
  headers:harnessHeaders,
  body:JSON.stringify({cwd:repo})
});
assert.equal(harnessStatusResponse.status,200);
const harnessStatus = await harnessStatusResponse.json();
assert.equal(harnessStatus.result.boundaries.repositoryAccess,'read-only');
assert.equal(harnessStatus.result.boundaries.mutationEndpoints,false);
assert.equal(harnessStatus.result.boundaries.strongSandbox,false);
assert.equal(harnessStatus.result.versions.repositoryIntelligence,'repository-intelligence/v1');

const searchResponse = await fetch(`http://127.0.0.1:${port}/api/machines/${encodeURIComponent(machine.id)}/harness/repo/search`, {
  method:'POST',
  headers:harnessHeaders,
  body:JSON.stringify({cwd:repo,query:'needle'})
});
assert.equal(searchResponse.status,200);
const searchResult = await searchResponse.json();
assert.deepEqual(searchResult.result.matches.map(m=>m.sourceAnchor),['src/a.js:2']);

const readResponse = await fetch(`http://127.0.0.1:${port}/api/machines/${encodeURIComponent(machine.id)}/harness/repo/read`, {
  method:'POST',
  headers:harnessHeaders,
  body:JSON.stringify({cwd:repo,path:'src/a.js',startLine:1,lineCount:2})
});
assert.equal(readResponse.status,200);
const readResult = await readResponse.json();
assert.equal(readResult.result.text,'first\nneedle alpha');
assert.equal(readResult.result.sourceAnchor,'src/a.js:1-2');

const secretReadResponse = await fetch(`http://127.0.0.1:${port}/api/machines/${encodeURIComponent(machine.id)}/harness/repo/read`, {
  method:'POST',
  headers:harnessHeaders,
  body:JSON.stringify({cwd:repo,path:'.env',startLine:1,lineCount:2})
});
assert.equal(secretReadResponse.status,400);
const secretReadResult = await secretReadResponse.json();
assert.equal(secretReadResult.error,'harness_command_failed');
assert.match(secretReadResult.message,/secret-like/);

const create = await fetch(`http://127.0.0.1:${port}/api/sessions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({machineId:machine.id,cwd:root,agent:'echo',prompt:'acceptance'})});
assert.equal(create.status,201);const session=await create.json();
let completed = await waitFor(async()=>{const s=await (await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}`)).json();return s.status==='completed'?s:null;},8000,'first echo turn');
assert.ok(completed.messages.some(m=>m.text==='Echo: acceptance'));
const follow = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/messages`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'second'})}); assert.equal(follow.status,202);
completed = await waitFor(async()=>{const s=await (await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}`)).json();return s.messages.some(m=>m.text==='Echo: second')?s:null;},8000,'follow-up echo turn');
assert.equal(completed.nativeSessionId,`echo-${session.id}`);
console.log('[acceptance] PASS: authenticated API -> daemon -> bounded repo read/search + adapter -> persisted session -> follow-up');
for(const child of children.reverse()) child.kill('SIGTERM');
await new Promise(r=>setTimeout(r,120));

async function waitFor(fn, timeout, label){const start=Date.now();let last;while(Date.now()-start<timeout){try{last=await fn();if(last)return last;}catch(e){last=e;}await new Promise(r=>setTimeout(r,80));}throw new Error(`Timed out waiting for ${label}: ${last?.message||last||''}`)}
