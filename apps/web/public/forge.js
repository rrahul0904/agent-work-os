import { GRAPH_KINDS, buildForgeGraph, layoutForgeGraph } from "./forge-graph.js";

const svgNS = "http://www.w3.org/2000/svg";
const token = localStorage.getItem("agentWorkOsToken") || "";
const state = { snapshot: { machines: [], sessions: [], shippingRuns: [], workItems: [] },
  graph: null, selected: null, filter: "all", socket: null, reconnects: 0, refreshPromise: null };
const graphEl = document.querySelector("#graph");
const connectionEl = document.querySelector("#connection");
const errorEl = document.querySelector("#error");
const inspector = document.querySelector("#inspect-content");
const kinds = GRAPH_KINDS;
const titles = ["MACHINES", "AGENT SESSIONS", "CODEX ACTIVITY", "SUBAGENTS", "SHIPPING RUNS", "WORK ITEMS"];

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
    ". Edges represent recorded machine bindings, Codex item membership and observed delegation. Task dependencies are not yet available in this API.";
  renderSvg(view);
  renderInspector();
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
    ...(node.kind === "subagent" ? [fact("Delegated thread", node.rawId)] : []),
    fact("Machine binding", node.machineId || "None recorded"),
    fact("Project ID", node.projectId || "None recorded"),
    fact("Last recorded update", date(node.updatedAt)),
    fact("Recorded events", node.eventCount),
    ...(node.raw.exitCode !== undefined ? [fact("Command exit code", node.raw.exitCode)] : []),
    ...(node.raw.changedFileCount !== undefined ? [fact("Files changed", node.raw.changedFileCount)] : []),
    ...(node.raw.planStepCount !== undefined ? [fact("Plan steps recorded", node.raw.planStepCount)] : []),
    fact("Shipping receipt attached", node.kind === "shipping" ? (node.evidence ? "Yes" : "No") : "Not applicable")
  );
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
await refreshState();
connect();
setInterval(refreshState, 30_000);
