import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createCanonicalId } from '../packages/domain/src/index.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-acceptance-'));
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
  AGENT_WORK_OS_SHIPPING_STATE:path.join(temp,'shipping-state')
};
const children = [];
function start(args){const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));return child;}

try {
  start(['scripts/product.mjs']);
  await waitFor(async()=> (await fetch(`http://127.0.0.1:${port}/health`)).ok, 8000, 'product health');
  const denied = await fetch(`http://127.0.0.1:${port}/api/state`);
  assert.equal(denied.status, 401, 'product API must reject missing token');

  const machine = await waitFor(async()=>{
    const r=await fetch(`http://127.0.0.1:${port}/api/state`,{headers});
    const s=await r.json();
    return s.machines.find(m=>m.name==='acceptance-machine'&&m.status==='online'&&m.shipping?.enabled);
  },8000,'one-command product executor registration');

  const productResponse = await fetch(`http://127.0.0.1:${port}/api/product`,{headers});
  assert.equal(productResponse.status,200);
  const product = await productResponse.json();
  assert.ok(product.counts.projects >= 1, 'product portfolio should be populated');

  const organizationId = createCanonicalId('org');
  const workItem = {
    id: createCanonicalId('work'),
    commandId: createCanonicalId('command'),
    organizationId,
    title: 'Canonical work item acceptance'
  };
  const workItemResponse = await fetch(`http://127.0.0.1:${port}/api/work-items`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(workItem)
  });
  assert.equal(workItemResponse.status, 201);
  assert.equal((await workItemResponse.json()).workItem.status, 'backlog');
  const workItemReplay = await fetch(`http://127.0.0.1:${port}/api/work-items`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(workItem)
  });
  assert.equal(workItemReplay.status, 200);
  assert.equal((await workItemReplay.json()).replayed, true);
  const workItemList = await fetch(`http://127.0.0.1:${port}/api/work-items?organizationId=${encodeURIComponent(organizationId)}`, { headers });
  assert.equal((await workItemList.json()).workItems.length, 1);
  const foreignOrgRead = await fetch(`http://127.0.0.1:${port}/api/work-items/${workItem.id}?organizationId=${encodeURIComponent(createCanonicalId('org'))}`, { headers });
  assert.equal(foreignOrgRead.status, 404);
  const ready = await fetch(`http://127.0.0.1:${port}/api/work-items/${workItem.id}/transitions`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId, commandId: createCanonicalId('command'), expectedVersion: 1, to: 'ready' })
  });
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).workItem.version, 2);
  const stale = await fetch(`http://127.0.0.1:${port}/api/work-items/${workItem.id}/transitions`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId, commandId: createCanonicalId('command'), expectedVersion: 1, to: 'blocked' })
  });
  assert.equal(stale.status, 409);

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
  console.log('[acceptance] PASS: canonical WorkItem API + one-command product -> local agent + Shipping Supervisor -> exact-SHA SHIPPED receipt');
} finally {
  for(const child of children.reverse()) child.kill('SIGTERM');
  await new Promise(r=>setTimeout(r,220));
}

async function waitFor(fn, timeout, label){const start=Date.now();let last;while(Date.now()-start<timeout){try{last=await fn();if(last)return last;}catch(e){last=e;}await new Promise(r=>setTimeout(r,80));}throw new Error(`Timed out waiting for ${label}: ${last?.message||last||''}`)}
