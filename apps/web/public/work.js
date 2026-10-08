const $ = (selector) => document.querySelector(selector);
const state = { token: sessionStorage.getItem("agent-work-os-token") || "", items: [], decisions: [], selectedId: null, projection: null };

const tokenInput = $("#token");
tokenInput.value = state.token;
$("#saveToken").addEventListener("click", async () => {
  state.token = tokenInput.value.trim();
  sessionStorage.setItem("agent-work-os-token", state.token);
  await refresh();
});
$("#refresh").addEventListener("click", refresh);

$("#createWork").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const created = await api("/api/work-items", {
      method: "POST",
      body: {
        title: $("#newTitle").value.trim(),
        description: $("#newDescription").value.trim(),
        createdBy: humanActor(),
      },
    });
    $("#newTitle").value = "";
    $("#newDescription").value = "";
    state.selectedId = created.id;
    await refresh();
    notice("Work item created.");
  } catch (error) { notice(error.message, true); }
});

$("#decisionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedId) return;
  const question = $("#decisionQuestion").value.trim();
  if (!question) return;
  try {
    await api(`/api/work-items/${encodeURIComponent(state.selectedId)}/decision-requests`, {
      method: "POST",
      body: { question, kind: "approval", actor: agentActor() },
    });
    $("#decisionQuestion").value = "";
    await loadSelected();
    notice("Decision requested. Human resolution is required before completion.");
  } catch (error) { notice(error.message, true); }
});

$("#handoffForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedId) return;
  try {
    const result = await api(`/api/work-items/${encodeURIComponent(state.selectedId)}/handoffs`, {
      method: "POST",
      body: {
        fromSessionId: $("#sourceSession").value.trim(),
        nextAction: $("#nextAction").value.trim() || undefined,
      },
    });
    const receipt = $("#handoffReceipt");
    receipt.textContent = JSON.stringify(result.receipt, null, 2);
    receipt.hidden = false;
    notice(`Verified handoff created: ${result.receipt.handoffId}`);
  } catch (error) { notice(error.message, true); }
});

