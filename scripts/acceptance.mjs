import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-acceptance-'));
const port = 18787 + Math.floor(Math.random()*500);
const env = { ...process.env, AGENT_WORK_OS_HOST:'127.0.0.1', AGENT_WORK_OS_PORT:String(port), AGENT_WORK_OS_TOKEN:'acceptance-token', AGENT_WORK_OS_STATE_PATH:path.join(temp,'state.json'), AGENT_WORK_OS_SERVER_URL:`ws://127.0.0.1:${port}/ws`, AGENT_WORK_OS_HOME:path.join(temp,'daemon-home'), AGENT_WORK_OS_MACHINE_NAME:'acceptance-machine', AGENT_WORK_OS_ENABLE_ECHO:'true' };
const children = [];
function start(args){const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));return child;}
start(['services/control-api/src/index.js']);
await waitFor(async()=> (await fetch(`http://127.0.0.1:${port}/health`)).ok, 8000, 'api health');
start(['runtime/daemon/src/index.js']);
const machine = await waitFor(async()=>{const s=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();return s.machines.find(m=>m.name==='acceptance-machine'&&m.status==='online');},8000,'daemon registration');
const create = await fetch(`http://127.0.0.1:${port}/api/sessions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({machineId:machine.id,cwd:root,agent:'echo',prompt:'acceptance'})});
assert.equal(create.status,201);const session=await create.json();
let completed = await waitFor(async()=>{const s=await (await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}`)).json();return s.status==='completed'?s:null;},8000,'first echo turn');
assert.ok(completed.messages.some(m=>m.text==='Echo: acceptance'));
const follow = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/messages`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'second'})}); assert.equal(follow.status,202);
completed = await waitFor(async()=>{const s=await (await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}`)).json();return s.messages.some(m=>m.text==='Echo: second')?s:null;},8000,'follow-up echo turn');
assert.equal(completed.nativeSessionId,`echo-${session.id}`);
console.log('[acceptance] PASS: API -> daemon -> adapter -> persisted session -> follow-up');
for(const child of children.reverse()) child.kill('SIGTERM');
await new Promise(r=>setTimeout(r,120));

async function waitFor(fn, timeout, label){const start=Date.now();let last;while(Date.now()-start<timeout){try{last=await fn();if(last)return last;}catch(e){last=e;}await new Promise(r=>setTimeout(r,80));}throw new Error(`Timed out waiting for ${label}: ${last?.message||last||''}`)}
