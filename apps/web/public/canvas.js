const state={machines:[],rooms:[],sessions:[],canvases:[],selectedCanvas:null,selectedNode:null,connected:false,mode:'canvas',notice:'',error:'',panX:80,panY:90,zoom:.82,driverToken:null,driverLeaseId:null};
const app=document.querySelector('#app');
const connection=document.querySelector('#connection');
const canvasMode=document.querySelector('#canvasMode');
const listMode=document.querySelector('#listMode');
const token=new URLSearchParams(location.search).get('token')||localStorage.getItem('agentWorkOsToken')||'dev-token';
localStorage.setItem('agentWorkOsToken',token);
const actorId=localStorage.getItem('agentWorkOsActorId')||crypto.randomUUID();
localStorage.setItem('agentWorkOsActorId',actorId);
const actorName=localStorage.getItem('agentWorkOsActorName')||'Local operator';
localStorage.setItem('agentWorkOsActorName',actorName);

function esc(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function arr(value){return Array.isArray(value)?value:[]}
function upsert(items,item,front=false){const rest=arr(items).filter(x=>x.id!==item.id);return front?[item,...rest]:[...rest,item]}
function api(path,options={}){return fetch(path,{...options,headers:{'content-type':'application/json','authorization':`Bearer ${token}`,...(options.headers||{})}}).then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);return body})}
function selectedCanvas(){return state.canvases.find(canvas=>canvas.id===state.selectedCanvas)||state.canvases[0]||null}
function selectedNode(canvas=selectedCanvas()){return canvas?.nodes?.find(node=>node.id===state.selectedNode)||null}
function selectedRoom(canvas=selectedCanvas()){return state.rooms.find(room=>room.id===canvas?.roomId)||null}
function sessionFor(node){return node?.sessionId?state.sessions.find(session=>session.id===node.sessionId):null}
function short(value=''){return String(value).slice(0,8)}
function fmtTime(value){if(!value)return'';try{return new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}catch{return String(value)}}
function latestAssistant(session){return arr(session?.messages).filter(message=>message.role==='assistant').at(-1)?.text||''}

function connect(){
  const url=new URL('/ws',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('role','client');url.searchParams.set('token',token);
  const ws=new WebSocket(url);
  ws.onopen=()=>{state.connected=true;paintConnection()};
  ws.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.type==='state.snapshot'){
      state.machines=arr(message.machines);state.rooms=arr(message.rooms);state.sessions=arr(message.sessions);state.canvases=arr(message.canvases);
    }
    if(message.type==='machine.updated')state.machines=upsert(state.machines,message.machine);
    if(message.type==='room.updated')state.rooms=upsert(state.rooms,message.room,true);
    if(message.type==='session.updated')state.sessions=upsert(state.sessions,message.session,true);
    if(message.type==='canvas.updated'){
      state.canvases=upsert(state.canvases,message.canvas,true);
      if(message.canvas.driverLease?.status!=='active'&&state.driverLeaseId===message.canvas.driverLease?.id){state.driverToken=null;state.driverLeaseId=null}
    }
    normalizeSelection();render();
  };
  ws.onclose=()=>{state.connected=false;paintConnection();setTimeout(connect,1200)};
}
function paintConnection(){connection.textContent=state.connected?'LIVE':'RECONNECTING…';connection.className=`connection ${state.connected?'online':''}`}
function normalizeSelection(){const canvas=selectedCanvas();if(canvas&&!state.selectedCanvas)state.selectedCanvas=canvas.id;if(state.selectedCanvas&&!canvas){state.selectedCanvas=state.canvases[0]?.id||null;state.selectedNode=null}const fresh=selectedCanvas();if(state.selectedNode&&!fresh?.nodes?.some(node=>node.id===state.selectedNode))state.selectedNode=null}

