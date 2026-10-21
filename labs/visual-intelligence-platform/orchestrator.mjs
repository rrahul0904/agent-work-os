import { ARTIFACTS, compilePromptSpec } from './prompt-core.mjs';
import { requireCapability } from './entitlements.mjs';

const WRITE_STAGES = new Set(['artifact-renderer', 'pptx-renderer', 'creative-renderer']);

export function createRunPlan(input = {}) {
  const promptSpec = compilePromptSpec(input);
  const plan = String(input.plan || 'community').toLowerCase();

  if (promptSpec.exports.includes('pptx') && promptSpec.editability === 'native editable PPTX') {
    requireCapability(plan, 'nativeEditablePptx');
  }

  const stages = promptSpec.agentChain.map((agent, index) => Object.freeze({
    index,
    agent,
    mode: WRITE_STAGES.has(agent) ? 'artifact-write' : 'analysis',
    requiresEvidence: ['research-grounding', 'architecture-critic', 'technical-critic'].includes(agent),
    approvalRequired: plan === 'enterprise' && WRITE_STAGES.has(agent)
  }));

  return Object.freeze({
    runPlanVersion: 'visual-agent-run/v1alpha1',
    artifactType: promptSpec.artifactType,
    artifactLabel: ARTIFACTS[promptSpec.artifactType].label,
    plan,
    promptSpec,
    stages,
    providerPolicy: Object.freeze({
      selection: 'provider-neutral',
      allowFallback: true,
      persistSecrets: false,
      requireReceipt: true
    }),
    completionGate: Object.freeze([
      'semantic-spec-valid',
      'mechanical-qa-pass',
      'fresh-eyes-review-pass',
      'render-receipt-present'
    ])
  });
}
