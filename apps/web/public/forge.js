import { GRAPH_KINDS, buildForgeGraph, layoutForgeGraph } from "./forge-graph.js";

const svgNS = "http://www.w3.org/2000/svg";
const token = localStorage.getItem("agentWorkOsToken") || "";
const state = { snapshot: { machines: [], sessions: [], shippingRuns: [], workItems: [], forgeObservations: [], forgePlans: [] },
  graph: null, selected: null, filter: "all", socket: null, reconnects: 0, refreshPromise: null };
const graphEl = document.querySelector("#graph");
const connectionEl = document.querySelector("#connection");
const errorEl = document.querySelector("#error");
const inspector = document.querySelector("#inspect-content");
const kinds = GRAPH_KINDS;
const titles = ["FORGE PLANS", "DAG TASKS", "MACHINES", "AGENT SESSIONS", "CODEX ACTIVITY", "SUBAGENTS", "SHIPPING RUNS", "WORK ITEMS"];

function createSvg(tag, attributes = {}, content) {
  const el = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
  if (content !== undefined) el.textContent = String(content);
  return el;
}
function date(value) {
  if (typeof value !== "string") return "Not recorded";
  const d = new Date(value);
  return Number.isNaN(+d) ? "Not recorded" : d.toLocaleString();
}
function short(value, max = 37) {
  const str = String(value ?? "");
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
function status(message, healthy = false) {
  connectionEl.textContent = message;
  connectionEl.className = "connection " + (healthy ? "live" : "warn");
}
function error(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}
function upsert(items, incoming, key = "id") {
  if (!incoming || typeof incoming !== "object") return items;
  const incomingId = incoming[key];
  if (incomingId == null) return items;
  return [incoming, ...items.filter(item => item?.[key] !== incomingId)];
}
function refreshDisplay() {
  const original = buildForgeGraph(state.snapshot);
  state.graph = original;
  for (const kind of kinds) document.querySelector("#count-" + kind).textContent = original.counts[kind];
  const shown = state.filter === "all" ? original.nodes : original.nodes.filter(node => node.kind === state.filter);
  const visible = new Set(shown.map(n => n.id));
  const view = layoutForgeGraph({ nodes: shown, edges: original.edges.filter(e => visible.has(e.from) && visible.has(e.to)) });
  document.querySelector("#graph-notice").textContent =
    "Showing " + shown.length + " of " + original.totalNodes + " observed records" +
    (original.truncated ? " (" + original.truncated + " excluded by safety cap)" : "") +
    ". Solid edges represent recorded machine bindings, Codex activity, observed delegation, and verified Forge task dependencies where plans exist.";
  renderSvg(view);
  renderInspector();
  renderSupervisorControls();
}
function renderSvg(layout) {
  graphEl.replaceChildren();
  graphEl.setAttribute("viewBox", "0 0 " + layout.width + " " + layout.height);
  graphEl.setAttribute("width", layout.width);
  graphEl.setAttribute("height", layout.height);
  const defs = createSvg("defs");
  const marker = createSvg("marker", { id: "forge-arrow", markerWidth: 7, markerHeight: 7, refX: 6,
    refY: 3.5, orient: "auto", markerUnits: "strokeWidth" });
  marker.append(createSvg("path", { d: "M0,0 L7,3.5 L0,7 z", fill: "#507593" }));
  defs.append(marker);
  graphEl.append(defs);
  kinds.forEach((kind, i) => graphEl.append(createSvg("text",
    { x: 24 + i * 326, y: 35, class: "graph-column" }, titles[i])));
  if (!layout.nodes.length) {
    graphEl.append(createSvg("text", { x: 42, y: 165, class: "empty-svg" },
      "No matching recorded work. Connect a daemon or start an authorized session."));
    return;
  }
  for (const edge of layout.edges) {
    const distance = Math.max(30, (edge.x2 - edge.x1) * 0.45);
    const d = "M " + edge.x1 + " " + edge.y1 + " C " + (edge.x1 + distance) + " " + edge.y1 +
      " " + (edge.x2 - distance) + " " + edge.y2 + " " + edge.x2 + " " + edge.y2;
    const line = createSvg("path", { d, class: "edge", "marker-end": "url(#forge-arrow)" });
    const title = createSvg("title", {}, "Observed machine binding");
    line.append(title);
    graphEl.append(line);
  }
  for (const node of layout.nodes) {
    const g = createSvg("g", {
      transform: "translate(" + node.x + "," + node.y + ")",
      class: "node " + node.tone + (state.selected === node.id ? " selected" : ""),
      tabindex: 0, role: "button",
      "aria-label": node.humanKind + ": " + node.label + "; status " + node.status
    });
    g.append(createSvg("rect", { width: node.width, height: node.height, rx: 12, ry: 12 }));
    g.append(createSvg("circle", { cx: 270, cy: 17, r: 5, class: "status-dot" }));
    g.append(createSvg("text", { x: 16, y: 20, class: "node-kind" }, node.humanKind.toUpperCase()));
    g.append(createSvg("text", { x: 16, y: 43, class: "node-label" }, short(node.label, 32)));
    g.append(createSvg("text", { x: 16, y: 63, class: "node-meta" },
      short(node.status.toUpperCase() + " · " + node.rawId, 45)));
    g.append(createSvg("title", {}, node.label + " — " + node.status + " — " + node.rawId));
    g.addEventListener("click", () => { state.selected = node.id; refreshDisplay(); });
    g.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); state.selected = node.id; refreshDisplay(); }
    });
    graphEl.append(g);
  }
}
function fact(label, value) {
  const el = document.createElement("div"); el.className = "fact";
  const title = document.createElement("span"); title.textContent = label;
  const content = document.createElement("strong"); content.textContent = String(value ?? "Not recorded");
  el.append(title, content);
  return el;
}
function renderInspector() {
  inspector.replaceChildren();
  const node = state.graph?.nodes.find(n => n.id === state.selected);
  if (!node) {
    const p = document.createElement("p"); p.className = "placeholder";
    p.textContent = "Select a recorded machine, session, run or work item. Activity and source bindings shown here come from the current authorized snapshot.";
    inspector.append(p); return;
  }
  inspector.append(
    fact("Record", node.humanKind),
    fact("Name", node.label),
    fact("State reported by backend", node.status),
    fact("Record ID", node.rawId),
    ...(node.sessionId ? [fact("Parent Agent Work OS session", node.sessionId)] : []),
    ...(node.traceId ? [fact("Codex turn trace", node.traceId)] : []),
    ...(node.itemType ? [fact("Codex item type", node.itemType)] : []),
    ...(node.source ? [fact("Evidence source", node.source)] : []),
    ...(node.kind === "subagent" ? [fact("Delegated thread", node.rawId)] : []),
    fact("Machine binding", node.machineId || "None recorded"),
    fact("Project ID", node.projectId || "None recorded"),
    fact("Last recorded update", date(node.updatedAt)),
    fact("Recorded events", node.eventCount),
    ...(node.raw.exitCode !== undefined ? [fact("Command exit code", node.raw.exitCode)] : []),
    ...(node.raw.changedFileCount !== undefined ? [fact("Files changed", node.raw.changedFileCount)] : []),
    ...(node.raw.planStepCount !== undefined ? [fact("Plan steps recorded", node.raw.planStepCount)] : []),
    ...(node.raw.eventName ? [fact("Codex hook event", node.raw.eventName)] : []),
    ...(node.raw.toolName ? [fact("Tool name", node.raw.toolName)] : []),
    ...(node.planId ? [fact("Plan ID", node.planId)] : []),
    ...(Array.isArray(node.raw.dependsOn) ? [fact("Depends on", node.raw.dependsOn.join(", ") || "No prerequisites")] : []),
    ...(node.verification?.digest ? [fact("Verification digest", node.verification.digest)] : []),
    fact("Shipping receipt attached", node.kind === "shipping" ? (node.evidence ? "Yes" : "No") : "Not applicable")
  );
  if (node.kind === "task") renderTaskVerificationControls(node);
  const heading = document.createElement("h3"); heading.textContent = "Recent recorded events";
  inspector.append(heading);
  const events = Array.isArray(node.raw.events) ? node.raw.events.slice(-12).reverse() : [];
  if (!events.length) {
    const p = document.createElement("p"); p.className = "hint";
    p.textContent = "No event history is present in this record. A missing trace is not proof of inactivity.";
    inspector.append(p); return;
  }
  const ul = document.createElement("ul"); ul.className = "event-list";
  events.forEach(event => {
    const li = document.createElement("li");
    const b = document.createElement("b");
    b.textContent = short(event.type ?? event.kind ?? event.status ?? event.state ?? "event", 38);
    const small = document.createElement("small");
    small.textContent = date(event.at ?? event.createdAt ?? event.timestamp);
    li.append(b, small); ul.append(li);
  });
  inspector.append(ul);
}
async function forgeRequest(path, payload) {
  const response = await fetch(path, {
    method: payload === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json" },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || "Forge request failed: " + response.status);
  return body;
}
let forgeSupervisorEnabled = false;
let selectedPlanId = "";
async function probeForgeSupervisor() {
  try {
    const result = await forgeRequest("/api/forge/plans");
    forgeSupervisorEnabled = true;
    state.snapshot.forgePlans = result.plans || [];
    error(""); refreshDisplay();
  } catch {
    forgeSupervisorEnabled = false;
    document.querySelector("#forge-supervisor-state").textContent = "Disabled · opt-in local feature";
    document.querySelector("#forge-create-button").disabled = true;
  }
}
function renderSupervisorControls() {
  document.querySelector("#forge-supervisor-state").textContent = forgeSupervisorEnabled
    ? "Local supervisor enabled" : "Local supervisor disabled (set AGENT_WORK_OS_ENABLE_FORGE_SUPERVISOR=true)";
  document.querySelector("#forge-create-button").disabled = !forgeSupervisorEnabled;
  const select = document.querySelector("#forge-plan-select");
  const plans = state.snapshot.forgePlans || [];
  if (!plans.some(p => p.id === selectedPlanId)) selectedPlanId = plans[0]?.id || "";
  select.replaceChildren();
  for (const plan of plans) {
    const option = document.createElement("option");
    option.value = plan.id; option.textContent = short(plan.title, 35) + " · " + plan.state;
    option.selected = plan.id === selectedPlanId;
    select.append(option);
  }
  if (!plans.length) {
    const option = document.createElement("option"); option.value = ""; option.textContent = "No plans";
    select.append(option);
  }
  const plan = plans.find(p => p.id === selectedPlanId);
  document.querySelector("#forge-plan-summary").textContent = plan
    ? plan.tasks.map(t => t.id + ": " + t.state + (t.dependsOn.length ? " · after " + t.dependsOn.join(",") : "")).join("\n")
    : "Create a draft plan, inspect the DAG, then approve dispatch.";
  document.querySelector("#forge-plan-summary").style.whiteSpace = "pre-wrap";
  document.querySelector("#forge-approve").disabled = !forgeSupervisorEnabled || plan?.state !== "draft";
  document.querySelector("#forge-stop").disabled = !forgeSupervisorEnabled || !["draft", "running"].includes(plan?.state);
}
function renderTaskVerificationControls(node) {
  if (!forgeSupervisorEnabled || !node.planId) return;
  if (!["awaiting_verification", "blocked", "failed"].includes(node.status)) return;
  const panel = document.createElement("div"); panel.className = "verify-controls";
  const hint = document.createElement("p");
  hint.textContent = node.status === "awaiting_verification"
    ? "External verification is required. Attach a SHA-256 digest of real test/review evidence; this records a human attestation, not automated proof."
    : "This task needs operator investigation. Retry may repeat partially executed work.";
  panel.append(hint);
  if (node.status === "awaiting_verification") {
    const reviewer = document.createElement("input"); reviewer.placeholder = "Independent reviewer identity";
    const digest = document.createElement("input"); digest.placeholder = "sha256: + 64 hex characters";
    const reviewerLabel = document.createElement("label"); reviewerLabel.textContent = "Reviewer"; reviewerLabel.append(reviewer);
    const digestLabel = document.createElement("label"); digestLabel.textContent = "Evidence digest"; digestLabel.append(digest);
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Attest evidence and unlock dependents";
    button.onclick = async () => {
      if (!window.confirm("Confirm you independently verified actual test evidence for this specific task?")) return;
      try {
        await forgeRequest("/api/forge/plans/" + encodeURIComponent(node.planId) +
          "/tasks/" + encodeURIComponent(node.rawId) + "/verify",
        { approved: true, reviewer: reviewer.value, digest: digest.value });
        await refreshState();
      } catch (e) { error(e.message); }
    };
    panel.append(reviewerLabel, digestLabel, button);
  } else {
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "danger";
    retry.textContent = "Authorize one retry";
    retry.onclick = async () => {
      if (!window.confirm("Retry could repeat a partially executed Codex task. Have you inspected the prior attempt?")) return;
      try {
        await forgeRequest("/api/forge/plans/" + encodeURIComponent(node.planId) +
          "/tasks/" + encodeURIComponent(node.rawId) + "/retry", {});
        await refreshState();
      } catch (e) { error(e.message); }
    };
    panel.append(retry);
  }
  inspector.append(panel);
}

async function refreshState() {
  if (state.refreshPromise) return state.refreshPromise;
  state.refreshPromise = (async () => {
    try {
      const headers = token ? { authorization: "Bearer " + token } : {};
      const response = await fetch("/api/state", { credentials: "same-origin", headers, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401
        ? "Authentication required. Sign in to Agent Work OS or use the local developer console first."
        : "State request failed: HTTP " + response.status);
      const snapshot = await response.json();
      state.snapshot = snapshot;
      document.querySelector("#last-update").textContent = "Last synchronized: " + new Date().toLocaleTimeString();
      error("");
      refreshDisplay();
    } catch (e) {
      error(e.message);
      status("State unavailable");
    }
  })();
  try { await state.refreshPromise; } finally { state.refreshPromise = null; }
}
let reconnectTimer = null;
function connect() {
  if (state.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.socket.readyState)) return;
  const url = new URL("/ws", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("role", "client");
  // Mirrors the existing development-only bearer flow; production uses the
  // HttpOnly identity cookie during the WebSocket handshake instead.
  if (token) url.searchParams.set("token", token);
  status("Connecting to event stream");
  const ws = new WebSocket(url);
  state.socket = ws;
  ws.addEventListener("open", () => { state.reconnects = 0; status("Live event stream", true); });
  ws.addEventListener("message", e => {
    let message;
    try { message = JSON.parse(e.data); } catch { return; }
    if (!message || typeof message !== "object") return;
    if (message.type === "state.snapshot") {
      state.snapshot = message;
      document.querySelector("#last-update").textContent = "Last event: " + new Date().toLocaleTimeString();
      error(""); refreshDisplay(); return;
    }
    if (message.type === "machine.updated") state.snapshot.machines =
      upsert(state.snapshot.machines || [], message.machine);
    else if (message.type === "session.updated") state.snapshot.sessions =
      upsert(state.snapshot.sessions || [], message.session);
    else if (message.type === "shipping.run.updated") state.snapshot.shippingRuns =
      upsert(state.snapshot.shippingRuns || [], message.run, "runId");
    else if (message.type === "forge.observation.updated" && message.observation?.id) state.snapshot.forgeObservations =
      upsert(state.snapshot.forgeObservations || [], message.observation).slice(0, 1000);
    else if (message.type === "forge.plan.updated" && message.plan?.id) state.snapshot.forgePlans =
      upsert(state.snapshot.forgePlans || [], message.plan);
    else if (message.workItem && message.workItem.id) state.snapshot.workItems =
      upsert(state.snapshot.workItems || [], message.workItem);
    else return;
    document.querySelector("#last-update").textContent = "Last event: " + new Date().toLocaleTimeString();
    refreshDisplay();
  });
  ws.addEventListener("close", () => {
    if (state.socket !== ws) return;
    status("Reconnecting");
    clearTimeout(reconnectTimer);
    const ms = Math.min(15_000, 1000 * Math.pow(2, Math.min(state.reconnects++, 4)));
    reconnectTimer = setTimeout(connect, ms);
  });
  ws.addEventListener("error", () => status("Connection interrupted"));
}
document.querySelector("#filter").addEventListener("change", event => {
  state.filter = event.target.value; refreshDisplay();
});
document.querySelector("#refresh").addEventListener("click", refreshState);
document.querySelector("#forge-plan-select").addEventListener("change", event => {
  selectedPlanId = event.target.value;
  renderSupervisorControls();
});
document.querySelector("#forge-template").addEventListener("click", () => {
  const machine = state.snapshot.machines?.find(m => m.status === "online");
  const spec = {
    title: "REA Forge proof-of-execution",
    machineId: machine?.id ?? "REPLACE_WITH_ONLINE_MACHINE_ID",
    cwd: "/ABSOLUTE/PATH/UNDER/APPROVED/WORKSPACE_ROOT",
    maxParallel: 2,
    tasks: [
      { id: "research", title: "Collect evidence", agent: "echo", prompt: "Read public source and report evidence", dependsOn: [] },
      { id: "inventory", title: "Inventory existing work", agent: "echo", prompt: "Inspect owner repository and roadmap", dependsOn: [] },
      { id: "architecture", title: "Propose clean-room design", agent: "echo", prompt: "Design architecture and interfaces", dependsOn: ["research", "inventory"] },
      { id: "verify", title: "Independent review", agent: "echo", prompt: "Review code/tests and capture evidence", dependsOn: ["architecture"] }
    ]
  };
  document.querySelector("#forge-plan-json").value = JSON.stringify(spec, null, 2);
});
document.querySelector("#forge-create").addEventListener("submit", async event => {
  event.preventDefault();
  if (!forgeSupervisorEnabled) return;
  try {
    const spec = JSON.parse(document.querySelector("#forge-plan-json").value);
    const plan = await forgeRequest("/api/forge/plans", spec);
    selectedPlanId = plan.id;
    await refreshState();
  } catch (e) { error(e.message); }
});
document.querySelector("#forge-approve").addEventListener("click", async () => {
  if (!forgeSupervisorEnabled || !selectedPlanId) return;
  if (!window.confirm("Start approved local Forge tasks through the existing daemon? No merge, push or deploy permission is granted.")) return;
  try {
    await forgeRequest("/api/forge/plans/" + encodeURIComponent(selectedPlanId) + "/approve", {});
    await refreshState();
  } catch (e) { error(e.message); }
});
document.querySelector("#forge-stop").addEventListener("click", async () => {
  if (!forgeSupervisorEnabled || !selectedPlanId) return;
  if (!window.confirm("Stop new scheduling? Already running external tasks will continue unless separately interrupted.")) return;
  try {
    await forgeRequest("/api/forge/plans/" + encodeURIComponent(selectedPlanId) + "/stop", {});
    await refreshState();
  } catch (e) { error(e.message); }
});

await refreshState();
await probeForgeSupervisor();
connect();
setInterval(refreshState, 30_000);
