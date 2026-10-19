(() => {
  "use strict";

  const workloads = Object.freeze([
    { name: "BI_ANALYTICS", cost: 18420, utilization: 38, signal: "Oversized periods / idle runtime" },
    { name: "ELT_BATCH", cost: 11760, utilization: 71, signal: "Repeated high-cost transformation windows" },
    { name: "ADHOC_DEV", cost: 6380, utilization: 22, signal: "Low utilization / long auto-suspend window" }
  ]);

  const findings = Object.freeze([
    {
      title: "Right-size BI_ANALYTICS windows",
      estimate: "$3,880 scenario estimate",
      evidence: "fixture:warehouse-utilization:bi-analytics",
      detail: "Synthetic utilization shows sustained idle capacity during selected periods. Validate query concurrency before any real resize action."
    },
    {
      title: "Review ELT_BATCH transformation overlap",
      estimate: "$2,060 scenario estimate",
      evidence: "fixture:query-window:elt-batch",
      detail: "Synthetic workloads repeat expensive transformation windows. A real system would require query-history evidence before recommending scheduling changes."
    },
    {
      title: "Shorten ADHOC_DEV suspend window",
      estimate: "$1,480 scenario estimate",
      evidence: "fixture:auto-suspend:adhoc-dev",
      detail: "Synthetic utilization is low. This demo does not issue ALTER WAREHOUSE or any provider write."
    }
  ]);

  const baselineEvidence = Object.freeze([
    { key: "research_dossier", label: "Research dossier", status: "passed", ref: "agent-work-os#234" },
    { key: "prd", label: "Product requirements", status: "passed", ref: "snowspend-prd.md" },
    { key: "build", label: "Source-owned build", status: "planned", ref: "company-os static fixture" },
    { key: "tests", label: "Deterministic tests", status: "planned", ref: "CI required" },
    { key: "preview", label: "Preview runtime", status: "unknown", ref: "not deployed" },
    { key: "browser_uat", label: "Browser UAT", status: "unknown", ref: "not observed" },
    { key: "replay", label: "Company-state replay", status: "passed", ref: "Company OS domain CI" }
  ]);

  const workstreamRows = Object.freeze([
    ["Research", "Evidence-backed ICP / competitor dossier", "building"],
    ["Product", "PRD + launch-readiness objective", "building"],
    ["Engineering", "Synthetic SnowSpend artifact", "building"],
    ["Growth", "Launch copy", "draft-only"],
    ["BDR", "Synthetic prospect messages", "draft-only"],
    ["Fundraising", "Synthetic investor dossier", "draft-only"]
  ]);

  const state = {
    blockerActive: false,
    launchDraft: null,
    evidence: baselineEvidence.map((item) => ({ ...item }))
  };

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
  }

  function renderWorkloads() {
    const body = document.querySelector("#workload-body");
    body.innerHTML = workloads.map((row) => `
      <tr>
        <td><strong>${escapeText(row.name)}</strong></td>
        <td>${money.format(row.cost)} <small>synthetic</small></td>
        <td><span class="meter" aria-label="${row.utilization}% synthetic utilization"><span style="width:${row.utilization}%"></span></span>${row.utilization}%</td>
        <td>${escapeText(row.signal)}</td>
      </tr>
    `).join("");
  }

  function renderFindings() {
    const target = document.querySelector("#findings");
    target.innerHTML = findings.map((finding, index) => `
      <section class="finding-card">
        <div class="finding-index">0${index + 1}</div>
        <div>
          <h3>${escapeText(finding.title)}</h3>
          <p>${escapeText(finding.detail)}</p>
          <div class="finding-meta">
            <span>${escapeText(finding.estimate)}</span>
            <code>${escapeText(finding.evidence)}</code>
          </div>
        </div>
      </section>
    `).join("");
  }

  function renderEvidence() {
    const board = document.querySelector("#evidence-board");
    const rows = state.evidence.concat(state.blockerActive ? [{
      key: "provider_blocker",
      label: "Marketing provider approval",
      status: "blocked",
      ref: "synthetic:blocker:provider-approval"
    }] : []);

    board.innerHTML = rows.map((row) => `
      <div class="evidence-row">
        <span class="status-dot ${escapeText(row.status)}" aria-hidden="true"></span>
        <div>
          <strong>${escapeText(row.label)}</strong>
          <small>${escapeText(row.ref)}</small>
        </div>
        <span class="status-label ${escapeText(row.status)}">${escapeText(row.status)}</span>
      </div>
    `).join("");
  }

  function renderWorkstreams() {
    const target = document.querySelector("#workstreams");
    target.innerHTML = workstreamRows.map(([name, output, status]) => `
      <div class="workstream-row">
        <div><strong>${escapeText(name)}</strong><small>${escapeText(output)}</small></div>
        <span class="status-label ${status === "building" ? "planned" : "unknown"}">${escapeText(status)}</span>
      </div>
    `).join("");
  }

  function setActionOutput(title, body, code) {
    const output = document.querySelector("#action-output");
    output.innerHTML = `<strong>${escapeText(title)}</strong><p>${escapeText(body)}</p>${code ? `<code>${escapeText(code)}</code>` : ""}`;
  }

  function generateLaunchDraft() {
    state.launchDraft = "SnowSpend Lab turns synthetic warehouse-cost signals into explainable optimization hypotheses. Phase A uses no customer data and performs no warehouse changes.";
    setActionOutput(
      "Draft created — not published",
      state.launchDraft,
      "effect:create_draft_artifact"
    );
  }

  function toggleBlocker() {
    state.blockerActive = !state.blockerActive;
    renderEvidence();
    if (state.blockerActive) {
      setActionOutput(
        "Synthetic blocker opened",
        "External marketing provider approval is represented as BLOCKED. Company OS must not silently mark the work complete.",
        "category:provider_approval_pending"
      );
    } else {
      setActionOutput(
        "Synthetic blocker resolved",
        "The local demo blocker was cleared. No external provider was contacted.",
        "effect:none"
      );
    }
  }

  function resetDemo() {
    state.blockerActive = false;
    state.launchDraft = null;
    state.evidence = baselineEvidence.map((item) => ({ ...item }));
    renderEvidence();
    setActionOutput("Demo reset", "All in-memory demo state returned to its authored baseline.", "effect:none");
  }

  document.querySelector("#draft-launch").addEventListener("click", generateLaunchDraft);
  document.querySelector("#toggle-blocker").addEventListener("click", toggleBlocker);
  document.querySelector("#reset-demo").addEventListener("click", resetDemo);

  renderWorkloads();
  renderFindings();
  renderEvidence();
  renderWorkstreams();
})();
