import { applyAutoLayout, applyCommand, createDocument, documentReceipt, exportDocument, importDocument, makeNode, mergeRemoteOperation, redo, undo } from "./core.js";

const KEY = "agent-work-os:collab-design:v1";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let doc = load();
let tool = "select";
let drag = null;
let remoteSeq = 0;

const ui = {
  world: $("#world"), stage: $("#canvas-viewport"), svg: $("#connector-layer"), layers: $("#layers"),
  inspector: $("#inspector"), empty: $("#inspector-empty"), name: $("#document-name"), digest: $("#receipt-digest"),
  ops: $("#op-count"), zoom: $("#zoom-label"), layout: $("#layout-section"), text: $("#text-field"),
  status: $("#status-text"), dot: $("#status-dot")
};

if (!doc.nodes.length) seed();
render();

function seed() {
  const frame = makeNode("frame", { id:"frame-home", name:"Product idea", x:330, y:220, width:660, height:410, fill:"#f8fafc" });
  doc = applyCommand(doc, { type:"node.add", node:frame });
  doc = applyCommand(doc, { type:"node.add", node:makeNode("text", { id:"headline", parentId:frame.id, x:380, y:285, width:460, height:58, text:"Design and brainstorm in one place", color:"#111827", fontSize:30 }) });
  doc = applyCommand(doc, { type:"node.add", node:makeNode("sticky", { id:"sticky-a", parentId:frame.id, x:380, y:380, text:"Design mode\nframes · layout · tokens", fill:"#ddd6fe" }) });
  doc = applyCommand(doc, { type:"node.add", node:makeNode("sticky", { id:"sticky-b", parentId:frame.id, x:625, y:380, text:"Whiteboard mode\nideas · flows · collaboration", fill:"#bae6fd" }) });
  doc = applyCommand(doc, { type:"node.add", node:makeNode("connector", { id:"seed-link", from:"sticky-a", to:"sticky-b", fill:"#7c3aed" }) });
  doc = applyCommand(doc, { type:"selection.set", ids:[] }, { recordHistory:false });
  save();
}

function render() {
  ui.name.value = doc.name;
  ui.world.style.transform = `translate(${doc.viewport.x}px,${doc.viewport.y}px) scale(${doc.viewport.zoom})`;
  renderNodes(); renderLinks(); renderLayers(); renderInspector();
  const receipt = documentReceipt(doc);
  ui.digest.textContent = receipt.documentDigest; ui.ops.textContent = receipt.operationCount; ui.zoom.textContent = `${Math.round(doc.viewport.zoom * 100)}%`;
}

function renderNodes() {
  ui.world.replaceChildren();
  for (const node of doc.nodes.filter((n) => n.type !== "connector" && !n.hidden)) {
    const el = document.createElement("div");
    el.className = `node ${node.type}${doc.selection.includes(node.id) ? " selected" : ""}`;
    el.dataset.id = node.id; el.dataset.name = node.name;
    Object.assign(el.style, { left:`${node.x}px`, top:`${node.y}px`, width:`${node.width}px`, height:`${node.height}px`, background:node.fill, borderRadius:`${node.radius ?? 0}px`, color:node.color ?? "#111827", fontSize:`${node.fontSize ?? 16}px` });
    if ("text" in node) { const t = document.createElement("div"); t.className = "text-content"; t.textContent = node.text; el.append(t); }
    const h = document.createElement("div"); h.className = "resize"; h.dataset.resize = "1"; el.append(h);
    el.addEventListener("pointerdown", startNodeDrag); el.addEventListener("dblclick", () => editText(node.id)); ui.world.append(el);
  }
  const cursor = document.createElement("div"); cursor.className = "remote-cursor"; cursor.textContent = "Bob"; cursor.style.left = "900px"; cursor.style.top = "180px"; ui.world.append(cursor);
}