function render(){
  normalizeSelection();
  const canvas=selectedCanvas();
  app.innerHTML=`<div class="shell"><aside class="panel rail">${railHtml(canvas)}</aside><section class="panel workspacePanel">${workspaceHtml(canvas)}</section><aside class="panel inspector ${state.selectedNode?'open':''}">${inspectorHtml(canvas)}</aside></div>`;
  canvasMode.classList.toggle('active',state.mode==='canvas');listMode.classList.toggle('active',state.mode==='list');
  wire(canvas);applyWorldTransform();
}

function railHtml(canvas){
  return `<section class="section"><div class="eyebrow">WORKSPACES</div><div class="canvasList">${state.canvases.map(item=>`<button class="canvasButton ${item.id===canvas?.id?'active':''}" data-canvas="${esc(item.id)}"><strong>${esc(item.name)}</strong><small>${arr(item.nodes).length} nodes · ${arr(item.members).length} people</small></button>`).join('')||'<p class="notice">No multiplayer canvases yet.</p>'}</div></section>
  <section class="section"><h3>New canvas</h3><form id="newCanvas" class="formGrid"><label>Room<select name="roomId" required>${state.rooms.map(room=>`<option value="${esc(room.id)}">${esc(room.name)}</option>`).join('')}</select></label><label>Name<input name="name" maxlength="120" placeholder="Release workspace" required></label><button ${state.rooms.length?'':'disabled'}>Create canvas</button></form><p class="notice">A canvas projects an existing Shared Room. It does not create a second agent runtime.</p></section>${flashHtml()}`;
}

function workspaceHtml(canvas){
  const toolbar=`<div class="toolbar"><div class="toolbarGroup"><button id="centerCanvas" type="button">Center</button><button id="zoomOut" type="button" aria-label="Zoom out">−</button><span class="zoomReadout">${Math.round(state.zoom*100)}%</span><button id="zoomIn" type="button" aria-label="Zoom in">+</button></div><div class="toolbarGroup"><span class="subtle hideMobile">Drag empty space to pan · drag node headers to move</span><button id="openInspector" type="button">Inspector</button></div></div>`;
  if(!canvas)return `${toolbar}<div class="workspaceEmpty"><div><div class="eyebrow">GOVERNED HUMAN + AGENT WORKSPACE</div><h2>Create a canvas from a Shared Room.</h2><p>Agent sessions become spatial nodes only after you bind them. Running state is accepted only from positive provider health evidence.</p></div></div>`;
  if(state.mode==='list')return `${toolbar}${listWorkspaceHtml(canvas)}`;
  return `${toolbar}<div id="viewport" class="workspaceViewport" aria-label="Spatial agent workspace"><div id="world" class="workspaceWorld">${linksSvg(canvas)}${arr(canvas.nodes).map(nodeHtml).join('')}</div></div>`;
}

function linksSvg(canvas){
  const byId=new Map(arr(canvas.nodes).map(node=>[node.id,node]));
  const lines=arr(canvas.links).map(link=>{const a=byId.get(link.sourceNodeId),b=byId.get(link.targetNodeId);if(!a||!b)return'';const x1=a.x+a.width/2,y1=a.y+a.height/2,x2=b.x+b.width/2,y2=b.y+b.height/2;const dx=Math.max(80,Math.abs(x2-x1)*.45);const d=`M ${x1} ${y1} C ${x1+Math.sign(x2-x1||1)*dx} ${y1}, ${x2-Math.sign(x2-x1||1)*dx} ${y2}, ${x2} ${y2}`;return `<path class="contextLine" d="${d}" marker-end="url(#arrow)"><title>${esc(link.share)} · review ${link.requiresReview?'required':'optional'} · no auto-execution</title></path>`}).join('');
  return `<svg class="linkLayer" aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="contextArrow" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>${lines}</svg>`;
}

