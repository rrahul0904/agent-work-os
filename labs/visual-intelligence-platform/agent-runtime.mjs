import crypto from 'node:crypto';
import { createRunPlan } from './orchestrator.mjs';

const STAGE_INSTRUCTIONS = Object.freeze({
  'intent-router': 'Classify the request, preserve user intent, and identify the target visual artifact. Do not invent requirements.',
  'requirements-planner': 'Extract explicit requirements, constraints, assumptions, risks, and unresolved questions. Separate observed facts from inference.',
  'research-grounding': 'Ground the artifact plan in supplied evidence. Cite source identifiers in structured evidenceRefs. Mark unsupported statements as assumptions.',
  'architecture-critic': 'Review architecture semantics, boundaries, failure modes, security, operability, abstraction level, and technology justification. Return actionable findings.',
  'technical-critic': 'Review technical correctness, missing dependencies, ambiguous relationships, and visual semantics. Return actionable findings.',
  'creative-brief-agent': 'Convert the objective into audience, message hierarchy, campaign intent, format constraints, and brand-safe creative direction.',
  'copy-agent': 'Create concise, audience-appropriate copy. Preserve factual claims and avoid unsupported superlatives.',
  'narrative-agent': 'Create a clear story arc, section sequence, and message hierarchy appropriate for the target audience.',
  'art-director': 'Define visual hierarchy, layout intent, imagery direction, typography roles, and reusable brand constraints.',
  'diagram-spec-compiler': 'Produce a semantic diagram plan with nodes, edges, boundaries, labels, protocols, evidenceRefs, and assumptions. Do not render pixels.',
  'deck-plan-compiler': 'Produce a semantic deck plan with slide titles, purpose, message, content objects, evidenceRefs, and editability requirements.',
  'semantic-spec-compiler': 'Compile a semantic artifact specification suitable for deterministic rendering and editing.',
  'layout-designer': 'Translate the semantic plan into layout constraints, hierarchy, spacing, alignment, grouping, and accessibility requirements.',
  'artifact-renderer': 'Prepare renderer-ready structured output without discarding semantic IDs or provenance.',
  'pptx-renderer': 'Prepare native-PowerPoint renderer instructions. Text, shapes, charts, tables, and connectors must remain editable.',
  'creative-renderer': 'Prepare layered creative-renderer instructions with named editable layers and adaptive artboard behavior.',
  'mechanical-qa': 'Check schema validity, clipping/overflow risk, missing labels, accessibility, editability, source receipts, and export readiness.',
  'brand-reviewer': 'Check brand constraints, hierarchy, contrast, legibility, and campaign consistency. Return pass/fail findings.',
  'fresh-eyes-reviewer': 'Review the artifact as an independent first-time viewer. Identify confusing hierarchy, missing context, misleading visuals, or unresolved defects.'
});

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class AgentRuntimeError extends Error {
  constructor(code, details = null) {
    super(code);
    this.name = 'AgentRuntimeError';
    this.code = code;
    this.details = details;
  }
}

export class ProviderRegistry {
  constructor() { this.providers = new Map(); }
  register(name, provider) {
    if (!name || !provider || typeof provider.generate !== 'function') throw new AgentRuntimeError('provider_invalid');
    this.providers.set(name, provider);
    return this;
  }
  has(name) { return this.providers.has(name); }
  get(name) { return this.providers.get(name); }
  names() { return [...this.providers.keys()]; }
}

export class DeterministicTestProvider {
  constructor({ name = 'deterministic-test' } = {}) { this.name = name; }
  async generate(request) {
    const stage = request.stage;
    const prior = request.context?.stageOutputs ?? [];
    return {
      provider: this.name,
      model: 'deterministic-v1',
      content: {
        stage,
        summary: `Completed ${stage} for ${request.promptSpec.artifactType}.`,
        evidenceRefs: request.promptSpec.inputs ?? [],
        assumptions: [],
        findings: stage.includes('critic') || stage.includes('review') || stage.includes('qa') ? [] : undefined,
        priorStageCount: prior.length,
        objective: request.promptSpec.objective
      },
      usage: { inputTokens: 0, outputTokens: 0 },
      requestId: `det-${hash({ stage, objective: request.promptSpec.objective }).slice(0, 16)}`
    };
  }
}

