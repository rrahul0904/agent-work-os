const $ = (selector) => document.querySelector(selector);
let state = { agents: [], versions: [], skills: [], contexts: [], capabilities: [], receipts: [], runtime: { machines: [] } };
let selectedAgentId;

const agentForm = $("#agentForm");
const skillForm = $("#skillForm");
const contextForm = $("#contextForm");

$("#refreshButton").addEventListener("click", refresh);
$("#preflightButton").addEventListener("click", () => actOnSelected("preflight"));
$("#runButton").addEventListener("click", () => actOnSelected("run"));

agentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(agentForm);
  const payload = Object.fromEntries(form.entries());
  payload.capabilityIds = checked("capability");
  payload.skillIds = checked("skill");
  payload.contextIds = checked("context");
  payload.maxPromptChars = Number(payload.maxPromptChars);
  try {
    const agent = await request("/api/studio/agents", payload);
    toast(`Draft created: ${agent.name}`);
    selectedAgentId = agent.id;
    agentForm.reset();
    await refresh();
  } catch (error) { toast(error.message, true); }
});

skillForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(skillForm);
    await request("/api/studio/skills", Object.fromEntries(form.entries()));
    skillForm.reset();
    toast("Skill saved.");
    await refresh();
  } catch (error) { toast(error.message, true); }
});

contextForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(contextForm);
    await request("/api/studio/contexts", Object.fromEntries(form.entries()));
    contextForm.reset();
    toast("Context saved.");
    await refresh();
  } catch (error) { toast(error.message, true); }
});

async function refresh() {
  try {
    state = await request("/api/studio/state");
    render();
  } catch (error) { toast(error.message, true); }
}

function render() {
  const reachable = Boolean(state.runtime?.reachable);
  $("#runtimeDot").classList.toggle("online", reachable);
  $("#runtimeStatus").textContent = reachable ? `${state.runtime.machines.filter((m) => m.status === "online").length} machine(s) online` : "Control plane unreachable";
  renderMachineChoices();
  renderChoices();
  renderAgents();
  renderReceipts();
  renderSelection();
}

function renderMachineChoices() {
  const machineSelect = $("#machineSelect");
  const adapterSelect = $("#adapterSelect");
  const previousMachine = machineSelect.value;
  clear(machineSelect);
  const machines = state.runtime?.machines ?? [];
  if (!machines.length) machineSelect.append(option("", "No machines available"));
  for (const machine of machines) machineSelect.append(option(machine.id, `${machine.name || machine.id} · ${machine.status}`));
  if ([...machineSelect.options].some((item) => item.value === previousMachine)) machineSelect.value = previousMachine;
  const updateAdapters = () => {
    const selected = machines.find((machine) => machine.id === machineSelect.value);
    clear(adapterSelect);
    for (const capability of selected?.capabilities ?? []) adapterSelect.append(option(capability.name, capability.name));
    if (!adapterSelect.options.length) adapterSelect.append(option("", "No adapters advertised"));
  };
  machineSelect.onchange = updateAdapters;
  updateAdapters();
}

function renderChoices() {
  renderChoiceList("#capabilityChoices", "capability", state.capabilities, (item) => `${item.name} · ${item.execution}`, (item) => ["local-session", "structured-receipts"].includes(item.id));
  renderChoiceList("#skillChoices", "skill", state.skills, (item) => item.name);
  renderChoiceList("#contextChoices", "context", state.contexts, (item) => item.name);
}

function renderChoiceList(selector, name, items, label, defaultChecked = () => false) {
  const root = $(selector);
  clear(root);
  if (!items.length) {
    const note = document.createElement("span"); note.className = "meta"; note.textContent = "None yet."; root.append(note); return;
  }
  for (const item of items) {
    const wrapper = document.createElement("label"); wrapper.className = "choice";
    const input = document.createElement("input"); input.type = "checkbox"; input.name = name; input.value = item.id; input.checked = defaultChecked(item);
    const text = document.createElement("span"); text.textContent = label(item);
    wrapper.append(input, text); root.append(wrapper);
  }
}

