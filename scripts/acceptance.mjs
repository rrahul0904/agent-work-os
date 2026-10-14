import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-acceptance-'));
const claudeProjects = path.join(temp, 'claude-projects');
const claudeProject = '-tmp-agent-work-os-acceptance';
const claudeSessionId = 'claude-acceptance-session';
const claudeProjectDir = path.join(claudeProjects, claudeProject);
const claudeSubagents = path.join(claudeProjectDir, claudeSessionId, 'subagents');
await mkdir(claudeSubagents, { recursive:true });
const now = new Date().toISOString();
const jsonl = value => `${JSON.stringify(value)}\n`;
await writeFile(path.join(claudeProjectDir, `${claudeSessionId}.jsonl`), [
  jsonl({ type:'user', timestamp:now, cwd:root, message:{ content:[{ type:'text', text:'Observe this external Claude session' }] } }),
  jsonl({ type:'assistant', timestamp:now, message:{ id:'main-answer', model:'claude-sonnet', content:[{ type:'text', text:'Main Claude session is visible.' }] } })
].join(''));
await writeFile(path.join(claudeSubagents, 'agent-reviewer.jsonl'), jsonl({ type:'assistant', timestamp:now, message:{ id:'sub-answer', model:'claude-sonnet', content:[{ type:'text', text:'Sub-agent review complete.' }] } }));
await writeFile(path.join(claudeSubagents, 'agent-reviewer.meta.json'), JSON.stringify({ description:'Acceptance reviewer', agentType:'reviewer' }));

const port = 18787 + Math.floor(Math.random()*500);
const token = 'acceptance-token';
const headers = { authorization: `Bearer ${token}` };
const env = {
  ...process.env,
  AGENT_WORK_OS_HOST:'127.0.0.1',
  AGENT_WORK_OS_PORT:String(port),
  AGENT_WORK_OS_TOKEN:token,
  AGENT_WORK_OS_STATE_PATH:path.join(temp,'state.json'),
  AGENT_WORK_OS_SERVER_URL:`ws://127.0.0.1:${port}/ws`,
  AGENT_WORK_OS_HOME:path.join(temp,'daemon-home'),
  AGENT_WORK_OS_MACHINE_NAME:'acceptance-machine',
  AGENT_WORK_OS_ENABLE_ECHO:'true',
  AGENT_WORK_OS_SHIPPING_STATE:path.join(temp,'shipping-state'),
  AGENT_WORK_OS_CLAUDE_PROJECTS:claudeProjects,
  AGENT_WORK_OS_CLAUDE_POLL_MS:'1000'
};
const children = [];
function start(args){const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));return child;}

