import { createHash, randomUUID } from "node:crypto";

export const CAPABILITY_KINDS = Object.freeze(["skill", "agent", "workflow", "command", "hook", "mcp"]);

const KIND_SET = new Set(CAPABILITY_KINDS);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_RE = /^[0-9a-f]{7,64}$/i;

export class CapabilityValidationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "CapabilityValidationError";
    this.code = code;
    this.statusCode = 400;
  }
}

export const HARNESS_PROFILES = Object.freeze({
  "claude-code": Object.freeze({
    id: "claude-code",
    displayName: "Claude Code",
    skillsNative: true,
    agentsNative: true,
    commandsNative: true,
    marketplace: true,
    hooks: true,
    mcp: true,
    parallelAgents: true,
    toolAllowlist: "native",
    skillBodyMaxBytes: 0,
    paths: Object.freeze({ skill: "skills", agent: "agents", command: "commands" })
  }),
  codex: Object.freeze({
    id: "codex",
    displayName: "OpenAI Codex CLI",
    skillsNative: true,
    agentsNative: true,
    commandsNative: false,
    marketplace: true,
    hooks: false,
    mcp: true,
    parallelAgents: true,
    toolAllowlist: "sandbox",
    skillBodyMaxBytes: 8 * 1024,
    paths: Object.freeze({ skill: "skills", agent: "agents", command: "skills" })
  }),
  cursor: Object.freeze({
    id: "cursor",
    displayName: "Cursor",
    skillsNative: true,
    agentsNative: true,
    commandsNative: true,
    marketplace: true,
    hooks: false,
    mcp: true,
    parallelAgents: true,
    toolAllowlist: "readonly-only",
    skillBodyMaxBytes: 0,
    paths: Object.freeze({ skill: "skills", agent: "agents", command: "commands" })
  }),
  opencode: Object.freeze({
    id: "opencode",
    displayName: "OpenCode",
    skillsNative: true,
    agentsNative: true,
    commandsNative: true,
    marketplace: false,
    hooks: true,
    mcp: true,
    parallelAgents: true,
    toolAllowlist: "native",
    skillBodyMaxBytes: 0,
    paths: Object.freeze({ skill: "skills", agent: "agents", command: "commands" })
  }),
  antigravity: Object.freeze({
    id: "antigravity",
    displayName: "Google Antigravity CLI",
    skillsNative: true,
    agentsNative: true,
    commandsNative: true,
    marketplace: true,
    hooks: true,
    mcp: true,
    parallelAgents: true,
    toolAllowlist: "native",
    skillBodyMaxBytes: 0,
    paths: Object.freeze({ skill: "skills", agent: "agents", command: "commands" })
  }),
  copilot: Object.freeze({
    id: "copilot",
    displayName: "GitHub Copilot",
    skillsNative: true,
    agentsNative: true,
    commandsNative: false,
    marketplace: false,
    hooks: false,
    mcp: true,
    parallelAgents: false,
    toolAllowlist: "native",
    skillBodyMaxBytes: 0,
    paths: Object.freeze({ skill: "skills", agent: "agents", command: "skills" })
  }),
  pi: Object.freeze({
    id: "pi",
    displayName: "Pi",
    skillsNative: true,
    agentsNative: false,
    commandsNative: true,
    marketplace: false,
    hooks: true,
    mcp: false,
    parallelAgents: true,
    toolAllowlist: "extension",
    skillBodyMaxBytes: 0,
    paths: Object.freeze({ skill: "skills", agent: "agents", command: "prompts" })
  })
});

