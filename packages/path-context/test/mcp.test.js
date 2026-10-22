import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {appendKnowledge} from '../src/index.js';
import {handleMcpRequest,startMcpStdio} from '../src/mcp.js';
const row=(id,scope)=>({id,kind:'rule',scope,body:'Follow validated run receipts',source:'local:test',approved:true,reviewedBy:'reviewer'});
const msg=(id,method,params)=>({jsonrpc:'2.0',id,method,params});
test('MCP handshake, read-only tool and scoped retrieval', async()=>{
  const tmp=await mkdtemp(path.join(os.tmpdir(),'awos-mcp-'));
  try {
    const cwd=path.join(tmp,'repo');await mkdir(cwd);const root=path.join(tmp,'store');
    await appendKnowledge(cwd,row('rootrule','/'),{root});
    await appendKnowledge(cwd,row('apirule','/apps/api'),{root});
    await appendKnowledge(cwd,row('webrule','/apps/web'),{root});
    const ready=await handleMcpRequest(msg(1,'initialize',{}),{cwd,root});
    assert.equal(ready.result.serverInfo.name,'awos-reviewed-path-context');
    const listing=await handleMcpRequest(msg(2,'tools/list'),{cwd,root});
    assert.deepEqual(listing.result.tools.map(x=>x.name),['awos_context_for_path']);
    const call=await handleMcpRequest(msg(3,'tools/call',{name:'awos_context_for_path',arguments:{path:'/apps/api',intent:'receipt'}}),{cwd,root});
    const payload=JSON.parse(call.result.content[0].text);
    assert.deepEqual(payload.receipt.included,['apirule','rootrule']);
    assert.doesNotMatch(payload.briefing,/webrule/);
    const unsafe=await handleMcpRequest(msg(4,'tools/call',{name:'awos_context_for_path',arguments:{path:'/../../secrets'}}),{cwd,root});
    assert.equal(unsafe.result.isError,true);
    assert.equal((await handleMcpRequest(msg(5,'tools/call',{name:'unknown',arguments:{}}),{cwd,root})).error.code,-32602);
  } finally {await rm(tmp,{recursive:true,force:true});}
});
test('stdio JSON-RPC parses multiple lines without network or write tools',async()=>{
  const input=new PassThrough(),output=new PassThrough();let result='';output.on('data',v=>result+=v.toString());
  const rl=startMcpStdio({cwd:process.cwd(),input,output});
  input.write(JSON.stringify(msg(1,'tools/list'))+'\n');
  input.write('not-json\n');
  await new Promise(resolve=>setTimeout(resolve,20));
  rl.close();input.end();
  const lines=result.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length,2);
  assert.equal(lines.find(x=>x.id===1).result.tools.length,1);
  assert.equal(lines.find(x=>x.error?.code===-32700).error.code,-32700);
});
