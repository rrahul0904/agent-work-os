const state = {
  page: 'overview', product: null, machines: [], sessions: [], shippingRuns: [],
  selectedRun: null, selectedSession: null, contractText: '', launchOpen: false,
  connected: false, loading: false, notice: null
};
const app = document.querySelector('#app');
let token = new URLSearchParams(location.search).get('token') || localStorage.getItem('agentWorkOsToken') || '';
if (new URLSearchParams(location.search).has('token')) {
  localStorage.setItem('agentWorkOsToken', token);
  history.replaceState({}, '', location.pathname + location.hash);
}

function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function shortSha(value='') { return value ? String(value).slice(0, 9) : '—'; }
function when(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.valueOf()) ? esc(value) : d.toLocaleString(); }
function statusClass(value='') { return `status-${String(value).toLowerCase().replaceAll('_','-')}`; }
function authHeaders(extra={}) { return { ...extra, authorization: `Bearer ${token}` }; }
async function api(url, options={}) {
  const response = await fetch(url, { ...options, headers: authHeaders(options.headers || {}) });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) { logout(false); throw new Error('Control-plane token is invalid.'); }
  if (!response.ok) throw new Error(body.message || body.error || `Request failed: ${response.status}`);
  return body;
}
function setNotice(message, kind='info') { state.notice = { message, kind }; render(); setTimeout(() => { if (state.notice?.message === message) { state.notice = null; render(); } }, 4500); }

async function bootstrap() {
  if (!token) return renderLogin();
  state.loading = true; render();
  try {
    const [snapshot, product, example] = await Promise.all([api('/api/state'), api('/api/product'), api('/api/shipping/example')]);
    state.machines = snapshot.machines || [];
    state.sessions = snapshot.sessions || [];
    state.shippingRuns = snapshot.shippingRuns || [];
    state.product = product;
    state.contractText = JSON.stringify(example, null, 2);
    connect();
  } catch (error) {
    if (token) setNotice(error.message, 'error');
  } finally { state.loading = false; render(); }
}
function connect() {
  if (!token) return;
  const url = new URL('/ws', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('role', 'client'); url.searchParams.set('token', token);
  const ws = new WebSocket(url);
  ws.onopen = () => { state.connected = true; render(); };
  ws.onclose = () => { state.connected = false; render(); if (token) setTimeout(connect, 1800); };
  ws.onmessage = async event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state.snapshot') { state.machines = msg.machines || []; state.sessions = msg.sessions || []; state.shippingRuns = msg.shippingRuns || []; }
    if (msg.type === 'machine.updated') state.machines = upsert(state.machines, msg.machine);
    if (msg.type === 'session.updated') state.sessions = upsert(state.sessions, msg.session, true);
    if (msg.type === 'shipping.run.updated') state.shippingRuns = upsert(state.shippingRuns, msg.run, true);
    await refreshProduct(false);
    render();
  };
}
function upsert(items, item, front=false) { const rest = items.filter(x => (x.id || x.runId) !== (item.id || item.runId)); return front ? [item, ...rest] : [...rest, item]; }
async function refreshProduct(withRender=true) { try { state.product = await api('/api/product'); } catch {} if (withRender) render(); }

function renderLogin() {
  app.innerHTML = `<div class="login-shell"><div class="login-card">
    <div class="mark">SO</div><p class="eyebrow">SHIPPING OS</p><h1>Product factory control plane</h1>
    <p class="muted">Use the control-plane token configured on the server. It stays in this browser and is sent only as a Bearer token to this host.</p>
    <form id="login"><label>Control-plane token<input name="token" type="password" autocomplete="current-password" autofocus placeholder="Enter token"></label><button class="primary">Open console</button></form>
    <div class="login-proof"><span>Receipt-gated</span><span>Exact-SHA</span><span>Repair loops</span><span>Local execution</span></div>
  </div></div>`;
  document.querySelector('#login').onsubmit = event => { event.preventDefault(); const value = new FormData(event.currentTarget).get('token')?.trim(); if (!value) return; token = value; localStorage.setItem('agentWorkOsToken', token); bootstrap(); };
}
function logout(renderNow=true) { token = ''; localStorage.removeItem('agentWorkOsToken'); state.connected = false; if (renderNow) renderLogin(); }

