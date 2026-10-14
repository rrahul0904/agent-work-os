import {
  addExpense,
  addReward,
  addTask,
  calculateSettlements,
  completeTask,
  createSeedState,
  ensureState,
  householdWeeklyPoints,
  leaderboard,
  redeemReward,
  streakFor
} from "./core.js";

const STORAGE_KEY = "homequest-demo-v1";
const channel = "BroadcastChannel" in window ? new BroadcastChannel("homequest-demo-sync") : null;
let state = loadState();
let activeTab = "home";
let focus = { remaining: 25 * 60, running: false, interval: null };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? ensureState(JSON.parse(raw)) : createSeedState();
  } catch {
    return createSeedState();
  }
}

function saveState(next, broadcast = true) {
  state = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (broadcast) channel?.postMessage({ type: "state", state });
  render();
}

channel?.addEventListener("message", (event) => {
  if (event.data?.type === "state") saveState(event.data.state, false);
});
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY && event.newValue) {
    try { saveState(ensureState(JSON.parse(event.newValue)), false); } catch {}
  }
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const memberName = (id) => state.members.find((m) => m.id === id)?.name ?? "Unknown";
const currentMember = () => state.members.find((m) => m.id === state.currentMemberId) ?? state.members[0];
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"})[ch]);
const money = (value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
const timeAgo = (iso) => {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

function render() {
  renderHeader();
  renderHome();
  renderTasks();
  renderRewards();
  renderMoney();
  renderLists();
  renderMore();
  $$("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === activeTab));
  $$("[data-panel]").forEach((panel) => panel.hidden = panel.dataset.panel !== activeTab);
}

function renderHeader() {
  $("#household-name").textContent = state.household.name;
  $("#member-switch").innerHTML = state.members.map((m) => `<option value="${m.id}" ${m.id === state.currentMemberId ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  $("#points-pill").textContent = `${currentMember().points} pts`;
}

function renderHome() {
  const weekly = householdWeeklyPoints(state);
  const goal = state.household.weeklyGoal;
  const pct = Math.min(100, Math.round((weekly / goal) * 100));
  const me = currentMember();
  $("#home-panel").innerHTML = `
    <section class="hero card">
      <div>
        <span class="eyebrow">THIS WEEK</span>
        <h2>${weekly} / ${goal} points</h2>
        <p>${pct >= 100 ? "Goal reached — nice teamwork." : `${Math.max(0, goal - weekly)} points to unlock your household target.`}</p>
      </div>
      <div class="goal-ring" style="--p:${pct}"><strong>${pct}%</strong></div>
      <div class="progress"><span style="width:${pct}%"></span></div>
    </section>

    <section class="stats-grid">
      <article class="mini-card"><span>My points</span><strong>${me.points}</strong><small>Spendable reward balance</small></article>
      <article class="mini-card"><span>My streak</span><strong>${streakFor(state, me.id)}</strong><small>Consecutive active days</small></article>
      <article class="mini-card"><span>Open chores</span><strong>${state.tasks.filter((t) => !t.done).length}</strong><small>${state.tasks.filter((t) => t.assigneeId === me.id && !t.done).length} assigned to you</small></article>
    </section>

    <section class="card focus-card">
      <div>
        <span class="eyebrow">FOCUS TOGETHER</span>
        <h3>Shared cleaning sprint</h3>
        <p>Tasks finished while the demo timer is running earn a 25% HomeQuest bonus.</p>
      </div>
      <div class="timer" id="focus-time">${formatTime(focus.remaining)}</div>
      <div class="button-row">
        <button class="primary" data-action="focus-toggle">${focus.running ? "Pause" : "Start 25m"}</button>
        <button class="ghost" data-action="focus-reset">Reset</button>
      </div>
    </section>

    <section class="two-col">
      <article class="card">
        <div class="section-head"><div><span class="eyebrow">LEADERBOARD</span><h3>Friendly competition</h3></div></div>
        <div class="stack">${leaderboard(state).map((m, i) => `<div class="leader"><span class="rank">${i + 1}</span><span class="avatar">${esc(m.avatar)}</span><div><strong>${esc(m.name)}</strong><small>${m.weeklyPoints} pts this week</small></div><span>${m.id === me.id ? "You" : ""}</span></div>`).join("")}</div>
      </article>
      <article class="card">
        <div class="section-head"><div><span class="eyebrow">ACTIVITY</span><h3>What changed</h3></div></div>
        <div class="stack activity">${state.activity.slice(0, 6).map((a) => `<div><span class="dot"></span><p>${esc(a.text)}<small>${timeAgo(a.createdAt)}</small></p></div>`).join("") || "<p>No activity yet.</p>"}</div>
      </article>
    </section>`;
}

function renderTasks() {
  $("#tasks-panel").innerHTML = `
    <section class="card">
      <div class="section-head"><div><span class="eyebrow">CHORES</span><h2>Make the work visible</h2></div><span class="chip">Focus bonus ${focus.running ? "ON" : "OFF"}</span></div>
      <form id="task-form" class="form-grid">
        <input name="title" required placeholder="Add a chore…" />
        <select name="assigneeId">${state.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select>
        <input name="category" placeholder="Category" value="Home" />
        <input name="points" type="number" min="1" max="200" value="10" />
        <select name="due"><option>Today</option><option>Tomorrow</option><option>This week</option><option>Anytime</option></select>
        <button class="primary" type="submit">Add chore</button>
      </form>
    </section>
    <section class="task-list">${state.tasks.map((task) => `<article class="task card ${task.done ? "done" : ""}">
      <div class="task-check"><button aria-label="Complete ${esc(task.title)}" ${task.done ? "disabled" : ""} data-action="complete-task" data-id="${task.id}">${task.done ? "✓" : ""}</button></div>
      <div class="task-main"><div><span class="chip subtle">${esc(task.category)}</span><span class="chip subtle">${esc(task.due)}</span></div><h3>${esc(task.title)}</h3><p>${task.done ? `Completed by ${esc(memberName(task.completedBy))}` : `Assigned to ${esc(memberName(task.assigneeId))}`}</p></div>
      <strong class="task-points">${task.points} pts</strong>
    </article>`).join("")}</section>`;
}

function renderRewards() {
  const me = currentMember();
  $("#rewards-panel").innerHTML = `
    <section class="card">
      <div class="section-head"><div><span class="eyebrow">REWARDS</span><h2>Turn effort into something fun</h2></div><span class="points-balance">${me.points} pts available</span></div>
      <form id="reward-form" class="form-grid compact"><input name="title" required placeholder="Reward name" /><input name="cost" type="number" min="1" value="80" /><button class="primary" type="submit">Create reward</button></form>
    </section>
    <section class="reward-grid">${state.rewards.map((reward) => `<article class="reward card"><div class="reward-icon">★</div><h3>${esc(reward.title)}</h3><p>${reward.cost} points</p><button class="${me.points >= reward.cost ? "primary" : "ghost"}" ${me.points < reward.cost ? "disabled" : ""} data-action="redeem" data-id="${reward.id}">Redeem</button></article>`).join("")}</section>`;
}

function renderMoney() {
  const settlements = calculateSettlements(state);
  $("#money-panel").innerHTML = `
    <section class="card"><div class="section-head"><div><span class="eyebrow">SHARED MONEY</span><h2>Keep household costs transparent</h2></div></div>
      <form id="expense-form" class="form-grid compact"><input name="title" required placeholder="Expense" /><input name="amount" required type="number" min="0" step="0.01" placeholder="Amount" /><select name="paidBy">${state.members.map((m) => `<option value="${m.id}">${esc(m.name)} paid</option>`).join("")}</select><button class="primary" type="submit">Add expense</button></form>
    </section>
    <section class="two-col"><article class="card"><h3>Expenses</h3><div class="stack">${state.expenses.map((e) => `<div class="line-item"><div><strong>${esc(e.title)}</strong><small>${esc(memberName(e.paidBy))} paid · split ${e.splitBetween.length} ways</small></div><strong>${money(e.amount)}</strong></div>`).join("")}</div></article>
    <article class="card"><h3>Settle up</h3><div class="stack">${settlements.length ? settlements.map((s) => `<div class="settlement"><strong>${esc(memberName(s.from))}</strong><span>pays</span><strong>${esc(memberName(s.to))}</strong><b>${money(s.amount)}</b></div>`).join("") : "<p>Everyone is even.</p>"}</div></article></section>`;
}

function renderLists() {
  $("#lists-panel").innerHTML = `
    <section class="card"><div class="section-head"><div><span class="eyebrow">SHARED LIST</span><h2>Groceries & quick notes</h2></div></div>
      <form id="list-form" class="inline-form"><input name="text" required placeholder="Add an item…" /><button class="primary">Add</button></form>
      <div class="check-list">${state.listItems.map((item) => `<label class="check-row ${item.done ? "checked" : ""}"><input type="checkbox" data-action="toggle-list" data-id="${item.id}" ${item.done ? "checked" : ""}/><span>${esc(item.text)}</span></label>`).join("")}</div>
    </section>`;
}

function renderMore() {
  $("#more-panel").innerHTML = `
    <section class="three-col">
      <article class="card"><span class="eyebrow">CHAT</span><h3>Household thread</h3><div class="message-list">${state.messages.slice(-5).map((m) => `<div class="message ${m.memberId === state.currentMemberId ? "mine" : ""}"><strong>${esc(memberName(m.memberId))}</strong><p>${esc(m.text)}</p></div>`).join("")}</div><form id="message-form" class="inline-form"><input name="text" required placeholder="Message…"/><button class="primary">Send</button></form></article>
      <article class="card"><span class="eyebrow">CALENDAR</span><h3>Home events</h3><div class="stack">${state.events.map((e) => `<div class="line-item"><div><strong>${esc(e.title)}</strong><small>${esc(e.date)}</small></div></div>`).join("")}</div><form id="event-form" class="stack-form"><input name="title" required placeholder="Event"/><input name="date" required type="date"/><button class="primary">Add event</button></form></article>
      <article class="card"><span class="eyebrow">STANDARDS</span><h3>Recurring routines</h3><div class="check-list">${state.standards.map((s) => `<label class="check-row ${s.done ? "checked" : ""}"><input type="checkbox" data-action="toggle-standard" data-id="${s.id}" ${s.done ? "checked" : ""}/><span>${esc(s.title)}<small>${esc(s.cadence)}</small></span></label>`).join("")}</div><form id="standard-form" class="stack-form"><input name="title" required placeholder="Routine"/><select name="cadence"><option>Weekly</option><option>Monthly</option><option>Daily</option></select><button class="primary">Add standard</button></form></article>
    </section>
    <section class="card demo-note"><strong>Prototype truth</strong><p>This preview stores data only in this browser and syncs other tabs using browser events. Production realtime, authentication, push notifications, offline conflict handling, billing, and multi-home tenancy are specified in the REA dossier but are not represented as already shipped.</p><div class="button-row"><button class="ghost" data-action="export">Export JSON</button><button class="ghost danger" data-action="reset">Reset demo</button></div></section>`;
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function startFocus() {
  if (focus.running) {
    clearInterval(focus.interval);
    focus.running = false;
    render();
    return;
  }
  focus.running = true;
  focus.interval = setInterval(() => {
    focus.remaining -= 1;
    const node = $("#focus-time");
    if (node) node.textContent = formatTime(focus.remaining);
    if (focus.remaining <= 0) {
      clearInterval(focus.interval);
      focus = { remaining: 5 * 60, running: false, interval: null };
      render();
    }
  }, 1000);
  render();
}

function resetFocus() {
  clearInterval(focus.interval);
  focus = { remaining: 25 * 60, running: false, interval: null };
  render();
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const fd = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "task-form") saveState(addTask(state, fd));
    if (form.id === "reward-form") saveState(addReward(state, fd));
    if (form.id === "expense-form") saveState(addExpense(state, { ...fd, splitBetween: state.members.map((m) => m.id) }));
    if (form.id === "list-form") {
      const next = structuredClone(state); next.listItems.push({ id: crypto.randomUUID(), text: fd.text.trim(), done: false }); saveState(next);
    }
    if (form.id === "message-form") {
      const next = structuredClone(state); next.messages.push({ id: crypto.randomUUID(), memberId: state.currentMemberId, text: fd.text.trim(), createdAt: new Date().toISOString() }); saveState(next);
    }
    if (form.id === "event-form") {
      const next = structuredClone(state); next.events.push({ id: crypto.randomUUID(), title: fd.title.trim(), date: fd.date }); saveState(next);
    }
    if (form.id === "standard-form") {
      const next = structuredClone(state); next.standards.push({ id: crypto.randomUUID(), title: fd.title.trim(), cadence: fd.cadence, done: false }); saveState(next);
    }
    form.reset();
  } catch (error) { toast(error.message); }
}

function onClick(event) {
  const button = event.target.closest("button[data-action], button[data-tab]");
  if (!button) return;
  if (button.dataset.tab) { activeTab = button.dataset.tab; render(); return; }
  const { action, id } = button.dataset;
  try {
    if (action === "complete-task") saveState(completeTask(state, id, state.currentMemberId, { focusActive: focus.running }));
    if (action === "redeem") saveState(redeemReward(state, id, state.currentMemberId));
    if (action === "focus-toggle") startFocus();
    if (action === "focus-reset") resetFocus();
    if (action === "export") exportState();
    if (action === "reset") { localStorage.removeItem(STORAGE_KEY); state = createSeedState(); saveState(state); }
  } catch (error) { toast(error.message); }
}

function onChange(event) {
  const target = event.target;
  if (target.id === "member-switch") {
    const next = structuredClone(state); next.currentMemberId = target.value; saveState(next); return;
  }
  const action = target.dataset?.action;
  if (!action) return;
  const next = structuredClone(state);
  if (action === "toggle-list") {
    const item = next.listItems.find((x) => x.id === target.dataset.id); if (item) item.done = target.checked;
  }
  if (action === "toggle-standard") {
    const item = next.standards.find((x) => x.id === target.dataset.id); if (item) item.done = target.checked;
  }
  saveState(next);
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "homequest-demo.json"; a.click(); URL.revokeObjectURL(url);
}

function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2200);
}

document.addEventListener("submit", onSubmit);
document.addEventListener("click", onClick);
document.addEventListener("change", onChange);
render();