export function createCapabilitySpec(input, { now = () => new Date().toISOString(), idFactory = () => `capability_${randomUUID()}` } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CapabilityValidationError("capability_invalid");
  const kind = requireEnum(input.kind, CAPABILITY_KINDS, "capability_kind_invalid");
  const version = requireSemver(input.version ?? "0.1.0");
  const metadataInput = requireObject(input.metadata, "capability_metadata_invalid");
  const name = requireText(metadataInput.name, "capability_name_invalid", 160);
  const slug = requireSlug(metadataInput.slug ?? slugify(name));
  const description = optionalText(metadataInput.description, 2_000) ?? "";
  const provenanceInput = requireObject(input.provenance, "capability_provenance_invalid");
  const sourceUrl = requireHttpUrl(provenanceInput.sourceUrl);
  const sourceCommit = requireSha(provenanceInput.sourceCommit);
  const sourceLicense = requireText(provenanceInput.sourceLicense, "capability_source_license_invalid", 120);
  const createdAt = input.createdAt ?? now();
  if (!Number.isFinite(Date.parse(createdAt))) throw new CapabilityValidationError("capability_timestamp_invalid");
  const spec = {
    schemaVersion: "1",
    id: input.id ?? idFactory(),
    version,
    kind,
    metadata: {
      name,
      slug,
      description,
      triggers: textList(metadataInput.triggers, 50, 400),
      tags: textList(metadataInput.tags, 50, 120)
    },
    contract: normalizeContract(input.contract),
    execution: normalizeExecution(input.execution),
    requirements: normalizeRequirements(input.requirements),
    provenance: {
      sourceUrl,
      sourceCommit,
      sourceLicense,
      sourcePath: optionalText(provenanceInput.sourcePath, 1_000) ?? null,
      importedBy: optionalText(provenanceInput.importedBy, 200) ?? "rea",
      evidence: normalizeEvidence(provenanceInput.evidence)
    },
    evaluation: normalizeEvaluation(input.evaluation),
    createdAt
  };
  return assertCapabilitySpec(spec);
}

export function assertCapabilitySpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new CapabilityValidationError("capability_invalid");
  if (spec.schemaVersion !== "1") throw new CapabilityValidationError("capability_schema_version_invalid");
  if (typeof spec.id !== "string" || !/^capability_[0-9a-f-]{36}$/i.test(spec.id)) throw new CapabilityValidationError("capability_id_invalid");
  requireSemver(spec.version);
  requireEnum(spec.kind, CAPABILITY_KINDS, "capability_kind_invalid");
  requireObject(spec.metadata, "capability_metadata_invalid"); requireText(spec.metadata.name, "capability_name_invalid", 160); requireSlug(spec.metadata.slug);
  requireObject(spec.contract, "capability_contract_invalid"); requireObject(spec.execution, "capability_execution_invalid"); requireObject(spec.requirements, "capability_requirements_invalid");
  requireObject(spec.provenance, "capability_provenance_invalid"); requireHttpUrl(spec.provenance.sourceUrl); requireSha(spec.provenance.sourceCommit); requireText(spec.provenance.sourceLicense, "capability_source_license_invalid", 120);
  requireObject(spec.evaluation, "capability_evaluation_invalid");
  if (!Number.isFinite(Date.parse(spec.createdAt))) throw new CapabilityValidationError("capability_timestamp_invalid");
  return spec;
}

export function importReaCapability(evidence, options = {}) {
  const record = requireObject(evidence, "rea_evidence_invalid");
  return createCapabilitySpec({
    id: record.id,
    version: record.version ?? "0.1.0",
    kind: record.kind ?? "skill",
    metadata: {
      name: record.name,
      slug: record.slug,
      description: record.description,
      triggers: record.triggers,
      tags: [...(record.tags ?? []), "rea-import"]
    },
    contract: record.contract,
    execution: { instructions: record.instructions ?? record.body, references: record.references, assets: record.assets },
    requirements: record.requirements,
    provenance: {
      sourceUrl: record.sourceUrl,
      sourceCommit: record.sourceCommit,
      sourceLicense: record.sourceLicense,
      sourcePath: record.sourcePath,
      importedBy: "rea",
      evidence: record.evidence
    },
    evaluation: record.evaluation,
    createdAt: record.createdAt
  }, options);
}