function renderLinks() {
  ui.svg.replaceChildren(); ui.svg.setAttribute("viewBox", `0 0 ${ui.stage.clientWidth || 1000} ${ui.stage.clientHeight || 700}`);
  for (const link of doc.nodes.filter((n) => n.type === "connector")) {
    const a = doc.nodes.find((n) => n.id === link.from), b = doc.nodes.find((n) => n.id === link.to); if (!a || !b) continue;
    const p1 = toView(a.x + a.width / 2, a.y + a.height / 2), p2 = toView(b.x + b.width / 2, b.y + b.height / 2), bend = Math.max(40, Math.abs(p2.x - p1.x) * .45);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${p1.x} ${p1.y} C ${p1.x + bend} ${p1.y},${p2.x - bend} ${p2.y},${p2.x} ${p2.y}`); path.setAttribute("fill", "none"); path.setAttribute("stroke", link.fill || "#64748b"); path.setAttribute("stroke-width", "2"); ui.svg.append(path);
  }
}

function renderLayers() {
  ui.layers.replaceChildren();
  for (const node of [...doc.nodes].filter((n) => n.type !== "connector").reverse()) {
    const row = document.createElement("button"); row.className = `layer-row${doc.selection.includes(node.id) ? " selected" : ""}`;
    row.innerHTML = `<span class="layer-icon">${icon(node.type)}</span><span>${safe(node.name)}</span><small>${node.type}</small>`;
    row.onclick = () => command({ type:"selection.set", ids:[node.id] }, true); ui.layers.append(row);
  }
}

function renderInspector() {
  const node = selected()[0]; ui.empty.classList.toggle("hidden", !!node); ui.inspector.classList.toggle("hidden", !node); if (!node) return;
  $$('[data-prop]', ui.inspector).forEach((input) => { const p = input.dataset.prop; if (p in node) input.value = input.type === "color" ? asColor(node[p]) : node[p] ?? ""; });
  ui.text.classList.toggle("hidden", !("text" in node)); ui.layout.classList.toggle("hidden", node.type !== "frame");
  $$('[data-layout]', ui.layout).forEach((b) => b.classList.toggle("active", node.layout === b.dataset.layout));
}

function command(cmd, transient = false) {
  try { doc = applyCommand(doc, cmd, { actorId:"alice", recordHistory:!transient }); save(); render(); status("Saved locally", true); }
  catch (error) { status(error.message, false); }
}

function startNodeDrag(e) {
  if (tool === "hand") return; e.stopPropagation(); const node = doc.nodes.find((n) => n.id === e.currentTarget.dataset.id); if (!node) return;
  if (!doc.selection.includes(node.id)) command({ type:"selection.set", ids:e.shiftKey ? [...doc.selection,node.id] : [node.id] }, true);
  drag = { kind:e.target.dataset.resize ? "resize" : "move", id:node.id, start:toWorld(e), initial:{ x:node.x, y:node.y, width:node.width, height:node.height } };
  e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.addEventListener("pointermove", moveNode); e.currentTarget.addEventListener("pointerup", endNodeDrag, { once:true });
}
function moveNode(e) {
  if (!drag) return; const p = toWorld(e), dx = p.x - drag.start.x, dy = p.y - drag.start.y, copy = structuredClone(doc), node = copy.nodes.find((n) => n.id === drag.id);
  Object.assign(node, drag.kind === "resize" ? { width:Math.max(24, drag.initial.width + dx), height:Math.max(24, drag.initial.height + dy) } : { x:drag.initial.x + dx, y:drag.initial.y + dy }); doc = copy; render();
}
function endNodeDrag(e) {
  const now = doc.nodes.find((n) => n.id === drag?.id), d = drag; drag = null; e.currentTarget.removeEventListener("pointermove", moveNode); if (!now || !d) return;
  const patch = d.kind === "resize" ? { width:now.width, height:now.height } : { x:now.x, y:now.y }; const copy = structuredClone(doc); Object.assign(copy.nodes.find((n) => n.id === d.id), d.initial); doc = copy; command({ type:"node.update", id:d.id, patch });
}

ui.stage.addEventListener("pointerdown", (e) => { if (e.target.closest(".node,.toolbar,.zoom-controls")) return; if (tool === "hand" || e.button === 1) { drag = { kind:"pan", start:{x:e.clientX,y:e.clientY}, initial:{...doc.viewport} }; return; } command({ type:"selection.set", ids:[] }, true); });
ui.stage.addEventListener("pointermove", (e) => { if (drag?.kind !== "pan") return; doc = { ...doc, viewport:{ ...doc.viewport, x:drag.initial.x + e.clientX - drag.start.x, y:drag.initial.y + e.clientY - drag.start.y } }; render(); });
ui.stage.addEventListener("pointerup", () => { if (drag?.kind !== "pan") return; const patch = { x:doc.viewport.x, y:doc.viewport.y }, initial = drag.initial; drag = null; doc = { ...doc, viewport:initial }; command({ type:"viewport.set", patch }); });
ui.stage.addEventListener("wheel", (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) setZoom(doc.viewport.zoom * (e.deltaY > 0 ? .9 : 1.1)); else { doc = { ...doc, viewport:{ ...doc.viewport, x:doc.viewport.x-e.deltaX, y:doc.viewport.y-e.deltaY } }; save(); render(); } }, { passive:false });

$$('[data-insert]').forEach((b) => b.onclick = () => insert(b.dataset.insert)); $$('[data-tool]').forEach((b) => b.onclick = () => setTool(b.dataset.tool));
$$('[data-prop]', ui.inspector).forEach((input) => input.onchange = () => { const n=selected()[0]; if(n) command({type:"node.update",id:n.id,patch:{[input.dataset.prop]:input.type==="number"?Number(input.value):input.value}}); });
$$('[data-layout]').forEach((b) => b.onclick = () => { const n=selected()[0]; if(n?.type==="frame") command({type:"node.update",id:n.id,patch:{layout:b.dataset.layout}}); });
$("#apply-layout").onclick = () => { const n=selected()[0]; if(n?.type==="frame"){doc=applyAutoLayout(doc,n.id);save();render();} };
$("#delete").onclick = () => { if(doc.selection.length) command({type:"node.delete",ids:[...doc.selection]}); }; $("#duplicate").onclick = duplicate; $("#collapse-all").onclick = () => command({type:"selection.set",ids:[]},true);
$("#undo").onclick = () => {doc=undo(doc,"alice");save();render();}; $("#redo").onclick = () => {doc=redo(doc,"alice");save();render();}; $("#connect").onclick = connect; $("#simulate-remote").onclick = simulateRemote;
$("#zoom-in").onclick=()=>setZoom(doc.viewport.zoom*1.15); $("#zoom-out").onclick=()=>setZoom(doc.viewport.zoom*.87); $("#zoom-label").onclick=()=>setZoom(1); $("#fit").onclick=fit;
ui.name.onchange=()=>command({type:"document.rename",name:ui.name.value}); $("#export").onclick=exportFile; $("#import-file").onchange=importFile; window.addEventListener("resize",renderLinks); window.addEventListener("keydown",keys);

function insert(type){const p=center(),parent=selected()[0]?.type==="frame"?selected()[0].id:null;command({type:"node.add",node:makeNode(type,{x:p.x-(type==="frame"?260:90),y:p.y-(type==="frame"?170:60),parentId:parent})});}
function duplicate(){const n=selected()[0];if(!n)return;const copy={...structuredClone(n),x:n.x+30,y:n.y+30,name:`${n.name} copy`};delete copy.id;command({type:"node.add",node:makeNode(n.type,copy)});}
function connect(){const n=selected();if(n.length!==2)return status("Select exactly two objects",false);command({type:"node.add",node:makeNode("connector",{from:n[0].id,to:n[1].id})});}
function simulateRemote(){remoteSeq+=1;const op={operationId:`bob:${remoteSeq}`,actorId:"bob",command:{type:"node.add",node:makeNode("sticky",{id:`bob-note-${remoteSeq}`,x:850+remoteSeq*18,y:330+remoteSeq*18,text:`Bob idea ${remoteSeq}`,fill:"#a5f3fc"})}};doc=mergeRemoteOperation(doc,op);doc.collaboration.operations.at(-1).operationId=op.operationId;save();render();status("Bob edit merged",true);}
function editText(id){const n=doc.nodes.find((x)=>x.id===id);if(!n||!("text" in n))return;const next=window.prompt("Edit text",n.text);if(next!==null)command({type:"node.update",id,patch:{text:next}});}
function selected(){return doc.selection.map((id)=>doc.nodes.find((n)=>n.id===id)).filter(Boolean);} function setTool(v){tool=v;$$('[data-tool]').forEach((b)=>b.classList.toggle("active",b.dataset.tool===v));}
function setZoom(z){doc={...doc,viewport:{...doc.viewport,zoom:Math.min(2.5,Math.max(.2,z))}};save();render();} function center(){return{x:(ui.stage.clientWidth/2-doc.viewport.x)/doc.viewport.zoom,y:(ui.stage.clientHeight/2-doc.viewport.y)/doc.viewport.zoom};}
function fit(){const n=doc.nodes.filter((x)=>x.type!=="connector");if(!n.length)return;const x1=Math.min(...n.map(x=>x.x)),y1=Math.min(...n.map(x=>x.y)),x2=Math.max(...n.map(x=>x.x+x.width)),y2=Math.max(...n.map(x=>x.y+x.height)),w=x2-x1,h=y2-y1,z=Math.min(1.3,(ui.stage.clientWidth-100)/w,(ui.stage.clientHeight-100)/h);doc={...doc,viewport:{x:(ui.stage.clientWidth-w*z)/2-x1*z,y:(ui.stage.clientHeight-h*z)/2-y1*z,zoom:z}};save();render();}
function toWorld(e){const r=ui.stage.getBoundingClientRect();return{x:(e.clientX-r.left-doc.viewport.x)/doc.viewport.zoom,y:(e.clientY-r.top-doc.viewport.y)/doc.viewport.zoom};} function toView(x,y){return{x:x*doc.viewport.zoom+doc.viewport.x,y:y*doc.viewport.zoom+doc.viewport.y};}
function save(){localStorage.setItem(KEY,exportDocument(doc));} function load(){try{const raw=localStorage.getItem(KEY);return raw?importDocument(raw):createDocument({id:"agent-canvas",name:"Agent Canvas",actorId:"alice"});}catch{return createDocument({id:"agent-canvas",name:"Agent Canvas",actorId:"alice"});}}
function exportFile(){const a=document.createElement("a"),blob=new Blob([exportDocument(doc)],{type:"application/json"});a.href=URL.createObjectURL(blob);a.download="design-os.design.json";a.click();URL.revokeObjectURL(a.href);} async function importFile(e){const f=e.target.files?.[0];if(!f)return;try{doc=importDocument(await f.text());doc.collaboration.actorId="alice";save();render();status("Imported",true);}catch(error){status(error.message,false);}e.target.value="";}
function keys(e){if(["INPUT","TEXTAREA"].includes(document.activeElement?.tagName))return;const mod=e.metaKey||e.ctrlKey;if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();doc=e.shiftKey?redo(doc,"alice"):undo(doc,"alice");save();render();return;}if(["Delete","Backspace"].includes(e.key)&&doc.selection.length)command({type:"node.delete",ids:[...doc.selection]});const tools={v:"select",h:"hand"},items={f:"frame",r:"rect",t:"text",n:"sticky"},k=e.key.toLowerCase();if(tools[k])setTool(tools[k]);if(items[k])insert(items[k]);}
function status(message,ok){ui.status.textContent=message;ui.dot.style.background=ok?"#22c55e":"#ef4444";} function asColor(v){return /^#[0-9a-f]{6}$/i.test(v||"")?v:"#7c3aed";} function icon(t){return({frame:"▣",rect:"□",text:"T",sticky:"▰"}[t]||"◇");} function safe(v){return String(v).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