function renderAgents() {
  const root = $("#agentList"); clear(root);
  $("#agentCount").textContent = `${state.agents.length} agent${state.agents.length === 1 ? "" : "s"}`;
  if (!state.agents.length) { root.className = "stack empty-state"; root.textContent = "No agent definitions yet."; return; }
  root.className = "stack";
  for (const agent of state.agents) {
    const card = document.createElement("article"); card.className = `agent-card${selectedAgentId === agent.id ? " active" : ""}`;
    const copy = document.createElement("div");
    const title = document.createElement("div"); title.className = "card-title"; title.textContent = agent.name;
    const meta = document.createElement("div"); meta.className = "meta";
    const latest = state.versions.find((version) => version.id === agent.latestPublishedVersionId);
    meta.textContent = `${agent.slug} · draft r${agent.draftRevision} · ${latest ? `published v${latest.number} / ${latest.specHash.slice(0, 10)}` : "not published"}`;
    copy.append(title, meta);
    const actions = document.createElement("div"); actions.className = "card-actions";
    actions.append(button("Select", "secondary", () => { selectedAgentId = agent.id; renderAgents(); renderSelection(); }));
    actions.append(button("Publish draft", "secondary", async () => {
      try { await request(`/api/studio/agents/${agent.id}/publish`, {}); toast("Immutable version published."); selectedAgentId = agent.id; await refresh(); }
      catch (error) { toast(error.message, true); }
    }));
    card.append(copy, actions); root.append(card);
  }
}

function renderSelection() {
  const agent = state.agents.find((item) => item.id === selectedAgentId);
  const version = agent ? state.versions.find((item) => item.id === agent.latestPublishedVersionId) : undefined;
  $("#selectedAgentLabel").textContent = !agent ? "Select an agent card below." : version ? `${agent.name} · immutable v${version.number} · ${version.specHash.slice(0, 12)}` : `${agent.name} · publish a version before preflight`;
  $("#preflightButton").disabled = !version;
  $("#runButton").disabled = !version;
}

async function actOnSelected(action) {
  const agent = state.agents.find((item) => item.id === selectedAgentId);
  const version = agent ? state.versions.find((item) => item.id === agent.latestPublishedVersionId) : undefined;
  if (!agent || !version) return;
  const payload = { versionId: version.id, handoffId: $("#handoffId").value.trim() || undefined };
  if (action === "run") payload.prompt = $("#runPrompt").value.trim();
  try {
    const result = await request(`/api/studio/agents/${agent.id}/${action}`, payload);
    $("#runResult").textContent = JSON.stringify(result, null, 2);
    toast(action === "run" ? "Published agent launched." : "Preflight passed.");
    await refresh();
  } catch (error) {
    $("#runResult").textContent = JSON.stringify(error.body ?? { error: error.message }, null, 2);
    toast(error.message, true);
    await refresh();
  }
}

function renderReceipts() {
  const root = $("#receiptList"); clear(root);
  if (!state.receipts.length) { root.className = "stack empty-state"; root.textContent = "No run attempts yet."; return; }
  root.className = "stack";
  for (const receipt of state.receipts) {
    const row = document.createElement("article"); row.className = "receipt";
    const status = document.createElement("div"); status.className = `status ${receipt.status}`; status.textContent = receipt.status;
    const details = document.createElement("div"); details.className = "meta";
    const agent = state.agents.find((item) => item.id === receipt.agentId);
    details.textContent = `${agent?.name || receipt.agentId} · ${receipt.specHash?.slice(0, 12) || "no hash"} · ${receipt.sessionId || "no session"}${receipt.error ? ` · ${receipt.error}` : ""}`;
    const time = document.createElement("div"); time.className = "meta"; time.textContent = new Date(receipt.updatedAt).toLocaleString();
    row.append(status, details, time); root.append(row);
  }
}

async function request(pathname, body) {
  const response = await fetch(pathname, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || `Request failed (${response.status})`);
    error.body = payload;
    throw error;
  }
  return payload;
}

function checked(name) { return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((item) => item.value); }
function clear(node) { while (node.firstChild) node.firstChild.remove(); }
function option(value, label) { const item = document.createElement("option"); item.value = value; item.textContent = label; return item; }
function button(label, className, onClick) { const item = document.createElement("button"); item.type = "button"; item.className = className; item.textContent = label; item.addEventListener("click", onClick); return item; }
function toast(message, failed = false) { const node = $("#toast"); node.textContent = message; node.style.borderColor = failed ? "#8f4848" : "#42516a"; node.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2600); }

refresh();