function render() {
  if (!token) return renderLogin();
  const counts = state.product?.counts || {};
  app.innerHTML = `<div class="product-shell">
    <aside class="sidebar">
      <div class="brand"><div class="mark">SO</div><div><strong>Shipping OS</strong><small>Agent Work OS</small></div></div>
      <nav>${navButton('overview','Overview','⌂')}${navButton('portfolio','Portfolio','◆')}${navButton('runs','Shipping runs','↗')}${navButton('receipts','Evidence','✓')}${navButton('agents','Local agents','◎')}</nav>
      <div class="sidebar-foot"><div class="connection"><i class="${state.connected?'online':'offline'}"></i>${state.connected?'Realtime connected':'Reconnecting'}</div><button class="ghost small" id="logout">Lock console</button></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div><p class="eyebrow">PRODUCT FACTORY</p><h1>${pageTitle()}</h1></div><div class="top-actions"><span class="health-pill"><i></i>${counts.activeRuns || 0} active run${counts.activeRuns===1?'':'s'}</span><button class="primary compact" id="launch">＋ Launch shipping run</button></div></header>
      ${state.notice ? `<div class="notice ${esc(state.notice.kind)}">${esc(state.notice.message)}</div>` : ''}
      <main class="content">${state.loading ? '<div class="loading">Loading factory state…</div>' : pageHtml()}</main>
    </div>
    ${state.launchOpen ? launchDrawer() : ''}
  </div>`;
  wire();
}
function navButton(page,label,icon) { return `<button data-page="${page}" class="nav-item ${state.page===page?'active':''}"><span>${icon}</span>${label}</button>`; }
function pageTitle() { return ({overview:'Factory overview',portfolio:'Portfolio queue',runs:'Shipping runs',receipts:'Release evidence',agents:'Local agent control'})[state.page]; }
function pageHtml() {
  if (state.page === 'portfolio') return portfolioHtml();
  if (state.page === 'runs') return runsHtml();
  if (state.page === 'receipts') return receiptsHtml();
  if (state.page === 'agents') return agentsHtml();
  return overviewHtml();
}

