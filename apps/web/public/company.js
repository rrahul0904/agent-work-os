const $ = (selector) => document.querySelector(selector);
const tokenInput = $("#token");
const statusEl = $("#status");
const saved = sessionStorage.getItem("agentWorkOsToken");
if (saved) tokenInput.value = saved;

$("#connect").addEventListener("click", load);
$("#export").addEventListener("click", exportAudit);
if (saved) load();

async function api(path, options = {}) {
  const token = tokenInput.value.trim();
  if (!token) throw new Error("Control token is required");
  sessionStorage.setItem("agentWorkOsToken", token);
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
  return body;
}

async function load() {
  setStatus("Loading company state…");
  try {
    const [overview, structure, decisionDesk] = await Promise.all([
      api("/api/company/overview"), api("/api/company/structure"), api("/api/company/decision-desk")
    ]);
    renderMetrics(overview.metrics);
    renderAttention(overview.attention);
    renderStructure(structure);
    renderMembers(overview.members);
    renderDecisions(decisionDesk.decisions);
    setStatus(`Connected · ${overview.organization.name} · generated ${formatTime(overview.generatedAt)}`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function renderMetrics(metrics) {
  const rows = [
    ["Needs you", metrics.needsHuman], ["Open work", metrics.openWork], ["Active runs", metrics.activeRuns],
    ["Pending decisions", metrics.pendingDecisions], ["Review queue", metrics.reviewQueue], ["Finished today", metrics.finishedToday]
  ];
  $("#metrics").innerHTML = rows.map(([label,value]) => `<div class="metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join("");
}

function renderAttention(attention) {
  const buckets = [
    ["Decisions", attention.decisions, (x) => `${x.question}${x.workItem ? ` · ${x.workItem.title}` : ""}`],
    ["Review", attention.review, (x) => x.title],
    ["Human-only", attention.humanOnly, (x) => x.title],
  ];
  $("#attention").classList.remove("empty");
  $("#attention").innerHTML = buckets.map(([title,items,label]) => `<div class="bucket"><h3>${esc(title)} <span class="small">${items.length}</span></h3>${items.length ? items.map((item)=>`<div class="item">${esc(label(item))}<div class="small">${esc(item.riskLevel || item.lane || item.status || "")}</div></div>`).join("") : '<div class="small">Clear</div>'}</div>`).join("");
}

function renderStructure(structure) {
  const rows = [`<div class="org-row"><strong>★ ${esc(structure.president.name)}</strong><span>President</span><span class="small">Human authority</span></div>`];
  for (const member of structure.members) rows.push(`<div class="org-row"><strong>${esc(member.name)}</strong><span>${esc(member.role)}</span><span class="small">${esc(member.department)} · reports to ${esc(member.managerId)}</span></div>`);
  $("#structure").classList.remove("empty");
  $("#structure").innerHTML = rows.join("");
}

function renderMembers(members) {
  $("#members").classList.remove("empty");
  $("#members").innerHTML = members.length ? members.map((member) => `<article class="member"><h3>${esc(member.name)}</h3><div class="small">${esc(member.role)} · ${esc(member.provider || "provider not set")}</div><p><span class="pill run-${esc(member.runState)}">${esc(member.runState)}</span> <span class="pill">${esc(member.openWork)} open</span></p></article>`).join("") : '<div class="small">No agent members configured yet. Configure the organization through the company API.</div>';
}

function renderDecisions(decisions) {
  const root = $("#decisions"); root.innerHTML = ""; root.classList.remove("empty");
  if (!decisions.length) { root.innerHTML = '<div class="small">No decision requests yet.</div>'; return; }
  const template = $("#decision-template");
  for (const decision of decisions) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = decision.id;
    node.querySelector(".risk").textContent = `${decision.riskLevel || "medium"} risk`;
    node.querySelector(".policy").textContent = decision.policyRef || "no policy ref";
    node.querySelector(".question").textContent = decision.question;
    node.querySelector(".reason").textContent = decision.reason || decision.workItem?.title || "No reason supplied.";
    node.querySelector(".evidence").innerHTML = (decision.evidenceRefs || []).map((ref)=>`<code>${esc(ref)}</code>`).join("") || '<span class="small">No evidence refs supplied.</span>';
    const select = node.querySelector(".option");
    const options = decision.options || [];
    select.innerHTML = options.length ? '<option value="">Choose…</option>' + options.map((option)=>`<option value="${attr(option.id)}" ${option.id===decision.recommendedOptionId?"selected":""}>${esc(option.label)}</option>`).join("") : '<option value="">No explicit option</option>';
    if (decision.status !== "pending") {
      node.classList.add("resolved");
      node.querySelector(".receipt").textContent = `${decision.status} · ${decision.selectedOptionId || "no option"} · receipt ${short(decision.resolutionDigest)}`;
    } else {
      node.querySelectorAll("button[data-status]").forEach((button)=>button.addEventListener("click",()=>resolveDecision(node, decision, button.dataset.status)));
    }
    root.append(node);
  }
}

async function resolveDecision(node, decision, resolutionStatus) {
  try {
    const selectedOptionId = node.querySelector(".option").value || undefined;
    const rationale = node.querySelector(".rationale").value.trim();
    setStatus(`Resolving ${decision.id}…`);
    await api(`/api/decisions/${encodeURIComponent(decision.id)}/resolve`, { method:"POST", body:JSON.stringify({ status:resolutionStatus, selectedOptionId, rationale, actor:{ id:"president", kind:"human" } }) });
    await load();
  } catch (error) { setStatus(error.message, "error"); }
}

async function exportAudit() {
  try {
    const audit = await api("/api/company/audit-export");
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type:"application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `agent-work-os-audit-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
    setStatus(`Audit export ready · digest ${short(audit.digest)}`, "ok");
  } catch (error) { setStatus(error.message, "error"); }
}

function setStatus(text, kind="") { statusEl.textContent=text; statusEl.className=`status ${kind}`; }
function formatTime(value){ try{return new Date(value).toLocaleString();}catch{return value;} }
function short(value){ return value ? `${value.slice(0,10)}…` : "n/a"; }
function esc(value){ return String(value ?? "").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }
function attr(value){ return esc(value).replace(/`/g,"&#96;"); }