function nodeHtml(node){
  const session=sessionFor(node);const latest=latestAssistant(session);const selected=node.id===state.selectedNode;
  return `<article class="node ${selected?'selected':''}" data-node="${esc(node.id)}" tabindex="0" style="left:${Number(node.x)||0}px;top:${Number(node.y)||0}px;width:${Number(node.width)||240}px;height:${Number(node.height)||180}px" aria-label="${esc(node.title)} ${esc(node.status)}"><div class="nodeHeader" data-drag-node="${esc(node.id)}"><span class="statusDot ${esc(node.status)}"></span><strong>${esc(node.title)}</strong><span class="nodeKind">${esc(node.kind)}</span></div><div class="nodeBody"><div class="nodeMeta"><span class="tag">${esc(node.status)}</span>${node.sessionId?`<span class="tag">session ${esc(short(node.sessionId))}</span>`:''}${session?.agent?`<span class="tag">${esc(session.agent)}</span>`:''}</div>${latest?`<pre>${esc(latest.slice(-1200))}</pre>`:`<div class="emptyText">${node.sessionId?'No assistant text captured yet.':'Reference-only node. Bind a session to project runtime truth.'}</div>`}</div></article>`;
}

function listWorkspaceHtml(canvas){
  return `<div class="listWorkspace" role="list">${arr(canvas.nodes).map(node=>{const session=sessionFor(node);return `<button class="listCard ${node.id===state.selectedNode?'selected':''}" data-node="${esc(node.id)}" role="listitem"><span class="statusDot ${esc(node.status)}"></span><span><strong>${esc(node.title)}</strong><small class="subtle">${esc(node.kind)}${session?` · ${esc(session.agent)} · ${esc(short(session.id))}`:''}</small></span><span class="statusPill ${esc(node.status)}">${esc(node.status)}</span></button>`}).join('')||'<p class="notice">No nodes yet. Add an agent, terminal/session reference, or note from the inspector.</p>'}</div>`;
}

function inspectorHtml(canvas){
  if(!canvas)return `<section class="section"><div class="eyebrow">INSPECTOR</div><p class="notice">Choose or create a canvas first.</p></section>`;
  const node=selectedNode(canvas);const room=selectedRoom(canvas);const session=sessionFor(node);
  return `<section class="section"><div class="inspectorTitle"><div><div class="eyebrow">${node?'NODE':'CANVAS'}</div><h2>${esc(node?.title||canvas.name)}</h2></div><button id="closeInspector" class="secondary" type="button">Close</button></div>${node?`<span class="statusPill ${esc(node.status)}">${esc(node.status)}</span><p class="notice">${node.sessionId?`Session ${esc(node.sessionId)}${session?` · ${esc(session.agent)}`:''}`:'No runtime session is bound to this node.'}</p>${node.healthEvidence?`<div class="driverCard active"><strong>Health evidence</strong><code>${esc(node.healthEvidence.source)} · ${esc(node.healthEvidence.observedAt)}</code></div>`:''}`:`<p class="notice">Room: ${esc(room?.name||canvas.roomId)} · ${arr(canvas.nodes).length} nodes</p>`}</section>${driverHtml(canvas)}${addNodeHtml(canvas,room)}${linkHtml(canvas)}${membersHtml(canvas)}${receiptsHtml(canvas)}`;
}

function driverHtml(canvas){
  const lease=canvas.driverLease;const mine=lease?.status==='active'&&lease.actorId===actorId;const locallyHeld=mine&&state.driverToken&&state.driverLeaseId===lease.id;
  return `<section class="section"><h3>Input authority</h3><div class="driverCard ${lease?.status==='active'?'active':''}"><strong>${lease?.status==='active'?`Driver: ${esc(lease.actorId===actorId?actorName:lease.actorId)}`:'No active driver'}</strong><p class="notice">${lease?.status==='active'?`Lease expires ${esc(fmtTime(lease.expiresAt))}.`:'Viewer access never implies input permission.'}</p>${locallyHeld?'<p class="success">This tab holds the one-time driver capability. It is kept in memory only.</p>':''}</div><div class="toolbarGroup" style="margin-top:8px">${lease?.status==='active'&&mine?'<button id="releaseDriver" class="secondary" type="button">Release driver</button>':lease?.status==='active'?'<button class="secondary" type="button" disabled>Driver occupied</button>':'<button id="acquireDriver" class="primary" type="button">Become driver</button>'}</div><p class="notice">Phase B governs authority only. Real PTY keystroke forwarding is intentionally not enabled yet.</p></section>`;
}