function stagePrompt(stage, runPlan, context) {
  return {
    role: stage,
    instruction: STAGE_INSTRUCTIONS[stage] || `Execute the ${stage} stage while preserving semantic structure, evidence and editability.`,
    artifactType: runPlan.artifactType,
    objective: runPlan.promptSpec.objective,
    audience: runPlan.promptSpec.audience,
    constraints: runPlan.promptSpec.constraints,
    brand: runPlan.promptSpec.brand,
    editability: runPlan.promptSpec.editability,
    exports: runPlan.promptSpec.exports,
    evidencePolicy: 'Do not invent evidence. Keep observed facts, inference, and recommendations distinct.',
    priorOutputs: context.stageOutputs.map(output => ({ stage: output.stage, content: output.content }))
  };
}

function normalizeProviderOrder(policy = {}, registry) {
  const explicit = Array.isArray(policy.providers) ? policy.providers.filter(name => registry.has(name)) : [];
  const rest = registry.names().filter(name => !explicit.includes(name));
  const order = [...explicit, ...rest];
  if (!order.length) throw new AgentRuntimeError('provider_unavailable');
  return order;
}

async function executeWithFallback({ registry, providerOrder, allowFallback, request }) {
  const attempts = [];
  const candidates = allowFallback ? providerOrder : providerOrder.slice(0, 1);
  for (const name of candidates) {
    const provider = registry.get(name);
    try {
      const startedAt = new Date().toISOString();
      const result = await provider.generate(request);
      const completedAt = new Date().toISOString();
      return {
        result,
        receipt: {
          provider: name,
          model: result?.model ?? null,
          requestId: result?.requestId ?? null,
          startedAt,
          completedAt,
          inputDigest: `sha256:${hash(request)}`,
          outputDigest: `sha256:${hash(result)}`,
          usage: result?.usage ?? null,
          fallbackAttempts: attempts
        }
      };
    } catch (error) {
      attempts.push({ provider: name, error: error?.code || error?.message || 'provider_failed' });
    }
  }
  throw new AgentRuntimeError('all_providers_failed', { attempts });
}

export async function executeAgentRun(input = {}, options = {}) {
  const runPlan = input.runPlan ?? createRunPlan(input);
  const registry = options.registry;
  if (!(registry instanceof ProviderRegistry)) throw new AgentRuntimeError('provider_registry_required');
  const providerOrder = normalizeProviderOrder(options.providerPolicy, registry);
  const allowFallback = options.providerPolicy?.allowFallback ?? runPlan.providerPolicy.allowFallback;
  const approvedStages = new Set(options.approvedStages ?? []);
  const context = { stageOutputs: [], receipts: [] };
  const startedAt = new Date().toISOString();

  for (const stage of runPlan.stages) {
    if (stage.approvalRequired && !approvedStages.has(stage.agent)) {
      return Object.freeze({
        runVersion: 'visual-agent-execution/v1alpha1',
        status: 'approval_required',
        runPlan,
        blockedStage: stage.agent,
        stageOutputs: Object.freeze(context.stageOutputs),
        receipts: Object.freeze(context.receipts),
        startedAt,
        completedAt: new Date().toISOString()
      });
    }

    const request = {
      stage: stage.agent,
      promptSpec: runPlan.promptSpec,
      prompt: stagePrompt(stage.agent, runPlan, context),
      context: { stageOutputs: context.stageOutputs },
      requirements: {
        requiresEvidence: stage.requiresEvidence,
        mode: stage.mode,
        receiptRequired: true
      }
    };
    const executed = await executeWithFallback({ registry, providerOrder, allowFallback, request });
    context.stageOutputs.push(Object.freeze({
      stage: stage.agent,
      mode: stage.mode,
      content: executed.result.content,
      provider: executed.receipt.provider,
      model: executed.receipt.model
    }));
    context.receipts.push(Object.freeze({ stage: stage.agent, ...executed.receipt }));
  }

  return Object.freeze({
    runVersion: 'visual-agent-execution/v1alpha1',
    status: 'complete',
    runPlan,
    stageOutputs: Object.freeze(context.stageOutputs),
    receipts: Object.freeze(context.receipts),
    startedAt,
    completedAt: new Date().toISOString(),
    executionDigest: `sha256:${hash({ runPlan, outputs: context.stageOutputs, receipts: context.receipts })}`
  });
}

export const specialistStageInstructions = STAGE_INSTRUCTIONS;
