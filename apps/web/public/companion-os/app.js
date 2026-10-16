const KEY = 'companion-os-state-v1';
const defaultState = { memories: [], tasks: [], inbox: [], approvals: [], chat: [], runtime: {} };
let state = load();
let currentView = 'today';

const $ = (id) => document.getElementById(id);
const esc = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowIso = () => new Date().toISOString();
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;

function load(){
  try { return { ...defaultState, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return structuredClone(defaultState); }
}
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); renderAll(); }
function words(text){ return String(text).toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []; }
function tagsFor(text){
  const stop = new Set(['this','that','with','from','have','will','your','about','into','what','when','where','were','been','need','task','remember','save','find','review']);
  const counts = new Map();
  for(const w of words(text)){ if(!stop.has(w)) counts.set(w,(counts.get(w)||0)+1); }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([w])=>w);
}
function isUrl(text){ try { const u=new URL(text.trim()); return ['http:','https:'].includes(u.protocol); } catch { return false; } }
function linkFrom(text){ return String(text).match(/https?:\/\/[^\s]+/i)?.[0] || null; }
function fmt(date){ if(!date) return 'No due date'; const d=new Date(date); return Number.isNaN(d.getTime()) ? date : d.toLocaleString(); }
function relative(date){ if(!date) return ''; const delta=new Date(date)-new Date(); const h=Math.round(delta/3600000); if(Math.abs(h)<24) return h>=0?`in ${h}h`:`${Math.abs(h)}h ago`; const days=Math.round(h/24); return days>=0?`in ${days}d`:`${Math.abs(days)}d ago`; }