function addNodeHtml(canvas,room){
  const roomAgents=arr(room?.agents);const sessions=state.sessions;
  return `<section class="section"><h3>Add node</h3><form id="addNode" class="formGrid"><label>Kind<select name="kind" id="nodeKind"><option value="agent">Agent</option><option value="terminal">Session reference</option><option value="note">Note</option></select></label><label>Title<input name="title" maxlength="160" placeholder="Implementer" required></label><label id="agentField">Room agent<select name="roomAgentId">${roomAgents.map(agent=>`<option value="${esc(agent.id)}">@${esc(agent.handle)} · ${esc(agent.agent)}</option>`).join('')}</select></label><label id="sessionField">Session<select name="sessionId"><option value="">No session yet</option>${sessions.map(session=>`<option value="${esc(session.id)}">${esc(short(session.id))} · ${esc(session.agent)} · ${esc(session.status)}</option>`).join('')}</select></label><button>Add to canvas</button></form></section>`;
}

function linkHtml(canvas){
  const nodes=arr(canvas.nodes);
  return `<section class="section"><h3>Context links</h3><div class="linkList">${arr(canvas.links).map(link=>{const source=nodes.find(n=>n.id===link.sourceNodeId),target=nodes.find(n=>n.id===link.targetNodeId);return `<div class="linkCard"><strong>${esc(source?.title||short(link.sourceNodeId))} → ${esc(target?.title||short(link.targetNodeId))}</strong><small>${esc(link.share)} · gate ${esc(link.gate)} · execution ${esc(link.execution)}</small></div>`}).join('')||'<p class="notice">Links share bounded references only. They never auto-run a downstream agent in this slice.</p>'}</div>${nodes.length>1?`<form id="newLink" class="formGrid" style="margin-top:9px"><label>From<select name="sourceNodeId">${nodes.map(node=>`<option value="${esc(node.id)}">${esc(node.title)}</option>`).join('')}</select></label><label>To<select name="targetNodeId">${nodes.map((node,index)=>`<option value="${esc(node.id)}" ${index===1?'selected':''}>${esc(node.title)}</option>`).join('')}</select></label><label>Share<select name="share"><option value="summary">Summary</option><option value="artifacts">Artifacts</option><option value="transcript">Transcript reference</option></select></label><button>Create review-gated link</button></form>`:''}</section>`;
}

function membersHtml(canvas){return `<section class="section"><h3>People</h3><div class="memberList">${arr(canvas.members).map(member=>`<div class="member"><strong>${esc(member.displayName)}</strong><small>${esc(member.role)} · ${esc(short(member.actorId))}</small></div>`).join('')||'<p class="notice">No human memberships have been recorded yet.</p>'}</div></section>`}
function receiptsHtml(canvas){return `<section class="section"><h3>Evidence receipts</h3><div class="receiptList">${arr(canvas.receipts).slice(-18).reverse().map(receipt=>`<div class="receipt"><b>${esc(receipt.type)}</b> · ${esc(fmtTime(receipt.occurredAt))}<br>${esc(short(receipt.digest))}</div>`).join('')||'<p class="notice">No receipts yet.</p>'}</div></section>`}
function flashHtml(){return `${state.error?`<p class="error">${esc(state.error)}</p>`:''}${state.notice?`<p class="success">${esc(state.notice)}</p>`:''}`}
function flash({notice='',error=''}){state.notice=notice;state.error=error;render()}