document.addEventListener("click", async (event) => {
  const workButton = event.target.closest("[data-work-id]");
  if (workButton) {
    state.selectedId = workButton.dataset.workId;
    renderQueue();
    await loadSelected();
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (actionButton && state.selectedId) {
    await runAction(actionButton.dataset.action);
    return;
  }
  const resolveButton = event.target.closest("[data-resolve-id]");
  if (resolveButton) {
    try {
      await api(`/api/decisions/${encodeURIComponent(resolveButton.dataset.resolveId)}/resolve`, {
        method: "POST",
        body: { status: "approved", comment: "Approved from Work Queue", actor: humanActor() },
      });
      await loadSelected();
      notice("Decision approved by operator.");
    } catch (error) { notice(error.message, true); }
  }
});

async function runAction(action) {
  try {
    const id = encodeURIComponent(state.selectedId);
    if (action === "claim") {
      await api(`/api/work-items/${id}/claim`, { method: "POST", body: { actor: agentActor() } });
      notice("Work claimed by the UI agent actor.");
    } else if (action === "review") {
      await api(`/api/work-items/${id}/move`, { method: "POST", body: { lane: "review", actor: agentActor() } });
      notice("Moved to review. Agent-owned work still requires a completion report before final completion.");
    } else if (action === "complete") {
      await api(`/api/work-items/${id}/complete`, { method: "POST", body: { actor: humanActor() } });
      notice("Authoritative work item completed by the human operator.");
    }
    await refresh();
  } catch (error) { notice(error.message, true); }
}

async function refresh() {
  if (!state.token) {
    $("#authState").textContent = "Enter a control token";
    return;
  }
  try {
    const [work, decisions] = await Promise.all([api("/api/work-items"), api("/api/decisions")]);
    state.items = work.workItems || [];
    state.decisions = decisions.decisions || [];
    $("#authState").textContent = `${state.items.length} work item${state.items.length === 1 ? "" : "s"}`;
    if (!state.selectedId && state.items[0]) state.selectedId = state.items[0].id;
    if (state.selectedId && !state.items.some((item) => item.id === state.selectedId)) state.selectedId = state.items[0]?.id || null;
    renderQueue();
    await loadSelected();
  } catch (error) {
    $("#authState").textContent = "Authorization failed";
    notice(error.message, true);
  }
}

async function loadSelected() {
  const selected = state.items.find((item) => item.id === state.selectedId);
  if (!selected) {
    $("#emptyState").hidden = false;
    $("#workDetail").hidden = true;
    return;
  }
  try {
    state.projection = await api(`/api/work-items/${encodeURIComponent(selected.id)}/work-memory`);
    const decisions = await api("/api/decisions");
    state.decisions = decisions.decisions || [];
    renderDetail(selected);
  } catch (error) { notice(error.message, true); }
}

function renderQueue() {
  const root = $("#workItems");
  root.replaceChildren();
  if (!state.items.length) {
    root.append(textNode("div", "No work items yet.", "emptyState"));
    return;
  }
  for (const item of state.items) {
    const button = document.createElement("button");
    button.className = `workItem${item.id === state.selectedId ? " active" : ""}`;
    button.dataset.workId = item.id;
    const title = document.createElement("strong");
    title.textContent = item.title;
    const meta = document.createElement("span");
    meta.textContent = `${item.lane} · ${item.owner?.id || "unowned"}`;
    button.append(title, meta);
    root.append(button);
  }
}

function renderDetail(item) {
  const projection = state.projection;
  $("#emptyState").hidden = true;
  $("#workDetail").hidden = false;
  $("#laneBadge").textContent = item.lane;
  $("#workTitle").textContent = item.title;
  $("#workDescription").textContent = item.description || "No description.";
  $("#projectionDigest").textContent = projection.digest;
  const dl = $("#authoritativeState");
  dl.replaceChildren();
  addDefinition(dl, "Work ID", item.id);
  addDefinition(dl, "Project", item.projectId);
  addDefinition(dl, "Lane", item.lane);
  addDefinition(dl, "Owner", item.owner?.id || "Unowned");
  addDefinition(dl, "Human only", item.humanOnly ? "Yes" : "No");
  addDefinition(dl, "Completed", projection.workState.done ? "Yes" : "No");

  renderDecisions(item.id);
  const timeline = $("#memoryEntries");
  timeline.replaceChildren();
  for (const entry of projection.entries) {
    const row = document.createElement("article");
    row.className = "entry";
    const meta = document.createElement("div");
    meta.className = "entryMeta";
    const kind = document.createElement("strong");
    kind.textContent = entry.kind;
    const at = document.createElement("span");
    at.textContent = entry.at ? compactDate(entry.at) : "";
    meta.append(kind, at);
    const body = document.createElement("div");
    body.className = "entryBody";
    body.textContent = entry.body || entry.statement || entry.id;
    const source = document.createElement("small");
    source.textContent = `${entry.actor?.type || "unknown"}:${entry.actor?.id || "unknown"} · ${entry.digest?.slice(0, 12) || "no digest"}`;
    body.append(source);
    row.append(meta, body);
    timeline.append(row);
  }
}

function renderDecisions(workItemId) {
  const root = $("#decisions");
  root.replaceChildren();
  const decisions = state.decisions.filter((decision) => decision.workItemId === workItemId);
  if (!decisions.length) {
    root.append(textNode("div", "No decision gates.", "muted"));
    return;
  }
  for (const decision of decisions) {
    const card = document.createElement("div");
    card.className = "decision";
    const question = document.createElement("p");
    question.textContent = decision.question;
    const footer = document.createElement("footer");
    const status = document.createElement("span");
    status.textContent = decision.status;
    footer.append(status);
    if (decision.status === "pending") {
      const approve = document.createElement("button");
      approve.type = "button";
      approve.dataset.resolveId = decision.id;
      approve.textContent = "Approve as human";
      footer.append(approve);
    }
    card.append(question, footer);
    root.append(card);
  }
}

function addDefinition(dl, term, description) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = String(description ?? "");
  dl.append(dt, dd);
}

async function api(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${state.token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `${method} ${url} failed (${response.status})`);
  return payload;
}

function humanActor() { return { id: "web-operator", kind: "human" }; }
function agentActor() { return { id: "web-agent", kind: "agent", provider: "operator-ui" }; }
function compactDate(value) { try { return new Date(value).toLocaleString(); } catch { return String(value); } }
function textNode(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }

let noticeTimer;
function notice(message, error = false) {
  const node = $("#notice");
  node.textContent = message;
  node.className = `notice${error ? " error" : ""}`;
  node.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { node.hidden = true; }, 4200);
}

if (state.token) refresh();