export function compileCapability(specInput, harnessId, { allowDegraded = false } = {}) {
  const spec = assertCapabilitySpec(specInput);
  const profile = HARNESS_PROFILES[harnessId];
  if (!profile) throw new CapabilityValidationError("harness_profile_unknown");
  const warnings = [];
  const degraded = [];
  const files = [];
  const native = supportsKind(profile, spec.kind);
  let emittedKind = spec.kind;
  if (!native) {
    if (spec.kind === "command" && profile.skillsNative) { emittedKind = "skill"; warnings.push("command_compiled_as_skill"); }
    else if (spec.kind === "workflow" && profile.commandsNative) { emittedKind = "command"; warnings.push("workflow_compiled_as_command"); }
    else if (spec.kind === "workflow" && profile.skillsNative) { emittedKind = "skill"; warnings.push("workflow_compiled_as_skill"); }
    else {
      degraded.push(`${spec.kind}_not_native`);
      if (!allowDegraded) throw new CapabilityValidationError("harness_capability_unsupported", `${profile.displayName} does not natively support ${spec.kind}`);
      emittedKind = "documentation";
    }
  }
  if (spec.requirements.hooks && !profile.hooks) degraded.push("hooks_unavailable");
  if (spec.requirements.mcpServers.length && !profile.mcp) degraded.push("mcp_unavailable");
  if (spec.requirements.parallelAgents && !profile.parallelAgents) degraded.push("parallel_agents_unavailable");
  if (degraded.length && !allowDegraded) throw new CapabilityValidationError("harness_requirements_unsupported", degraded.join(", "));

  const body = renderPortableBody(spec, profile, { emittedKind, warnings, degraded });
  if (emittedKind === "documentation") {
    files.push({ path: `docs/${spec.metadata.slug}.md`, content: body });
  } else {
    const root = emittedKind === "skill" ? profile.paths.skill : emittedKind === "agent" ? profile.paths.agent : profile.paths.command;
    const ext = emittedKind === "skill" ? "/SKILL.md" : ".md";
    let content = body;
    if (emittedKind === "skill" && profile.skillBodyMaxBytes && Buffer.byteLength(content) > profile.skillBodyMaxBytes) {
      const summary = renderSkillSummary(spec, profile);
      const details = renderDetailBody(spec);
      files.push({ path: `${root}/${spec.metadata.slug}${ext}`, content: summary });
      files.push({ path: `${root}/${spec.metadata.slug}/references/details.md`, content: details });
      warnings.push("skill_body_split_for_harness_limit");
    } else files.push({ path: `${root}/${spec.metadata.slug}${ext}`, content });
  }
  const manifest = {
    capabilityId: spec.id,
    capabilityVersion: spec.version,
    harnessId: profile.id,
    harnessProfileDigest: digest(profile),
    sourceCommit: spec.provenance.sourceCommit,
    sourceLicense: spec.provenance.sourceLicense,
    warnings: [...warnings],
    degraded: [...degraded],
    files: files.map((file) => ({ path: file.path, digest: digest(file.content), bytes: Buffer.byteLength(file.content) }))
  };
  const receipt = {
    type: "capability-compilation",
    capabilityId: spec.id,
    capabilityDigest: digest(spec),
    harnessId: profile.id,
    harnessProfileDigest: manifest.harnessProfileDigest,
    source: { url: spec.provenance.sourceUrl, commit: spec.provenance.sourceCommit, license: spec.provenance.sourceLicense },
    manifestDigest: digest(manifest),
    warnings: [...warnings], degraded: [...degraded]
  };
  receipt.receiptDigest = digest(receipt);
  return Object.freeze({ manifest: Object.freeze(manifest), files: Object.freeze(files), receipt: Object.freeze(receipt) });
}

export class CapabilityRegistry {
  #versions = new Map();
  add(specInput) {
    const spec = structuredClone(assertCapabilitySpec(specInput));
    const byVersion = this.#versions.get(spec.metadata.slug) ?? new Map();
    const current = byVersion.get(spec.version);
    if (current && digest(current) !== digest(spec)) throw new CapabilityValidationError("capability_version_conflict");
    byVersion.set(spec.version, spec); this.#versions.set(spec.metadata.slug, byVersion); return structuredClone(spec);
  }
  get(slug, version = null) {
    const byVersion = this.#versions.get(slug); if (!byVersion) return null;
    if (version) return byVersion.has(version) ? structuredClone(byVersion.get(version)) : null;
    const latest = [...byVersion.keys()].sort(compareSemver).at(-1); return latest ? structuredClone(byVersion.get(latest)) : null;
  }
  list({ kind, tag, sourceUrl } = {}) {
    return [...this.#versions.values()].flatMap((versions) => [...versions.values()]).filter((spec) =>
      (!kind || spec.kind === kind) && (!tag || spec.metadata.tags.includes(tag)) && (!sourceUrl || spec.provenance.sourceUrl === sourceUrl)
    ).map(structuredClone);
  }
}

