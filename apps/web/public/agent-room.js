import { classifySession, eventPresentation, latestMeaningfulEvent, machineGroups, sessionLabel, summarizeRoom } from './agent-room-model.js';

const room = document.querySelector('#room');
const state = {
  machines: [], sessions: [], selectedId: null, replayIndex: null,
  connected: false, paused: false, demo: false, socket: null, reconnectTimer: null
};
let token = new URLSearchParams(location.search).get('token') || localStorage.getItem('agentWorkOsToken') || '';
if (new URLSearchParams(location.search).has('token')) {
  localStorage.setItem('agentWorkOsToken', token);
  history.replaceState({}, '', location.pathname);
}

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const when = value => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }); };
const initial = value => String(value || '?').trim().slice(0, 1).toUpperCase();

async function api(path) {
  const response = await fetch(path, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 401) { logout(); throw new Error('unauthorized'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

async function boot() {
  if (!token) return renderLogin();
  try {
    const snapshot = await api('/api/state');
    state.machines = snapshot.machines || [];
    state.sessions = snapshot.sessions || [];
    ensureSelection();
    connect();
    render();
  } catch (error) {
    if (error.message !== 'unauthorized') renderError(error.message);
  }
}

function connect() {
  if (!token || state.demo) return;
  clearTimeout(state.reconnectTimer);
  state.socket?.close();
  const url = new URL('/ws', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('role', 'client');
  url.searchParams.set('token', token);
  const socket = new WebSocket(url);
  state.socket = socket;
  socket.onopen = () => { state.connected = true; render(); };
  socket.onclose = () => {
    if (state.socket !== socket) return;
    state.connected = false; render();
    if (token && !state.demo) state.reconnectTimer = setTimeout(connect, 1800);
  };
  socket.onmessage = event => {
    if (state.paused || state.demo) return;
    const message = JSON.parse(event.data);
    if (message.type === 'state.snapshot') {
      state.machines = message.machines || [];
      state.sessions = message.sessions || [];
    }
    if (message.type === 'machine.updated') state.machines = upsert(state.machines, message.machine);
    if (message.type === 'session.updated') state.sessions = upsert(state.sessions, message.session, true);
    ensureSelection();
    if (state.replayIndex != null) {
      const session = selectedSession();
      state.replayIndex = Math.min(state.replayIndex, Math.max(0, (session?.events?.length || 1) - 1));
    }
    render();
  };
}

function upsert(items, item, front = false) {
  const rest = items.filter(entry => entry.id !== item.id);
  return front ? [item, ...rest] : [...rest, item];
}

function ensureSelection() {
  if (state.sessions.some(session => session.id === state.selectedId)) return;
  state.selectedId = state.sessions[0]?.id || null;
  state.replayIndex = null;
}

function selectedSession() { return state.sessions.find(session => session.id === state.selectedId) || state.sessions[0] || null; }

function render() {
  if (!token && !state.demo) return renderLogin();
  const sessions = state.demo ? demoSessions() : state.sessions;
  const machines = state.demo ? demoMachines() : state.machines;
  if (state.demo && !sessions.some(session => session.id === state.selectedId)) state.selectedId = sessions[0]?.id || null;
  const counts = summarizeRoom(sessions);
  room.innerHTML = `<div class="shell">
    <header class="topbar">
      <div class="brand"><div class="mark">AR</div><div><h1>Agent Room</h1><p>Glanceable multi-agent operations · no extra model calls</p></div></div>
      <div class="actions">
        ${state.demo ? '<span class="demo-note">Demo feed</span>' : `<span class="connection ${state.connected ? 'online' : ''}"><i></i>${state.connected ? 'Live' : 'Reconnecting'}</span>`}
        <button class="btn ${state.paused ? 'active' : ''}" id="pause">${state.paused ? 'Resume live' : 'Pause live'}</button>
        <button class="btn" id="demo">${state.demo ? 'Use live data' : 'Demo'}</button>
        <a class="btn" href="/">Shipping OS</a>
      </div>
    </header>
    <section class="summary">
      ${metric('Total agents', counts.total, '')}
      ${metric('Working', counts.working, 'working')}
      ${metric('Waiting', counts.waiting, 'waiting')}
      ${metric('Blocked', counts.blocked, 'blocked')}
      ${metric('Done', counts.done, 'done')}
    </section>
    <main class="workspace">
      <section class="panel"><div class="panel-head"><div><h2>Live floor</h2><p>Blocked first, then active work, waiting, completed</p></div><span>${sessions.length} session${sessions.length === 1 ? '' : 's'}</span></div>${cardsHtml(sessions, machines)}</section>
      <section class="panel detail">${detailHtml(sessions)}</section>
    </main>
  </div>`;
  wire();
}

function metric(label, value, tone) { return `<article class="metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`; }

function cardsHtml(sessions, machines) {
  if (!sessions.length) return '<div class="empty">No agent sessions yet. Start a session from Shipping OS or open Demo to preview the room.</div>';
  const groups = machineGroups(sessions, machines);
  return `<div class="agent-grid">${groups.map(group => `
    <div class="group-label"><span class="machine-dot ${group.machine.status === 'online' ? 'online' : ''}"></span><strong>${esc(group.machine.name || group.machine.id)}</strong> · ${esc(group.machine.status || 'unknown')}</div>
    ${group.sessions.map(cardHtml).join('')}`).join('')}</div>`;
}

function cardHtml(session) {
  const classification = classifySession(session);
  const latest = latestMeaningfulEvent(session);
  const latestView = latest ? eventPresentation(latest) : null;
  return `<button class="agent-card ${classification.state} ${session.id === state.selectedId ? 'selected' : ''}" data-session="${esc(session.id)}">
    <div class="row"><div class="avatar">${esc(initial(session.agent))}</div><span class="status ${classification.state}">${esc(classification.label)}</span></div>
    <div class="agent-name">${esc(sessionLabel(session))}</div>
    <div class="agent-sub">${esc(session.agent || 'agent')} ${session.model ? `· ${esc(session.model)}` : ''} · ${when(session.updatedAt)}</div>
    <div class="screen-line">${esc(latestView ? `${latestView.title}${latestView.body ? ` — ${latestView.body}` : ''}` : 'Waiting for activity…')}</div>
    ${classification.attention ? `<div class="attention">⚠ ${esc(classification.attention.reason)}</div>` : ''}
  </button>`;
}

function detailHtml(sessions) {
  const session = sessions.find(item => item.id === state.selectedId) || sessions[0];
  if (!session) return '<div class="empty">Select an agent when a session appears.</div>';
  const classification = classifySession(session);
  const events = session.events || [];
  const liveIndex = Math.max(0, events.length - 1);
  const index = state.replayIndex == null ? liveIndex : Math.min(state.replayIndex, liveIndex);
  const event = events[index] || latestMeaningfulEvent(session) || { kind:'status', status:session.status, message:'No recorded event yet.' };
  const present = eventPresentation(event);
  return `<div class="panel-head"><div class="identity"><div class="avatar">${esc(initial(session.agent))}</div><div><h2>${esc(sessionLabel(session))}</h2><p>${esc(session.cwd || '')}</p></div></div><span class="status ${classification.state}">${esc(classification.label)}</span></div>
    <div class="screen"><div class="screen-top"><span>${esc(present.title)}</span><span>${state.replayIndex == null ? 'LIVE' : `REPLAY ${index + 1}/${Math.max(events.length, 1)}`}</span></div><pre class="screen-body ${esc(present.tone)}">${esc(present.body || 'No output captured for this event.')}</pre></div>
    <div class="timeline-wrap"><div class="timeline-title"><span>Session replay</span><span>${events.length} events · click any bar</span></div>${timelineHtml(events, index)}</div>
    <div class="messages">${(session.messages || []).slice(-6).map(message => `<article class="message"><b>${esc(message.role || 'message')} · ${when(message.createdAt)}</b>${esc(message.text || '')}</article>`).join('') || '<div class="empty">No conversation messages captured.</div>'}</div>`;
}

function timelineHtml(events, activeIndex) {
  if (!events.length) return '<div class="empty">No event timeline yet.</div>';
  return `<div class="timeline">${events.map((event, index) => `<button class="tick ${esc(event.kind || '')} ${index === activeIndex ? 'active' : ''}" data-event="${index}" title="${esc(`${index + 1}. ${eventPresentation(event).title}`)}"></button>`).join('')}</div>`;
}

function wire() {
  document.querySelectorAll('[data-session]').forEach(button => button.onclick = () => { state.selectedId = button.dataset.session; state.replayIndex = null; render(); });
  document.querySelectorAll('[data-event]').forEach(button => button.onclick = () => { state.replayIndex = Number(button.dataset.event); render(); });
  document.querySelector('#pause')?.addEventListener('click', () => { state.paused = !state.paused; if (!state.paused) state.replayIndex = null; render(); });
  document.querySelector('#demo')?.addEventListener('click', () => {
    state.demo = !state.demo; state.replayIndex = null; state.paused = false;
    if (state.demo) { state.socket?.close(); state.connected = false; state.selectedId = demoSessions()[0].id; }
    else { state.selectedId = state.sessions[0]?.id || null; connect(); }
    render();
  });
}

function renderLogin() {
  room.innerHTML = `<div class="login"><div class="login-card"><div class="mark">AR</div><h1>Open Agent Room</h1><p>Use the same local control-plane token as Shipping OS. The room reads normalized session events already held by this Agent Work OS instance.</p><form id="login"><input name="token" type="password" autocomplete="current-password" placeholder="Control-plane token" autofocus><button class="btn primary">Enter</button></form><button class="btn" id="demo-login" style="margin-top:10px">Preview demo without a session</button></div></div>`;
  document.querySelector('#login').onsubmit = event => { event.preventDefault(); const value = new FormData(event.currentTarget).get('token')?.trim(); if (!value) return; token = value; localStorage.setItem('agentWorkOsToken', token); boot(); };
  document.querySelector('#demo-login').onclick = () => { state.demo = true; state.selectedId = demoSessions()[0].id; render(); };
}

function renderError(message) { room.innerHTML = `<div class="login"><div class="login-card"><h1>Agent Room unavailable</h1><p>${esc(message)}</p><button class="btn" id="retry">Retry</button></div></div>`; document.querySelector('#retry').onclick = boot; }
function logout() { token = ''; localStorage.removeItem('agentWorkOsToken'); state.socket?.close(); renderLogin(); }

function demoMachines() { return [{ id:'demo-mac', name:'MacBook Pro · local', status:'online' }, { id:'demo-ci', name:'CI executor', status:'online' }]; }
function demoSessions() {
  const now = new Date().toISOString();
  return [
    { id:'demo-review', machineId:'demo-mac', cwd:'/workspace/agent-work-os', agent:'reviewer', model:'gpt-5.6-sol', status:'failed', updatedAt:now, messages:[{ role:'user', text:'Verify the release candidate and stop on any failed gate.', createdAt:now }], events:[{ kind:'status', status:'running', message:'Review started', at:now },{ kind:'tool', name:'npm test', phase:'completed', payload:{ exitCode:1, summary:'1 regression failed: replay retains stale session' }, at:now },{ kind:'error', message:'Verification failed; promotion blocked.', at:now }] },
    { id:'demo-builder', machineId:'demo-mac', cwd:'/workspace/threadtales', agent:'builder', model:'gpt-5.6-sol', status:'running', updatedAt:now, messages:[{ role:'user', text:'Implement the export flow in the isolated worktree.', createdAt:now }], events:[{ kind:'status', status:'running', message:'Implementation started', at:now },{ kind:'tool', name:'file_edit', phase:'completed', payload:{ file:'src/export.ts', diff:'+ validate recipient before export' }, at:now },{ kind:'tool', name:'test', phase:'started', payload:{ command:'npm test -- export' }, at:now }] },
    { id:'demo-approval', machineId:'demo-ci', cwd:'/workspace/snowflake-brain', agent:'release', model:'codex', status:'running', updatedAt:now, messages:[{ role:'user', text:'Prepare preview promotion but do not deploy without approval.', createdAt:now }], events:[{ kind:'status', status:'running', message:'Release checks green', at:now },{ kind:'log', stream:'stdout', text:'Waiting for deployment approval before protected preview promotion.', at:now }] },
    { id:'demo-done', machineId:'demo-ci', cwd:'/workspace/provenance-cleaner', agent:'verifier', model:'echo', status:'completed', updatedAt:now, messages:[{ role:'assistant', text:'Exact-SHA verification complete.', createdAt:now }], events:[{ kind:'tool', name:'acceptance', phase:'completed', payload:{ tests:24, failed:0 }, at:now },{ kind:'status', status:'completed', message:'All release gates passed', at:now }] }
  ];
}

boot();