function wire(canvas){
  document.querySelectorAll('[data-canvas]').forEach(button=>button.onclick=()=>{state.selectedCanvas=button.dataset.canvas;state.selectedNode=null;state.notice='';state.error='';state.driverToken=null;state.driverLeaseId=null;state.panX=80;state.panY=90;render()});
  document.querySelectorAll('[data-node]').forEach(card=>{card.onclick=()=>{state.selectedNode=card.dataset.node;render()};card.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();state.selectedNode=card.dataset.node;render()}if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){event.preventDefault();selectAdjacentNode(canvas,card.dataset.node,['ArrowRight','ArrowDown'].includes(event.key)?1:-1)}}});
  const newCanvas=document.querySelector('#newCanvas');if(newCanvas)newCanvas.onsubmit=async event=>{event.preventDefault();try{const created=await api('/api/canvases',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(newCanvas)))});state.selectedCanvas=created.id;state.selectedNode=null;flash({notice:'Canvas created from Shared Room.'})}catch(error){flash({error:error.message})}};
  document.querySelector('#centerCanvas')?.addEventListener('click',()=>{state.panX=80;state.panY=90;state.zoom=.82;applyWorldTransform();render()});
  document.querySelector('#zoomIn')?.addEventListener('click',()=>setZoom(state.zoom+.1));
  document.querySelector('#zoomOut')?.addEventListener('click',()=>setZoom(state.zoom-.1));
  document.querySelector('#openInspector')?.addEventListener('click',()=>document.querySelector('.inspector')?.classList.add('open'));
  document.querySelector('#closeInspector')?.addEventListener('click',()=>{state.selectedNode=null;document.querySelector('.inspector')?.classList.remove('open');render()});
  const add=document.querySelector('#addNode');const kind=document.querySelector('#nodeKind');if(kind)kind.onchange=paintNodeFields;if(add)add.onsubmit=async event=>{event.preventDefault();if(!canvas)return;try{const data=Object.fromEntries(new FormData(add));const body={kind:data.kind,title:data.title,x:140+arr(canvas.nodes).length*36,y:130+arr(canvas.nodes).length*28};if(data.kind==='agent'){if(!data.roomAgentId)throw new Error('Add a room agent in Shared Rooms first.');body.roomAgentId=data.roomAgentId;if(data.sessionId)body.sessionId=data.sessionId}else if(data.kind==='terminal'&&data.sessionId)body.sessionId=data.sessionId;const node=await api(`/api/canvases/${encodeURIComponent(canvas.id)}/nodes`,{method:'POST',body:JSON.stringify(body)});state.selectedNode=node.id;flash({notice:'Node added.'})}catch(error){flash({error:error.message})}};
  paintNodeFields();
  const link=document.querySelector('#newLink');if(link)link.onsubmit=async event=>{event.preventDefault();try{const data=Object.fromEntries(new FormData(link));if(data.sourceNodeId===data.targetNodeId)throw new Error('Choose two different nodes.');await api(`/api/canvases/${encodeURIComponent(canvas.id)}/links`,{method:'POST',body:JSON.stringify({...data,requiresReview:true})});flash({notice:'Reference-only context link added.'})}catch(error){flash({error:error.message})}};
  document.querySelector('#acquireDriver')?.addEventListener('click',async()=>{try{await api(`/api/canvases/${encodeURIComponent(canvas.id)}/members`,{method:'POST',body:JSON.stringify({actorId,displayName:actorName,role:'driver'})});const result=await api(`/api/canvases/${encodeURIComponent(canvas.id)}/driver/acquire`,{method:'POST',body:JSON.stringify({actorId,leaseSeconds:120})});state.driverToken=result.token;state.driverLeaseId=result.lease.id;flash({notice:'Driver lease acquired. Capability token is held only in this tab.'})}catch(error){flash({error:error.message})}});
  document.querySelector('#releaseDriver')?.addEventListener('click',async()=>{try{await api(`/api/canvases/${encodeURIComponent(canvas.id)}/driver/revoke`,{method:'POST',body:JSON.stringify({actorId,reason:'operator_released'})});state.driverToken=null;state.driverLeaseId=null;flash({notice:'Driver authority released.'})}catch(error){flash({error:error.message})}});
  if(state.mode==='canvas'&&canvas)wireSpatial(canvas);
}

