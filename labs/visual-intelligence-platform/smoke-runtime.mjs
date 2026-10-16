import { once } from 'node:events';
import { createVisualIntelligenceServer } from './http-app.mjs';
import { MCP_PROTOCOL_VERSION } from './mcp-core.mjs';

const server = createVisualIntelligenceServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const ensure = (condition, message) => { if (!condition) throw new Error(`smoke-failed:${message}`); };
async function post(path, body) { return fetch(`${base}${path}`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) }); }
async function mcp(method, params, name) {
  return fetch(`${base}/mcp`, {
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json, text/event-stream','MCP-Protocol-Version':MCP_PROTOCOL_VERSION,'Mcp-Method':method,...(name?{'Mcp-Name':name}:{})},
    body:JSON.stringify({jsonrpc:'2.0',id:`${method}-smoke`,method,params:{...(params||{}),_meta:{'io.modelcontextprotocol/protocolVersion':MCP_PROTOCOL_VERSION,'io.modelcontextprotocol/clientInfo':{name:'visual-intelligence-smoke',version:'1.0.0'},'io.modelcontextprotocol/clientCapabilities':{}}}})
  });
}

try {
  const healthResponse = await fetch(`${base}/api/health`);
  ensure(healthResponse.ok, 'health-status');
  const health = await healthResponse.json();
  ensure(health.ok === true, 'health-body');
  ensure(health.capabilities.includes('diagram-spec'), 'diagram-capability');
  ensure(health.capabilities.includes('native-pptx'), 'pptx-capability');
  ensure(health.capabilities.includes('creative-spec'), 'creative-capability');
  ensure(health.capabilities.includes('mcp-tools'), 'mcp-capability');

  const homeResponse = await fetch(`${base}/`);
  ensure(homeResponse.ok, 'home-status');
  const home = await homeResponse.text();
  ensure(home.includes('Visual Intelligence'), 'home-brand');
  ensure(home.includes('Diagram Studio'), 'diagram-studio-ui');
  ensure(home.includes('studio-upgrade.mjs'), 'studio-upgrade-ui');

  const promptResponse = await post('/api/prompt', {artifactType:'architecture-diagram',objective:'Show a secure multi-region RAG platform',plan:'community'});
  ensure(promptResponse.ok, 'prompt-status');
  const prompt = await promptResponse.json();
  ensure(prompt.promptSpec?.artifactType === 'architecture-diagram', 'prompt-spec');
  ensure(prompt.runPlan?.providerPolicy?.selection === 'provider-neutral', 'run-plan');

  const diagramResponse = await post('/api/diagram', {
    kind:'rag',title:'Secure RAG',
    nodes:[
      {id:'user',type:'actor',label:'User',evidence:'requirements'},
      {id:'idp',type:'identity',label:'IdP',evidence:'security'},
      {id:'svc',type:'service',label:'RAG Service',evidence:'repo'},
      {id:'kb',type:'dataset',label:'Knowledge',boundary:'data',evidence:'model'},
      {id:'llm',type:'model',label:'LLM',evidence:'provider'}
    ],
    edges:[
      {from:'user',to:'idp',label:'auth',protocol:'OIDC',evidence:'security'},
      {from:'idp',to:'svc',label:'token',protocol:'HTTPS',evidence:'security'},
      {from:'svc',to:'kb',label:'retrieve',evidence:'model'},
      {from:'svc',to:'llm',label:'generate',evidence:'provider'}
    ]
  });
  ensure(diagramResponse.ok, 'diagram-status');
  const diagram = await diagramResponse.json();
  ensure(diagram.svg?.includes('<svg'), 'diagram-svg');
  ensure(diagram.exports?.mermaid?.includes('flowchart LR'), 'mermaid-export');
  ensure(diagram.exports?.plantuml?.includes('@startuml'), 'plantuml-export');
  ensure(diagram.exports?.drawio?.includes('<mxfile'), 'drawio-export');

  const communityDeck = await post('/api/presentation?mode=receipt', {plan:'community',title:'Community Deck',slides:[{title:'Community Deck',layout:'title'}]});
  ensure(communityDeck.status === 403, 'community-pptx-denied');

  const deck = {
    plan:'pro',title:'Enterprise AI Platform',
    slides:[
      {title:'Enterprise AI Platform',subtitle:'Governed visual intelligence',layout:'title'},
      {title:'Why now',bullets:['Editable artifacts','Governed agents','Evidence-backed review']}
    ]
  };
  const receiptResponse = await post('/api/presentation?mode=receipt', deck);
  ensure(receiptResponse.ok, 'pptx-receipt-status');
  const receipt = await receiptResponse.json();
  ensure(receipt.plan === 'pro', 'pptx-plan');
  ensure(receipt.receipt?.editable === true, 'pptx-editable-receipt');
  const pptxResponse = await post('/api/presentation', deck);
  ensure(pptxResponse.ok, 'pptx-status');
  ensure(pptxResponse.headers.get('x-visual-intelligence-editable') === 'true', 'pptx-header');
  ensure(pptxResponse.headers.get('x-visual-intelligence-plan') === 'pro', 'pptx-plan-header');
  const pptx = new Uint8Array(await pptxResponse.arrayBuffer());
  ensure(String.fromCharCode(pptx[0], pptx[1]) === 'PK', 'pptx-zip-magic');

  const creativeResponse = await post('/api/creative', {format:'landscape',headline:'Architecture that stays editable',body:'Semantic artifacts with governed agents',cta:'Build now'});
  ensure(creativeResponse.ok, 'creative-status');
  const creative = await creativeResponse.json();
  ensure(creative.receipt?.editable === true, 'creative-editable');
  ensure(creative.svg?.includes('id="headline"'), 'creative-layer');

  const discoverResponse = await mcp('server/discover');
  ensure(discoverResponse.ok, 'mcp-discover-status');
  const discover = await discoverResponse.json();
  ensure(discover.result?.supportedVersions?.includes(MCP_PROTOCOL_VERSION), 'mcp-discover-version');
  const listResponse = await mcp('tools/list');
  ensure(listResponse.ok, 'mcp-tools-list-status');
  const toolList = await listResponse.json();
  ensure(toolList.result?.tools?.length >= 5, 'mcp-tools-list');
  const toolName = 'visual_prompt_compile';
  const callResponse = await mcp('tools/call', {name:toolName,arguments:{artifactType:'technical-diagram',objective:'Explain the event-driven data flow',plan:'community'}}, toolName);
  ensure(callResponse.ok, 'mcp-tool-call-status');
  const call = await callResponse.json();
  ensure(call.result?.structuredContent?.promptSpec?.artifactType === 'technical-diagram', 'mcp-tool-call-result');

  console.log(JSON.stringify({ok:true,service:'visual-intelligence-platform',routes:['/','/api/health','/api/prompt','/api/diagram','/api/presentation','/api/creative','/mcp'],artifactFamilies:5,mcpProtocolVersion:MCP_PROTOCOL_VERSION}));
} finally {
  server.close();
  await once(server, 'close');
}