function routeCapture(raw, source='capture'){
  const text = raw.trim(); if(!text) return { type:'noop' };
  const lower = text.toLowerCase();
  if(/^(send|book|order|buy|purchase|call|publish|delete)\b/.test(lower)) return createApproval(text);
  if(/^(task|todo)\b/.test(lower)) return createTask(text.replace(/^(task|todo)\s*:?\s*/i,''));
  if(/^remind me\b/.test(lower)) return createTask(text.replace(/^remind me(?: to)?\s*/i,''), guessDue(text));
  if(/^find\b/.test(lower)) return { type:'search', query:text.replace(/^find\s*/i,'') };
  if(/^(remember|note)\b/.test(lower)) return createMemory(text.replace(/^(remember|note)\s*:?\s*/i,''), source);
  if(/^save\b/.test(lower) || linkFrom(text)) return createMemory(text.replace(/^save\s*:?\s*/i,''), source);
  state.inbox.unshift({ id:id('inbox'), text, source, createdAt:nowIso() });
  save();
  return { type:'inbox', text };
}
function createMemory(text, source='manual'){
  const url = linkFrom(text);
  const clean = url && text.trim()===url ? url : text;
  const memory = { id:id('mem'), text:clean, url, source, tags:tagsFor(clean), createdAt:nowIso(), updatedAt:nowIso() };
  state.memories.unshift(memory); save(); return { type:'memory', memory };
}
function createTask(title, dueAt=null, priority='medium'){
  if(!title.trim()) return { type:'noop' };
  const task = { id:id('task'), title:title.trim(), dueAt:dueAt||null, priority, done:false, createdAt:nowIso(), updatedAt:nowIso() };
  state.tasks.unshift(task); save(); return { type:'task', task };
}
function createApproval(instruction){
  const approval={ id:id('approval'), instruction, status:'pending', createdAt:nowIso(), decidedAt:null };
  state.approvals.unshift(approval); save(); return { type:'approval', approval };
}
function guessDue(text){
  const d=new Date(); const lower=text.toLowerCase();
  if(lower.includes('tomorrow')) { d.setDate(d.getDate()+1); d.setHours(9,0,0,0); return d.toISOString(); }
  if(lower.includes('tonight')) { d.setHours(19,0,0,0); return d.toISOString(); }
  if(lower.includes('next week')) { d.setDate(d.getDate()+7); d.setHours(9,0,0,0); return d.toISOString(); }
  return null;
}
function searchMemories(query){
  const q=words(query); if(!q.length) return state.memories;
  return state.memories.map(m=>{
    const hay=`${m.text} ${m.url||''} ${(m.tags||[]).join(' ')}`.toLowerCase();
    const score=q.reduce((s,w)=>s+(hay.includes(w)?1:0),0);
    return {m,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.m);
}

function renderAll(){
  $('todayCount').textContent = state.tasks.filter(t=>!t.done).length;
  $('inboxCount').textContent = state.inbox.length;
  $('memoryCount').textContent = state.memories.length;
  $('taskCount').textContent = state.tasks.filter(t=>!t.done).length;
  $('approvalCount').textContent = state.approvals.filter(a=>a.status==='pending').length;
  $('openTasksMetric').textContent = state.tasks.filter(t=>!t.done).length;
  $('savedMetric').textContent = state.memories.length;
  $('pendingMetric').textContent = state.approvals.filter(a=>a.status==='pending').length;
  renderFocus(); renderInbox(); renderMemories($('memorySearch')?.value || ''); renderTasks(); renderApprovals(); renderChat(); renderRuntime();
}
function renderFocus(){
  const items=[...state.tasks.filter(t=>!t.done).sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999')).slice(0,4),...state.approvals.filter(a=>a.status==='pending').slice(0,2)];
  $('focusList').innerHTML = items.length ? items.map(x => x.instruction ? approvalHtml(x,true) : taskHtml(x,true)).join('') : '<div class="empty">Nothing urgent. Capture a task, save a thought, or ask Companion a question.</div>';
}
function renderInbox(){
  $('inboxList').innerHTML = state.inbox.length ? state.inbox.map(item=>`<article class="item"><div class="item-main"><div class="item-title">${esc(item.text)}</div><div class="item-meta">Captured ${fmt(item.createdAt)} · ${esc(item.source)}</div></div><div class="item-actions"><button class="mini" data-action="inbox-memory" data-id="${item.id}">Save to memory</button><button class="mini" data-action="inbox-task" data-id="${item.id}">Make task</button><button class="mini danger" data-action="inbox-delete" data-id="${item.id}">Dismiss</button></div></article>`).join('') : '<div class="empty">Inbox zero. Unclassified captures will wait here.</div>';
}
function renderMemories(query=''){
  const list=searchMemories(query);
  $('memoryList').innerHTML = list.length ? list.map(m=>`<article class="card"><div class="card-kicker">${m.url?'Link':'Memory'}</div><h3>${m.url?`<a href="${esc(m.url)}" target="_blank" rel="noreferrer">${esc(titleFor(m))}</a>`:esc(titleFor(m))}</h3><p class="muted">${esc(m.text)}</p><div class="tags">${(m.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="item-meta">${fmt(m.createdAt)} · ${esc(m.source)}</div><div class="item-actions" style="margin-top:12px"><button class="mini" data-action="memory-task" data-id="${m.id}">Turn into task</button><button class="mini danger" data-action="memory-delete" data-id="${m.id}">Delete</button></div></article>`).join('') : '<div class="empty">No matching memory.</div>';
}
function titleFor(m){ const noUrl=m.text.replace(m.url||'','').trim(); return (noUrl || m.url || 'Saved item').slice(0,70); }
function renderTasks(){
  const list=[...state.tasks].sort((a,b)=>Number(a.done)-Number(b.done) || (a.dueAt||'9999').localeCompare(b.dueAt||'9999'));
  $('taskList').innerHTML = list.length ? list.map(t=>taskHtml(t,false)).join('') : '<div class="empty">No tasks yet.</div>';
}
function taskHtml(t,compact){ return `<article class="item ${t.done?'done':''}"><div class="item-main"><div class="item-title">${esc(t.title)}</div><div class="item-meta">${esc(t.priority)} priority · ${fmt(t.dueAt)} ${t.dueAt?`· ${relative(t.dueAt)}`:''}</div></div><div class="item-actions"><button class="mini ${t.done?'':'approve'}" data-action="task-toggle" data-id="${t.id}">${t.done?'Reopen':'Done'}</button>${compact?'':`<button class="mini danger" data-action="task-delete" data-id="${t.id}">Delete</button>`}</div></article>`; }
function renderApprovals(){
  $('approvalList').innerHTML = state.approvals.length ? state.approvals.map(a=>approvalHtml(a,false)).join('') : '<div class="empty">No approval-gated actions.</div>';
}
function approvalHtml(a){ return `<article class="item"><div class="item-main"><div class="item-title">${esc(a.instruction)}</div><div class="item-meta">${esc(a.status)} · requested ${fmt(a.createdAt)}${a.decidedAt?` · decided ${fmt(a.decidedAt)}`:''}</div></div><div class="item-actions">${a.status==='pending'?`<button class="mini approve" data-action="approval-approve" data-id="${a.id}">Approve simulation</button><button class="mini danger" data-action="approval-deny" data-id="${a.id}">Deny</button>`:''}</div></article>`; }
function renderChat(){
  const log = state.chat.length ? state.chat : [{role:'assistant',text:'I can capture memories, create tasks, search what you saved, and gate consequential actions. Try “remember…”, “task…”, “find…”, or connect an Agent Work OS runtime for open-ended work.'}];
  $('chatLog').innerHTML = log.map(m=>`<div class="bubble ${esc(m.role)}">${esc(m.text)}</div>`).join('');
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
}
function renderRuntime(){
  const r=state.runtime||{}; $('runtimeStatus').textContent = r.url&&r.machineId ? `Runtime: ${r.agent||'agent'}` : 'Local mode';
  $('runtimeUrl').value=r.url||''; $('runtimeToken').value=r.token||''; $('runtimeMachine').value=r.machineId||''; $('runtimeAgent').value=r.agent||'echo'; $('runtimeCwd').value=r.cwd||'';
}

function showView(name){ currentView=name; document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(v=>v.classList.remove('active')); $(`${name}View`).classList.add('active'); document.querySelector(`[data-view="${name}"]`)?.classList.add('active'); $('viewTitle').textContent={today:'Today',inbox:'Inbox',memory:'Memory',tasks:'Tasks',approvals:'Approvals',settings:'Runtime'}[name]||name; }
function pushChat(role,text){ state.chat.push({id:id('msg'),role,text,createdAt:nowIso()}); if(state.chat.length>100) state.chat=state.chat.slice(-100); save(); }

async function handleAssistant(text){
  pushChat('user',text);
  const routed=routeCapture(text,'chat');
  if(routed.type==='memory') return pushChat('assistant',`Saved to memory with tags: ${routed.memory.tags.join(', ') || 'none'}.`);
  if(routed.type==='task') return pushChat('assistant',`Task created: ${routed.task.title}${routed.task.dueAt?` (${fmt(routed.task.dueAt)})`:''}.`);
  if(routed.type==='approval') return pushChat('system',`That action is approval-gated. I created a pending approval instead of executing it: “${routed.approval.instruction}”.`);
  if(routed.type==='search') { const found=searchMemories(routed.query).slice(0,6); return pushChat('assistant',found.length?`I found ${found.length} relevant item${found.length===1?'':'s'}:\n${found.map((m,i)=>`${i+1}. ${m.text}`).join('\n')}`:'I could not find a matching saved item.'); }
  if(routed.type==='inbox' && state.runtime?.url && state.runtime?.machineId && state.runtime?.cwd) {
    try { const answer=await askRuntime(text); return pushChat('assistant',answer); } catch(err){ return pushChat('system',`Connected runtime failed: ${err.message}. I kept your message in Inbox so nothing is lost.`); }
  }
  return pushChat('assistant','Captured in Inbox. Prefix with “remember”, “task”, or “find” for deterministic routing, or connect the Agent Work OS runtime for open-ended work.');
}
async function askRuntime(prompt){
  const r=state.runtime; const headers={'content-type':'application/json',authorization:`Bearer ${r.token||''}`};
  const create=await fetch(`${r.url.replace(/\/$/,'')}/api/sessions`,{method:'POST',headers,body:JSON.stringify({machineId:r.machineId,cwd:r.cwd,agent:r.agent||'echo',prompt})});
  const body=await create.json(); if(!create.ok) throw new Error(body.error||`HTTP ${create.status}`);
  const sessionId=body.id; const initialCount=body.messages?.length||1; const deadline=Date.now()+30000;
  while(Date.now()<deadline){ await new Promise(res=>setTimeout(res,500)); const resp=await fetch(`${r.url.replace(/\/$/,'')}/api/sessions/${encodeURIComponent(sessionId)}`,{headers:{authorization:`Bearer ${r.token||''}`}}); const session=await resp.json(); const assistant=session.messages?.slice(initialCount).filter(m=>m.role==='assistant').at(-1); if(assistant?.text) return assistant.text; if(session.status==='failed') throw new Error('agent session failed'); }
  throw new Error('agent response timed out');
}

function exportMarkdown(){
  const lines=['# Companion OS Export','',`Exported: ${new Date().toLocaleString()}`,'','## Memory',''];
  for(const m of state.memories){ lines.push(`### ${titleFor(m)}`,`- Created: ${m.createdAt}`,`- Source: ${m.source}`,`- Tags: ${(m.tags||[]).join(', ')||'none'}`,m.url?`- URL: ${m.url}`:'', '',m.text,''); }
  lines.push('## Tasks',''); for(const t of state.tasks){ lines.push(`- [${t.done?'x':' '}] ${t.title}${t.dueAt?` — due ${t.dueAt}`:''} (${t.priority})`); }
  lines.push('','## Approvals',''); for(const a of state.approvals){ lines.push(`- **${a.status}** — ${a.instruction}`); }
  const blob=new Blob([lines.filter(Boolean).join('\n')],{type:'text/markdown'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`companion-os-${new Date().toISOString().slice(0,10)}.md`; a.click(); URL.revokeObjectURL(a.href);
}

$('nav').addEventListener('click',e=>{ const b=e.target.closest('[data-view]'); if(b) showView(b.dataset.view); });
$('captureForm').addEventListener('submit',e=>{e.preventDefault(); const text=$('captureInput').value.trim(); if(!text)return; const result=routeCapture(text,'quick-capture'); $('captureInput').value=''; if(result.type==='search'){ $('memorySearch').value=result.query; showView('memory'); renderMemories(result.query); }});
document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{$('captureInput').value=b.dataset.example;$('captureInput').focus();}));
$('chatForm').addEventListener('submit',async e=>{e.preventDefault(); const text=$('chatInput').value.trim(); if(!text)return; $('chatInput').value=''; await handleAssistant(text);});
$('memorySearch').addEventListener('input',e=>renderMemories(e.target.value));
$('addTaskBtn').addEventListener('click',()=>$('taskDialog').showModal());
$('taskDialogForm').addEventListener('submit',e=>{ if(e.submitter?.value==='cancel') return; e.preventDefault(); const due=$('taskDueInput').value?new Date($('taskDueInput').value).toISOString():null; createTask($('taskTitleInput').value,due,$('taskPriorityInput').value); $('taskTitleInput').value=''; $('taskDueInput').value=''; $('taskDialog').close(); });
$('exportBtn').addEventListener('click',exportMarkdown);
$('seedDemoBtn').addEventListener('click',()=>{ if(state.memories.length||state.tasks.length) return; createMemory('https://example.com/retrieval-quality Notes on hybrid retrieval and user-correctable metadata','demo'); createMemory('Design one assistant surface; keep specialized capabilities behind the router','demo'); createTask('Review Companion OS clean-room dossier',guessDue('tomorrow'),'high'); createTask('Test mobile capture flow',null,'medium'); createApproval('publish weekly project update'); });
$('settingsForm').addEventListener('submit',e=>{e.preventDefault(); state.runtime={url:$('runtimeUrl').value.trim(),token:$('runtimeToken').value,machineId:$('runtimeMachine').value.trim(),agent:$('runtimeAgent').value.trim()||'echo',cwd:$('runtimeCwd').value.trim()}; save(); });
$('clearRuntimeBtn').addEventListener('click',()=>{state.runtime={};save();});
document.body.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]'); if(!b)return; const action=b.dataset.action, itemId=b.dataset.id;
  if(action==='task-toggle'){const t=state.tasks.find(x=>x.id===itemId); if(t){t.done=!t.done;t.updatedAt=nowIso();}}
  if(action==='task-delete') state.tasks=state.tasks.filter(x=>x.id!==itemId);
  if(action==='memory-delete') state.memories=state.memories.filter(x=>x.id!==itemId);
  if(action==='memory-task'){const m=state.memories.find(x=>x.id===itemId);if(m)createTask(`Review: ${titleFor(m)}`);return;}
  if(action==='inbox-delete') state.inbox=state.inbox.filter(x=>x.id!==itemId);
  if(action==='inbox-memory'){const x=state.inbox.find(x=>x.id===itemId);if(x){createMemory(x.text,x.source);state.inbox=state.inbox.filter(y=>y.id!==itemId);save();}return;}
  if(action==='inbox-task'){const x=state.inbox.find(x=>x.id===itemId);if(x){createTask(x.text);state.inbox=state.inbox.filter(y=>y.id!==itemId);save();}return;}
  if(action==='approval-approve'||action==='approval-deny'){const a=state.approvals.find(x=>x.id===itemId);if(a){a.status=action.endsWith('approve')?'approved-simulated':'denied';a.decidedAt=nowIso();}}
  save();
});

renderAll(); showView(currentView);
