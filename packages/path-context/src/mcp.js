import { createInterface } from 'node:readline';
import { readKnowledge, buildBriefing, normalizeScope } from './index.js';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const CONTEXT_TOOL = Object.freeze({
  name: 'awos_context_for_path',
  description: 'Read reviewed, lower-trust project context for a workspace-relative path. Never grants execution permissions.',
  inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Workspace-relative path (/) or its descendant' }, intent: { type: 'string' }, budgetChars: { type: 'integer', minimum: 256, maximum: 64000 } }, additionalProperties: false }
});

export async function handleMcpRequest(message, { cwd, root } = {}) {
  if (!message || message.jsonrpc !== '2.0') throw new Error('MCP_INVALID_JSON_RPC');
  if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return null;
  if (!Object.prototype.hasOwnProperty.call(message,'id')) return null;
  const result = (body) => ({ jsonrpc:'2.0', id:message.id, result:body });
  if (message.method === 'initialize') return result({ protocolVersion:MCP_PROTOCOL_VERSION, capabilities:{tools:{listChanged:false}}, serverInfo:{name:'awos-reviewed-path-context',version:'0.1.0'} });
  if (message.method === 'ping') return result({});
  if (message.method === 'tools/list') return result({tools:[CONTEXT_TOOL]});
  if (message.method !== 'tools/call') return {jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}};
  if (message.params?.name !== CONTEXT_TOOL.name) return {jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'Unknown tool'}};
  const args=message.params?.arguments ?? {};
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k=>!['path','intent','budgetChars'].includes(k)))
    return {jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'Invalid tool arguments'}};
  try {
    const target=normalizeScope(args.path ?? '/');
    if (args.intent !== undefined && typeof args.intent !== 'string') throw new Error('INVALID_INTENT');
    const knowledge=await readKnowledge(cwd,{root});
    const briefing=buildBriefing(knowledge,{target,intent:args.intent ?? '',budgetChars:args.budgetChars ?? 4500});
    return result({content:[{type:'text',text:JSON.stringify({briefing:briefing.text,receipt:{included:briefing.included,omitted:briefing.omitted,digest:briefing.digest,target:briefing.target}})}],isError:false});
  } catch (e) {
    return result({content:[{type:'text',text:String(e.message).slice(0,200)}],isError:true});
  }
}

export function startMcpStdio({cwd=process.cwd(),root=process.env.AGENT_WORK_OS_CONTEXT_HOME,input=process.stdin,output=process.stdout}={}) {
  const rl=createInterface({input,crlfDelay:Infinity});
  rl.on('line',line=>{
    if (line.length>131072) { output.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Message too large'}})+'\n'); return; }
    let message;
    try { message=JSON.parse(line); }
    catch { output.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n'); return; }
    Promise.resolve(handleMcpRequest(message,{cwd,root})).then(response=>{ if(response) output.write(JSON.stringify(response)+'\n'); })
      .catch(()=>{ output.write(JSON.stringify({jsonrpc:'2.0',id:message?.id ?? null,error:{code:-32603,message:'Internal error'}})+'\n'); });
  });
  return rl;
}