function paintNodeFields(){const kind=document.querySelector('#nodeKind')?.value;const agentField=document.querySelector('#agentField');const sessionField=document.querySelector('#sessionField');if(agentField)agentField.style.display=kind==='agent'?'grid':'none';if(sessionField)sessionField.style.display=kind==='note'?'none':'grid'}
function selectAdjacentNode(canvas,nodeId,delta){const nodes=arr(canvas?.nodes);const index=nodes.findIndex(node=>node.id===nodeId);if(index<0||!nodes.length)return;const next=nodes[(index+delta+nodes.length)%nodes.length];state.selectedNode=next.id;render();requestAnimationFrame(()=>document.querySelector(`[data-node="${CSS.escape(next.id)}"]`)?.focus())}

function wireSpatial(canvas){
  const viewport=document.querySelector('#viewport');const world=document.querySelector('#world');if(!viewport||!world)return;
  viewport.onwheel=event=>{event.preventDefault();const rect=viewport.getBoundingClientRect();const px=event.clientX-rect.left,py=event.clientY-rect.top;const beforeX=(px-state.panX)/state.zoom,beforeY=(py-state.panY)/state.zoom;const next=Math.max(.35,Math.min(1.55,state.zoom*(event.deltaY>0?.9:1.1)));state.zoom=next;state.panX=px-beforeX*next;state.panY=py-beforeY*next;applyWorldTransform();paintZoomReadout()};
  let pan=null;viewport.onpointerdown=event=>{if(event.target.closest('.node')||event.target.closest('.toolbar'))return;pan={id:event.pointerId,x:event.clientX,y:event.clientY,px:state.panX,py:state.panY};viewport.setPointerCapture(event.pointerId)};viewport.onpointermove=event=>{if(!pan||event.pointerId!==pan.id)return;state.panX=pan.px+(event.clientX-pan.x);state.panY=pan.py+(event.clientY-pan.y);applyWorldTransform()};viewport.onpointerup=event=>{if(pan?.id===event.pointerId)pan=null};
  document.querySelectorAll('[data-drag-node]').forEach(header=>{header.onpointerdown=event=>{event.stopPropagation();const nodeId=header.dataset.dragNode;const node=canvas.nodes.find(item=>item.id===nodeId);const card=header.closest('.node');if(!node||!card)return;const drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:node.x,y:node.y,nodeId,card};header.setPointerCapture(event.pointerId);header.onpointermove=move=>{if(move.pointerId!==drag.id)return;const x=drag.x+(move.clientX-drag.startX)/state.zoom,y=drag.y+(move.clientY-drag.startY)/state.zoom;drag.card.style.left=`${Math.max(0,x)}px`;drag.card.style.top=`${Math.max(0,y)}px`};header.onpointerup=async up=>{if(up.pointerId!==drag.id)return;header.onpointermove=null;header.onpointerup=null;const x=Math.max(0,drag.x+(up.clientX-drag.startX)/state.zoom),y=Math.max(0,drag.y+(up.clientY-drag.startY)/state.zoom);try{await api(`/api/canvases/${encodeURIComponent(canvas.id)}/nodes/${encodeURIComponent(nodeId)}/layout`,{method:'POST',body:JSON.stringify({x,y,width:node.width,height:node.height})});state.selectedNode=nodeId}catch(error){state.error=error.message;render()}}}});
}
function applyWorldTransform(){const world=document.querySelector('#world');if(world)world.style.transform=`translate(${state.panX}px,${state.panY}px) scale(${state.zoom})`}
function setZoom(value){state.zoom=Math.max(.35,Math.min(1.55,value));applyWorldTransform();paintZoomReadout()}
function paintZoomReadout(){const readout=document.querySelector('.zoomReadout');if(readout)readout.textContent=`${Math.round(state.zoom*100)}%`}

canvasMode.onclick=()=>{state.mode='canvas';render()};
listMode.onclick=()=>{state.mode='list';render()};
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.selectedNode){state.selectedNode=null;render()}});
paintConnection();render();connect();