function overviewHtml() {
  const p = state.product || { counts:{}, portfolio:[], runs:[], receipts:[] };
  const c = p.counts || {}; const next = p.nextProject;
  return `<section class="metric-grid">
    ${metric('Portfolio', c.projects ?? 0, `${c.shippedProjects ?? 0} shipped`, 'mint')}
    ${metric('Active runs', c.activeRuns ?? 0, `${state.shippingRuns.length} total runs`, 'blue')}
    ${metric('Blockers', c.blockers ?? 0, 'explicit only', (c.blockers||0)?'amber':'mint')}
    ${metric('Machines', c.onlineMachines ?? 0, 'online executors', 'violet')}
  </section>
  <section class="overview-grid">
    <article class="panel hero-panel"><div class="panel-head"><div><p class="eyebrow">NEXT BEST PROJECT</p><h2>${next?esc(next.name):'Portfolio is clear'}</h2></div>${next?statusBadge(next.status):''}</div>
      ${next?`<div class="priority-line"><strong>${next.priorityScore}</strong><span>priority score</span><div class="readiness"><i style="width:${next.readiness}%"></i></div><b>${next.readiness}% readiness</b></div><p class="hero-copy">${esc(next.nextAction || 'No next action recorded.')}</p><div class="evidence-row">${(next.evidence||[]).slice(0,3).map(x=>`<span>✓ ${esc(x)}</span>`).join('')}</div><button class="secondary" data-page="portfolio">Open portfolio →</button>`:'<p class="hero-copy">Every registered product has a shipped receipt.</p>'}
    </article>
    <article class="panel"><div class="panel-head"><div><p class="eyebrow">FACTORY STATE</p><h2>Release truth</h2></div></div>${factoryTruth(c)}</article>
  </section>
  <section class="split-grid"><article class="panel"><div class="panel-head"><div><p class="eyebrow">RECENT RUNS</p><h2>Supervisor activity</h2></div><button class="link" data-page="runs">View all</button></div>${runRows((state.shippingRuns||[]).slice(0,5))}</article>
  <article class="panel"><div class="panel-head"><div><p class="eyebrow">LATEST EVIDENCE</p><h2>Release receipts</h2></div><button class="link" data-page="receipts">View evidence</button></div>${receiptRows((p.receipts||[]).slice(0,4))}</article></section>`;
}
function metric(label,value,detail,tone) { return `<article class="metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`; }
function factoryTruth(c) { const rows=[['Shipping receipts',c.receipts||0],['Explicit blockers',c.blockers||0],['Online executors',c.onlineMachines||0],['Active agent sessions',c.activeSessions||0]]; return `<div class="truth-list">${rows.map(([a,b])=>`<div><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('')}</div>`; }

function portfolioHtml() {
  const projects = state.product?.portfolio || [];
  return `<section class="section-head"><div><p class="eyebrow">PRIORITIZED BY VALUE × READINESS − EFFORT − RISK</p><h2>${projects.length} registered products</h2></div><button class="secondary" id="refresh">Refresh evidence</button></section>
  <section class="portfolio-list">${projects.map((project,index)=>`<article class="project-card ${project.status==='SHIPPED'?'shipped':''}">
    <div class="rank">${project.status==='SHIPPED'?'✓':String(index+1).padStart(2,'0')}</div><div class="project-main"><div class="project-title"><div><h3>${esc(project.name)}</h3><a href="https://github.com/${esc(project.repository||'')}" target="_blank" rel="noreferrer">${esc(project.repository||project.id)}</a></div>${statusBadge(project.status)}</div>
    <div class="project-meta"><div><span>Priority</span><strong>${project.priorityScore}</strong></div><div><span>Readiness</span><strong>${project.readiness}%</strong></div><div><span>Value</span><strong>${project.value}/5</strong></div><div><span>Effort</span><strong>${project.effort}/5</strong></div><div><span>Risk</span><strong>${project.risk}/5</strong></div></div>
    <div class="readiness large"><i style="width:${project.readiness}%"></i></div><p class="next-action"><b>Next:</b> ${esc(project.nextAction||'No next action recorded')}</p>
    ${(project.blockers||[]).length?`<div class="blockers">${project.blockers.map(b=>`<div><strong>${esc(b.code||'BLOCKED')}</strong><span>${esc(b.message||b)}</span></div>`).join('')}</div>`:''}
    <div class="evidence-row">${(project.evidence||[]).map(x=>`<span>✓ ${esc(x)}</span>`).join('')}</div></div></article>`).join('')}</section>`;
}

function runsHtml() {
  const runs = state.shippingRuns || [];
  const selected = runs.find(r=>r.runId===state.selectedRun) || runs[0]; if (selected) state.selectedRun=selected.runId;
  return `<section class="runs-layout"><div class="run-list panel"><div class="panel-head"><div><p class="eyebrow">RUN HISTORY</p><h2>${runs.length} shipping runs</h2></div><button class="primary compact" id="launch-inline">＋ New</button></div>${runs.length?runs.map(r=>`<button class="run-select ${selected?.runId===r.runId?'active':''}" data-run="${esc(r.runId)}"><div><strong>${esc(r.projectId)}</strong><small>${esc(r.releaseVersion||'')}</small></div>${statusBadge(r.state)}<span>${when(r.updatedAt)}</span></button>`).join(''):'<div class="empty">No supervisor runs have been launched from this control plane yet.</div>'}</div>
    <div class="run-detail panel">${selected?runDetail(selected):'<div class="empty big">Launch a Shipping Contract to see gate-by-gate evidence here.</div>'}</div></section>`;
}
function runDetail(run) { const events=run.events||[]; return `<div class="panel-head"><div><p class="eyebrow">${esc(run.runId)}</p><h2>${esc(run.projectId)} · ${esc(run.releaseVersion||'')}</h2></div>${statusBadge(run.state)}</div>
  <div class="run-facts"><div><span>Tested SHA</span><strong>${shortSha(run.testedSha)}</strong></div><div><span>Deployed SHA</span><strong>${shortSha(run.deployedSha)}</strong></div><div><span>Machine</span><strong>${esc(run.machineId||'—')}</strong></div><div><span>Events</span><strong>${events.length}</strong></div></div>
  ${run.blocker?`<div class="blocker-banner"><strong>${esc(run.blocker.code)}</strong><span>${esc(run.blocker.message||'Run is blocked')}</span></div>`:''}${run.fatalError?`<div class="blocker-banner"><strong>FAILED</strong><span>${esc(run.fatalError)}</span></div>`:''}
  <div class="timeline">${events.length?events.slice().reverse().map(e=>`<article><i class="${statusClass(e.state)}"></i><div><strong>${esc(e.type)}</strong><span>${esc(e.state)}</span><small>${when(e.at)}</small>${e.message?`<p>${esc(e.message)}</p>`:''}</div></article>`).join(''):'<div class="empty">Waiting for the local executor to report the first gate.</div>'}</div>`; }
function runRows(runs) { return runs.length?`<div class="table-list">${runs.map(r=>`<button data-page="runs" data-run="${esc(r.runId)}"><div><strong>${esc(r.projectId)}</strong><small>${esc(r.runId)}</small></div>${statusBadge(r.state)}<span>${when(r.updatedAt)}</span></button>`).join('')}</div>`:'<div class="empty">No shipping runs yet.</div>'; }

function receiptsHtml() {
  const receipts = state.product?.receipts || [];
  return `<section class="section-head"><div><p class="eyebrow">TAMPER-EVIDENT RELEASE HISTORY</p><h2>${receipts.length} evidence receipts</h2></div></section><section class="receipt-grid">${receipts.length?receipts.map(receiptCard).join(''):'<div class="empty big">No release receipts are available.</div>'}</section>`;
}
function receiptCard(r) { const project=r.project?.id||r.projectId||'release'; const version=r.project?.releaseVersion||r.releaseVersion||''; const sha=r.source?.testedSha||r.testedSha||r.production?.deployedSha||r.deployedSha; return `<article class="receipt-card"><div class="receipt-top"><div><span class="receipt-icon">✓</span><div><p class="eyebrow">SHIPPING RECEIPT</p><h3>${esc(project)} ${esc(version)}</h3></div></div>${statusBadge(r.status||'SHIPPED')}</div><div class="receipt-proof"><div><span>Source SHA</span><strong>${shortSha(sha)}</strong></div><div><span>Preview</span><strong>${esc(r.preview?.readiness||'PASS')}</strong></div><div><span>Production</span><strong>${esc(r.production?.readiness||'PASS')}</strong></div><div><span>Integrity</span><strong>${esc(r.production?.productionIntegrity||'PASS')}</strong></div></div><code>${esc(r.receiptDigest||r.finalEventDigest||'receipt recorded')}</code>${r.path?`<small>${esc(r.path)}</small>`:''}</article>`; }
function receiptRows(receipts) { return receipts.length?`<div class="receipt-rows">${receipts.map(r=>`<div><span class="receipt-icon mini">✓</span><div><strong>${esc(r.project?.id||r.projectId||'release')}</strong><small>${esc(r.project?.releaseVersion||r.releaseVersion||'')} · ${shortSha(r.source?.testedSha||r.testedSha||r.production?.deployedSha)}</small></div><b>SHIPPED</b></div>`).join('')}</div>`:'<div class="empty">No receipts yet.</div>'; }

function agentsHtml() {
  const selected=state.sessions.find(s=>s.id===state.selectedSession)||state.sessions[0]; if(selected)state.selectedSession=selected.id;
  return `<section class="agents-layout"><div class="panel"><div class="panel-head"><div><p class="eyebrow">EXECUTORS</p><h2>${state.machines.length} machines</h2></div></div>${state.machines.length?state.machines.map(machineCard).join(''):'<div class="empty">No local daemon connected.</div>'}<div class="panel-head sub"><div><p class="eyebrow">AGENT SESSIONS</p><h2>${state.sessions.length} sessions</h2></div></div>${state.sessions.map(s=>`<button class="session-select ${selected?.id===s.id?'active':''}" data-session="${s.id}"><strong>${esc(s.agent)}</strong><span>${esc(s.status)}</span><small>${esc(s.cwd)}</small></button>`).join('')||'<div class="empty">No sessions.</div>'}</div><div class="panel session-panel">${selected?sessionHtml(selected):agentWelcome()}</div><div class="panel">${newSessionHtml()}</div></section>`;
}
function machineCard(m){return `<article class="machine-card"><div><i class="${m.status==='online'?'online':'offline'}"></i><strong>${esc(m.name)}</strong></div><small>${esc(m.platform)}/${esc(m.arch)}</small><div class="chips">${(m.capabilities||[]).map(c=>`<span>${esc(c.name)}</span>`).join('')}${m.shipping?.enabled?'<span class="shipping-chip">shipping</span>':''}</div></article>`;}
function sessionHtml(s){return `<div class="panel-head"><div><p class="eyebrow">${esc(s.agent)} SESSION</p><h2>${esc(s.cwd)}</h2></div><button class="danger compact" id="interrupt">Interrupt</button></div><div class="messages">${(s.messages||[]).map(m=>`<div class="msg ${m.role}"><small>${esc(m.role)}</small><pre>${esc(m.text)}</pre></div>`).join('')}</div><form id="follow" class="follow"><textarea name="text" placeholder="Send a follow-up…"></textarea><button class="primary">Send</button></form>`;}
function agentWelcome(){return `<div class="empty big"><strong>Local execution, remote control.</strong><p>Connect the daemon on your workstation to run Codex without moving source or credentials into the control plane.</p></div>`;}
function newSessionHtml(){const online=state.machines.filter(m=>m.status==='online');return `<form id="new-session" class="stack"><div class="panel-head"><div><p class="eyebrow">NEW AGENT SESSION</p><h2>Delegate work</h2></div></div><label>Machine<select name="machineId">${online.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label><label>Agent<select name="agent">${(online[0]?.capabilities||[]).map(c=>`<option>${esc(c.name)}</option>`).join('')}</select></label><label>Working directory<input name="cwd" placeholder="/path/to/repo"></label><label>Model<input name="model" placeholder="optional"></label><label>Prompt<textarea name="prompt" placeholder="Implement the next verified change…"></textarea></label><button class="primary" ${online.length?'':'disabled'}>Start local agent</button></form>`;}

function launchDrawer() {
  const shippingMachines=state.machines.filter(m=>m.status==='online'&&m.shipping?.enabled);
  return `<div class="drawer-backdrop" id="drawer-backdrop"><aside class="drawer" role="dialog" aria-modal="true"><div class="drawer-head"><div><p class="eyebrow">SUPERVISOR</p><h2>Launch Shipping Contract</h2></div><button class="icon-btn" id="close-drawer">×</button></div><p class="muted">The contract executes on the selected local machine in an isolated Git worktree. The builder can repair code, but only the supervisor can emit SHIPPED.</p><form id="shipping-form" class="stack"><label>Execution machine<select name="machineId">${shippingMachines.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label><label>Shipping Contract JSON<textarea class="contract-editor" name="contract" spellcheck="false">${esc(state.contractText)}</textarea></label><div class="drawer-actions"><button type="button" class="secondary" id="validate-contract">Validate contract</button><button class="primary" ${shippingMachines.length?'':'disabled'}>Launch supervisor</button></div>${shippingMachines.length?'':'<div class="blocker-banner"><strong>NO EXECUTOR</strong><span>Connect an updated local daemon before launching a shipping run.</span></div>'}</form></aside></div>`;
}
function statusBadge(status='UNKNOWN'){return `<span class="status ${statusClass(status)}">${esc(status)}</span>`;}

function wire() {
  document.querySelector('#logout')?.addEventListener('click',()=>logout());
  document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>{state.page=el.dataset.page;if(el.dataset.run)state.selectedRun=el.dataset.run;render();}));
  document.querySelector('#launch')?.addEventListener('click',()=>{state.launchOpen=true;render();});
  document.querySelector('#launch-inline')?.addEventListener('click',()=>{state.launchOpen=true;render();});
  document.querySelector('#refresh')?.addEventListener('click',()=>refreshProduct());
  document.querySelectorAll('[data-run]').forEach(el=>el.addEventListener('click',()=>{state.selectedRun=el.dataset.run;state.page='runs';render();}));
  document.querySelectorAll('[data-session]').forEach(el=>el.addEventListener('click',()=>{state.selectedSession=el.dataset.session;render();}));
  document.querySelector('#close-drawer')?.addEventListener('click',()=>{state.launchOpen=false;render();});
  document.querySelector('#drawer-backdrop')?.addEventListener('click',e=>{if(e.target.id==='drawer-backdrop'){state.launchOpen=false;render();}});
  const shippingForm=document.querySelector('#shipping-form');
  document.querySelector('#validate-contract')?.addEventListener('click',async()=>{try{const contract=JSON.parse(new FormData(shippingForm).get('contract'));await api('/api/shipping/contracts/validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contract})});setNotice('Shipping Contract is valid.','success');}catch(error){setNotice(error.message,'error');}});
  if(shippingForm) shippingForm.onsubmit=async e=>{e.preventDefault();try{const f=new FormData(shippingForm);const contract=JSON.parse(f.get('contract'));state.contractText=JSON.stringify(contract,null,2);const run=await api('/api/shipping/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({machineId:f.get('machineId'),contract})});state.shippingRuns=upsert(state.shippingRuns,run,true);state.selectedRun=run.runId;state.page='runs';state.launchOpen=false;await refreshProduct(false);setNotice(`Shipping run ${run.runId} queued.`,'success');render();}catch(error){setNotice(error.message,'error');}};
  const newSession=document.querySelector('#new-session');
  if(newSession)newSession.onsubmit=async e=>{e.preventDefault();try{const f=new FormData(newSession);const session=await api('/api/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(f))});state.selectedSession=session.id;state.sessions=upsert(state.sessions,session,true);render();}catch(error){setNotice(error.message,'error');}};
  const follow=document.querySelector('#follow');
  const selected=state.sessions.find(s=>s.id===state.selectedSession)||state.sessions[0];
  if(follow&&selected)follow.onsubmit=async e=>{e.preventDefault();const text=new FormData(follow).get('text');try{await api(`/api/sessions/${selected.id}/messages`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});follow.reset();}catch(error){setNotice(error.message,'error');}};
  document.querySelector('#interrupt')?.addEventListener('click',()=>selected&&api(`/api/sessions/${selected.id}/interrupt`,{method:'POST'}).catch(e=>setNotice(e.message,'error')));
}

bootstrap();
