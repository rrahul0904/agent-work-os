const $ = id => document.getElementById(id);
const tabs = document.querySelector('.workspace-tabs');
const pricingTitle = [...document.querySelectorAll('.section-title')].find(x => x.textContent.includes('Commercial editions'));

if (tabs && pricingTitle && !document.getElementById('agent-workspace')) {
  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.dataset.tab = 'agent-workspace';
  tab.textContent = 'Agent Console';
  tabs.appendChild(tab);

  const section = document.createElement('section');
  section.id = 'agent-workspace';
  section.className = 'workspace';
  section.innerHTML = `<div class="studio"><div class="panel panel-body"><h2>Agent Console</h2><div class="sub">Execute the governed specialist-agent chain using configured providers. Provider credentials remain server-side.</div><div class="meta-row"><span class="pill" id="agentProviderStatus">Providers: checking…</span><span class="pill" id="agentRunStatus">Run: idle</span></div><div class="field" style="margin-top:14px"><label>Artifact</label><select id="agentArtifact"><option value="architecture-diagram">Architecture diagram</option><option value="technical-diagram">Technical diagram</option><option value="technical-presentation">Technical presentation</option><option value="creative-presentation">Creative presentation</option><option value="creative-ad">Creative ad</option></select></div><div class="field"><label>Plan</label><select id="agentPlan"><option value="community">Community</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></div><div class="field"><label>Objective</label><textarea id="agentObjective">Design a secure enterprise RAG architecture with identity, data boundaries, observability, failure paths and evidence-aware assumptions.</textarea></div><div class="field"><label>Evidence / source reference</label><input id="agentSource" value="approved requirements and architecture standards"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="button" id="runAgents">Run specialist agents</button><button class="button secondary" id="approveAgentStage" disabled>Approve blocked stage</button></div></div><div class="panel panel-body"><h2>Execution receipt</h2><div class="sub">Every completed stage records provider, model, request ID, usage and input/output digests.</div><div class="codebox" id="agentReceipt" style="min-height:480px"></div></div></div>`;
  pricingTitle.before(section);

  let lastBlockedStage = null;
  let lastPayload = null;

  async function refreshProviders() {
    try {
      const response = await fetch('/api/health');
      const health = await response.json();
      const providers = health.configuredProviders || [];
      $('agentProviderStatus').textContent = `Providers: ${providers.length ? providers.join(', ') : 'none configured'}`;
      $('runAgents').disabled = providers.length === 0;
      if (!providers.length) $('agentReceipt').textContent = 'No live provider is configured. Set a supported server-side provider environment (OpenAI, Anthropic, or Gemini) or explicitly enable the deterministic provider for development.';
    } catch (error) {
      $('agentProviderStatus').textContent = 'Providers: health check failed';
      $('runAgents').disabled = true;
    }
  }

  function payload(approvedStages = []) {
    return {
      input: {
        artifactType: $('agentArtifact').value,
        objective: $('agentObjective').value,
        audience: 'professional visual artifact users',
        source: $('agentSource').value,
        plan: $('agentPlan').value
      },
      approvedStages
    };
  }

  async function execute(approvedStages = []) {
    lastPayload = payload(approvedStages);
    $('agentRunStatus').textContent = 'Run: executing';
    $('runAgents').disabled = true;
    $('approveAgentStage').disabled = true;
    try {
      const response = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(lastPayload)
      });
      const result = await response.json();
      if (!response.ok && response.status !== 202) throw new Error(result.error || 'agent_execution_failed');
      $('agentReceipt').textContent = JSON.stringify(result, null, 2);
      $('agentRunStatus').textContent = `Run: ${result.status}`;
      lastBlockedStage = result.status === 'approval_required' ? result.blockedStage : null;
      $('approveAgentStage').disabled = !lastBlockedStage;
    } catch (error) {
      $('agentRunStatus').textContent = 'Run: failed';
      $('agentReceipt').textContent = `Agent execution error: ${error.message}`;
      lastBlockedStage = null;
    } finally {
      $('runAgents').disabled = false;
    }
  }

  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.workspace').forEach(x => x.classList.remove('active'));
    tab.classList.add('active');
    section.classList.add('active');
    refreshProviders();
  });
  $('runAgents').addEventListener('click', () => execute());
  $('approveAgentStage').addEventListener('click', () => {
    if (lastBlockedStage) execute([lastBlockedStage]);
  });
  refreshProviders();
}