export function createDriftRecord({ previous, current, detectedAt = new Date().toISOString() }) {
  assertCapabilitySpec(previous); assertCapabilitySpec(current);
  if (previous.metadata.slug !== current.metadata.slug) throw new CapabilityValidationError("capability_drift_slug_mismatch");
  const changes = [];
  if (previous.provenance.sourceCommit !== current.provenance.sourceCommit) changes.push("source_commit");
  if (digest(previous.execution) !== digest(current.execution)) changes.push("execution");
  if (digest(previous.requirements) !== digest(current.requirements)) changes.push("requirements");
  if (digest(previous.contract) !== digest(current.contract)) changes.push("contract");
  return Object.freeze({
    capabilitySlug: previous.metadata.slug,
    previousVersion: previous.version,
    currentVersion: current.version,
    previousSourceCommit: previous.provenance.sourceCommit,
    currentSourceCommit: current.provenance.sourceCommit,
    changes,
    drifted: changes.length > 0,
    detectedAt,
    recordDigest: digest({ previous: digest(previous), current: digest(current), changes, detectedAt })
  });
}

function normalizeContract(value = {}) {
  const input = requireObject(value ?? {}, "capability_contract_invalid");
  return { inputs: objectList(input.inputs, 100), outputs: objectList(input.outputs, 100), prerequisites: textList(input.prerequisites, 100, 400) };
}
function normalizeExecution(value = {}) {
  const input = requireObject(value ?? {}, "capability_execution_invalid");
  return { instructions: requireText(input.instructions ?? "Follow the capability instructions.", "capability_instructions_invalid", 200_000), references: normalizeNamedContent(input.references, 200), assets: normalizeNamedContent(input.assets, 200) };
}
function normalizeRequirements(value = {}) {
  const input = requireObject(value ?? {}, "capability_requirements_invalid");
  const networkPolicy = input.networkPolicy ?? "deny";
  if (!['deny', 'read-only', 'allowed'].includes(networkPolicy)) throw new CapabilityValidationError("capability_network_policy_invalid");
  return {
    tools: textList(input.tools, 100, 200), permissions: textList(input.permissions, 100, 200), models: textList(input.models, 50, 200),
    contextBudgetBytes: integerOr(input.contextBudgetBytes, 0), networkPolicy, hooks: Boolean(input.hooks), parallelAgents: Boolean(input.parallelAgents),
    mcpServers: textList(input.mcpServers, 50, 500)
  };
}
function normalizeEvaluation(value = {}) {
  const input = requireObject(value ?? {}, "capability_evaluation_invalid");
  const threshold = input.qualityThreshold ?? 0.8;
  if (typeof threshold !== "number" || threshold < 0 || threshold > 1) throw new CapabilityValidationError("capability_quality_threshold_invalid");
  return { testCases: objectList(input.testCases, 200).map((test, i) => ({ id: optionalText(test.id, 200) ?? `case-${i + 1}`, input: requireText(test.input, "capability_test_input_invalid", 20_000), expected: optionalText(test.expected, 20_000) ?? "" })), qualityThreshold: threshold };
}
function normalizeEvidence(value) {
  if (!value) return [];
  if (!Array.isArray(value)) throw new CapabilityValidationError("capability_evidence_invalid");
  return value.slice(0, 200).map((entry) => {
    const item = requireObject(entry, "capability_evidence_invalid");
    return { type: requireText(item.type ?? "public", "capability_evidence_type_invalid", 100), ref: requireText(item.ref, "capability_evidence_ref_invalid", 2_000), digest: optionalText(item.digest, 200) ?? null };
  });
}
function normalizeNamedContent(value, max) {
  if (!value) return [];
  if (!Array.isArray(value) || value.length > max) throw new CapabilityValidationError("capability_named_content_invalid");
  return value.map((entry) => { const item = requireObject(entry, "capability_named_content_invalid"); return { name: requireText(item.name, "capability_content_name_invalid", 500), content: requireText(item.content, "capability_content_invalid", 200_000, true) }; });
}
function renderPortableBody(spec, profile, state) {
  const frontmatter = [`---`, `name: ${spec.metadata.slug}`, `description: ${yamlScalar(spec.metadata.description || spec.metadata.name)}`];
  if (state.emittedKind === "agent") frontmatter.push(`model: inherit`);
  frontmatter.push(`---`, "");
  return `${frontmatter.join("\n")}# ${spec.metadata.name}\n\n${spec.execution.instructions}\n\n## Contract\n\nInputs: ${JSON.stringify(spec.contract.inputs)}\n\nOutputs: ${JSON.stringify(spec.contract.outputs)}\n\nPrerequisites: ${spec.contract.prerequisites.join(", ") || "none"}\n\n## Requirements\n\nTools: ${spec.requirements.tools.join(", ") || "none"}\n\nNetwork: ${spec.requirements.networkPolicy}\n\nHarness: ${profile.displayName}\n`;
}
function renderSkillSummary(spec, profile) {
  return `---\nname: ${spec.metadata.slug}\ndescription: ${yamlScalar(spec.metadata.description || spec.metadata.name)}\n---\n# ${spec.metadata.name}\n\n${spec.execution.instructions.slice(0, 3500)}\n\nFull detail: [references/details.md](references/details.md)\n\nHarness: ${profile.displayName}\n`;
}
function renderDetailBody(spec) {
  return `# ${spec.metadata.name} — Details\n\n${spec.execution.instructions}\n\n## References\n\n${spec.execution.references.map((x) => `### ${x.name}\n\n${x.content}`).join("\n\n") || "None"}\n`;
}
function supportsKind(profile, kind) {
  if (kind === "skill") return profile.skillsNative; if (kind === "agent") return profile.agentsNative; if (kind === "command") return profile.commandsNative; if (kind === "hook") return profile.hooks; if (kind === "mcp") return profile.mcp; if (kind === "workflow") return profile.commandsNative || profile.skillsNative; return false;
}
function digest(value) { return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(sortValue(value))).digest("hex")}`; }
function sortValue(value) { if (Array.isArray(value)) return value.map(sortValue); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])])); }
function requireObject(value, code) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new CapabilityValidationError(code); return value; }
function requireText(value, code, max, allowEmpty = false) { if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > max) throw new CapabilityValidationError(code); return value; }
function optionalText(value, max) { if (value === undefined || value === null) return null; if (typeof value !== "string" || value.length > max) throw new CapabilityValidationError("capability_text_invalid"); return value; }
function requireSlug(value) { if (typeof value !== "string" || !SLUG_RE.test(value) || value.length > 100) throw new CapabilityValidationError("capability_slug_invalid"); return value; }
function requireSemver(value) { if (typeof value !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) throw new CapabilityValidationError("capability_version_invalid"); return value; }
function requireSha(value) { if (typeof value !== "string" || !SHA_RE.test(value)) throw new CapabilityValidationError("capability_source_commit_invalid"); return value.toLowerCase(); }
function requireHttpUrl(value) { try { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); return url.toString(); } catch { throw new CapabilityValidationError("capability_source_url_invalid"); } }
function requireEnum(value, allowed, code) { if (!allowed.includes(value)) throw new CapabilityValidationError(code); return value; }
function textList(value, maxItems, maxLength) { if (value === undefined || value === null) return []; if (!Array.isArray(value) || value.length > maxItems || value.some((x) => typeof x !== "string" || x.length > maxLength)) throw new CapabilityValidationError("capability_text_list_invalid"); return [...value]; }
function objectList(value, maxItems) { if (value === undefined || value === null) return []; if (!Array.isArray(value) || value.length > maxItems || value.some((x) => !x || typeof x !== "object" || Array.isArray(x))) throw new CapabilityValidationError("capability_object_list_invalid"); return value.map((x) => structuredClone(x)); }
function integerOr(value, fallback) { if (value === undefined || value === null) return fallback; if (!Number.isSafeInteger(value) || value < 0) throw new CapabilityValidationError("capability_integer_invalid"); return value; }
function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "capability"; }
function yamlScalar(value) { return JSON.stringify(value ?? ""); }
function compareSemver(a, b) { const pa = a.split(/[-.]/).slice(0, 3).map(Number); const pb = b.split(/[-.]/).slice(0, 3).map(Number); return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2] || a.localeCompare(b); }
