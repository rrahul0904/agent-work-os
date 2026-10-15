import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePromptSpec, renderPrompt } from './prompt-core.mjs';
import { createRunPlan } from './orchestrator.mjs';
import { compileDiagramSpec } from './diagram-spec.mjs';
import { layoutDiagram, renderDiagramSvg } from './diagram-renderer.mjs';
import { critiqueDiagram } from './diagram-critic.mjs';
import { toDrawioXml, toMermaid, toPlantUml } from './diagram-adapters.mjs';
import { compileDeckPlan } from './deck-plan.mjs';
import { generateNativePptx, nativePptxReceipt } from './pptx-native.mjs';
import { compileCreativeSpec } from './creative-spec.mjs';
import { renderCreativeSvg, creativeReceipt } from './creative-renderer.mjs';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const types = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.css':'text/css; charset=utf-8'};

function sendJson(response,status,body){response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(JSON.stringify(body));}
async function bodyJson(request){const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>1024*1024)throw new Error('request-too-large');chunks.push(chunk)}if(!chunks.length)return{};return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
async function serveStatic(pathname,response){const requested=pathname==='/'?'/index.html':pathname;const safe=normalize(requested).replace(/^(\.\.(\/|\\|$))+/,'');const target=join(root,safe);if(!target.startsWith(root))return false;try{const meta=await stat(target);if(!meta.isFile())return false;const data=await readFile(target);response.writeHead(200,{'content-type':types[extname(target)]||'application/octet-stream','cache-control':extname(target)==='.html'?'no-store':'public, max-age=300','x-content-type-options':'nosniff'});response.end(data);return true}catch{return false}}

const server=http.createServer(async(request,response)=>{try{const url=new URL(request.url||'/',`http://${request.headers.host||'localhost'}`);
if(request.method==='GET'&&url.pathname==='/api/health')return sendJson(response,200,{ok:true,service:'visual-intelligence-platform',contractVersion:'visual-intelligence-platform/v1alpha1',releaseState:'BUILDING',capabilities:['prompt-studio','agent-run-plan','diagram-spec','diagram-svg','mermaid','plantuml','drawio','deck-plan','native-pptx','creative-spec','creative-svg','visualbench']});
if(url.pathname==='/api/prompt'){if(request.method!=='POST'){response.setHeader('allow','POST');return sendJson(response,405,{error:'method-not-allowed'})}try{const input=await bodyJson(request);const promptSpec=compilePromptSpec(input);return sendJson(response,200,{promptSpec,prompt:renderPrompt(promptSpec),runPlan:createRunPlan(input)})}catch(error){const code=error?.message||'prompt-compilation-failed';return sendJson(response,code==='plan-capability-denied'?403:400,{error:code})}}
if(url.pathname==='/api/diagram'){if(request.method!=='POST'){response.setHeader('allow','POST');return sendJson(response,405,{error:'method-not-allowed'})}try{const input=await bodyJson(request);const diagramSpec=compileDiagramSpec(input);const layout=layoutDiagram(diagramSpec);return sendJson(response,200,{diagramSpec,critique:critiqueDiagram(diagramSpec),svg:renderDiagramSvg(diagramSpec),exports:{mermaid:toMermaid(diagramSpec),plantuml:toPlantUml(diagramSpec),drawio:toDrawioXml(diagramSpec,layout)}})}catch(error){return sendJson(response,400,{error:error?.message||'diagram-generation-failed'})}}
if(url.pathname==='/api/presentation'){if(request.method!=='POST'){response.setHeader('allow','POST');return sendJson(response,405,{error:'method-not-allowed'})}try{const input=await bodyJson(request);const plan=compileDeckPlan(input);if(url.searchParams.get('mode')==='receipt')return sendJson(response,200,{deckPlan:plan,receipt:nativePptxReceipt(plan)});const pptx=generateNativePptx(plan);response.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.presentationml.presentation','content-disposition':'attachment; filename="visual-intelligence.pptx"','content-length':String(pptx.length),'x-visual-intelligence-editable':'true','cache-control':'no-store'});return response.end(pptx)}catch(error){return sendJson(response,400,{error:error?.message||'presentation-generation-failed'})}}
if(url.pathname==='/api/creative'){if(request.method!=='POST'){response.setHeader('allow','POST');return sendJson(response,405,{error:'method-not-allowed'})}try{const input=await bodyJson(request);const creativeSpec=compileCreativeSpec(input);const svg=renderCreativeSvg(creativeSpec);return sendJson(response,200,{creativeSpec,svg,receipt:creativeReceipt(creativeSpec,svg)})}catch(error){return sendJson(response,400,{error:error?.message||'creative-generation-failed'})}}
if(request.method==='GET'&&await serveStatic(url.pathname,response))return;return sendJson(response,404,{error:'not-found'})}catch{return sendJson(response,500,{error:'internal-error'})}});
server.listen(port,host,()=>console.log(`Visual Intelligence Platform listening on http://${host}:${port}`));