try {
  start(['scripts/product.mjs']);
  await waitFor(async()=> (await fetch(`http://127.0.0.1:${port}/health`)).ok, 8000, 'product health');
  const denied = await fetch(`http://127.0.0.1:${port}/api/state`);
  assert.equal(denied.status, 401, 'product API must reject missing token');

  const roomResponse = await fetch(`http://127.0.0.1:${port}/agent-room.html`);
  assert.equal(roomResponse.status, 200, 'Agent Room HTML should be served by the product');
  assert.match(await roomResponse.text(), /Agent Room — Agent Work OS/);
  const modelResponse = await fetch(`http://127.0.0.1:${port}/agent-room-model.js`);
  assert.equal(modelResponse.status, 200, 'Agent Room state model should be served by the product');

  const machine = await waitFor(async()=>{
    const r=await fetch(`http://127.0.0.1:${port}/api/state`,{headers});
    const s=await r.json();
    return s.machines.find(m=>m.name==='acceptance-machine'&&m.status==='online'&&m.shipping?.enabled);
  },8000,'one-command product executor registration');

  const observed = await waitFor(async()=>{
    const r=await fetch(`http://127.0.0.1:${port}/api/state`,{headers});
    const s=await r.json();
    const main=s.sessions.find(item=>item.source?.kind==='claude-jsonl'&&item.source?.agentId==='main');
    const child=s.sessions.find(item=>item.source?.kind==='claude-jsonl'&&item.source?.agentId==='reviewer');
    return main&&child?{main,child}:null;
  },8000,'Claude transcript observer propagation');
  assert.equal(observed.main.machineId,machine.id);
  assert.equal(observed.main.agent,'claude');
  assert.equal(observed.child.agent,'claude-subagent');
  assert.equal(observed.child.observedParentSessionId,observed.main.id);
  assert.ok(observed.main.messages.some(message=>message.text==='Main Claude session is visible.'));
  assert.ok(observed.child.messages.some(message=>message.text==='Sub-agent review complete.'));

  const productResponse = await fetch(`http://127.0.0.1:${port}/api/product`,{headers});
  assert.equal(productResponse.status,200);
  const product = await productResponse.json();
  assert.ok(product.counts.projects >= 1, 'product portfolio should be populated');

  const create = await fetch(`http://127.0.0.1:${port}/api/sessions`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({machineId:machine.id,cwd:root,agent:'echo',prompt:'acceptance'})});
  assert.equal(create.status,201);const session=await create.json();
  let completed = await waitFor(async()=>{const s=await (await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}`,{headers})).json();return s.status==='completed'?s:null;},8000,'first echo turn');
  assert.ok(completed.messages.some(m=>m.text==='Echo: acceptance'));
  const follow = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/messages`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({text:'second'})}); assert.equal(follow.status,202);
  completed = await waitFor(async()=>{const s=await (await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}`,{headers})).json();return s.messages.some(m=>m.text==='Echo: second')?s:null;},8000,'follow-up echo turn');
  assert.equal(completed.nativeSessionId,`echo-${session.id}`);

  const contract = {
    version:'shipping-contract/v1',
    project:{id:'acceptance-product',repoPath:root},
    release:{version:'acceptance'},
    worktree:{baseRef:'HEAD',root:path.join(temp,'worktrees'),cleanupOnSuccess:true},
    builder:{command:{name:'build',command:'true'},repairCommand:{name:'repair',command:'true'},maxRepairAttempts:0},
    verification:[{name:'verification',command:'true'}],
    preview:{required:false},
    production:{required:false},
    exactSha:{required:false,testedShaCommand:{name:'tested-sha',command:'git rev-parse HEAD'}},
    goldenPath:[{id:'ACCEPT-1',description:'one-command product launches local receipt-gated shipping run'}]
  };
  const shipResponse = await fetch(`http://127.0.0.1:${port}/api/shipping/runs`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({machineId:machine.id,contract})});
  const shipBody = await shipResponse.json();
  assert.equal(shipResponse.status,202,JSON.stringify(shipBody));
  const queued = shipBody;
  const shipped = await waitFor(async()=>{
    const r=await fetch(`http://127.0.0.1:${port}/api/shipping/runs/${queued.runId}`,{headers});
    if(!r.ok)return null;
    const run=await r.json();
    return run.state==='SHIPPED'?run:null;
  },12000,'receipt-gated shipping run');
  assert.ok(shipped.testedSha);
  assert.equal(shipped.testedSha,shipped.deployedSha);
  assert.equal(shipped.releaseReceipt.goldenPath[0].status,'PASS');
  console.log('[acceptance] PASS: one-command product -> Agent Room assets + Claude JSONL observer -> authenticated console API -> local agent + Shipping Supervisor -> exact-SHA SHIPPED receipt');
} finally {
  for(const child of children.reverse()) child.kill('SIGTERM');
  await new Promise(r=>setTimeout(r,220));
}

async function waitFor(fn, timeout, label){const start=Date.now();let last;while(Date.now()-start<timeout){try{last=await fn();if(last)return last;}catch(e){last=e;}await new Promise(r=>setTimeout(r,80));}throw new Error(`Timed out waiting for ${label}: ${last?.message||last||''}`)}
