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
    toolAllowlist: "readonly",
    skillBodyMaxBytes: 0,
    paths: Object.freeze({ skill: ".cursor/skills", agent: ".cursor/agents", command: ".cursor/commands" })
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
    toolAllowlist: "permission-block",
    skillBodyMaxBytes: 0,
    paths: Object.freeze({ skill: ".opencode/skills", agent: ".opencode/agents", command: ".opencode/commands" })
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
    paths: Object.freeze({ skill: ".copilot/skills", agent: ".copilot/agents", command: ".copilot/skills" })
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
    paths: Object.freeze({ skill: ".pi/skills", agent: ".pi/agents", command: ".pi/prompts" })
  })
});

export function assertHarnessProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new CapabilityValidationError("harness_profile_invalid");
  }
  requireSlug(profile.id, "harness_profile_id_invalid");
  requireText(profile.displayName, "harness_profile_display_name_invalid", 120);
  for (const key of ["skillsNative", "agentsNative", "commandsNative", "marketplace", "hooks", "mcp", "parallelAgents"]) {
    if (typeof profile[key] !== "boolean") throw new CapabilityValidationError(`harness_profile_${key}_invalid`);
  }
  if (!Number.isSafeInteger(profile.skillBodyMaxBytes) || profile.skillBodyMaxBytes < 0) {
    throw new CapabilityValidationError("harness_profile_skill_body_limit_invalid");
  }
  if (!profile.paths || typeof profile.paths !== "object") throw new CapabilityValidationError("harness_profile_paths_invalid");
  return profile;
}

export function createCapabilitySpec(input, { now = () => new Date().toISOString(), uuid = randomUUID } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CapabilityValidationError("capability_invalid");
  const kind = input.kind;
  if (!KIND_SET.has(kind)) throw new CapabilityValidationError("capability_kind_invalid");

  const name = requireText(input.metadata?.name, "capability_name_invalid", 120).trim();
  const slug = input.metadata?.slug ?? slugify(name);
  requireSlug(slug, "capability_slug_invalid");
  const version = input.version ?? "0.1.0";
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new CapabilityValidationError("capability_version_invalid");
  }

  const createdAt = input.createdAt ?? now();
  if (!Number.isFinite(Date.parse(createdAt))) throw new CapabilityValidationError("capability_created_at_invalid");

  const instructions = requireText(input.execution?.instructions, "capability_instructions_invalid", 500_000, true);
  const sourceUrl = requireText(input.provenance?.sourceUrl, "capability_source_url_invalid", 2_000);
  const sourceCommit = requireText(input.provenance?.sourceCommit, "capability_source_commit_invalid", 128);
  if (!SHA_RE.test(sourceCommit) && !/^local:[A-Za-z0-9._/-]+$/.test(sourceCommit)) {
    throw new CapabilityValidationError("capability_source_commit_invalid");
  }
  const sourceLicense = requireText(input.provenance?.sourceLicense, "capability_source_license_invalid", 120);

  const spec = {
    id: input.id ?? `capability_${uuid()}`,
    schemaVersion: "1",
    version,
    kind,
    createdAt,
    metadata: {
      name,
      slug,
      description: optionalText(input.metadata?.description, 2_000),
      triggers: uniqueStrings(input.metadata?.triggers),
      tags: uniqueStrings(input.metadata?.tags)
    },
    contract: {
      inputs: normalizeContractEntries(input.contract?.inputs),
      outputs: normalizeContractEntries(input.contract?.outputs),
      prerequisites: uniqueStrings(input.contract?.prerequisites)
    },
    execution: {
      instructions,
      references: normalizeNamedTextEntries(input.execution?.references),
      assets: normalizeNamedTextEntries(input.execution?.assets)
    },
    requirements: {
      tools: uniqueStrings(input.requirements?.tools),
      permissions: uniqueStrings(input.requirements?.permissions),
      models: uniqueStrings(input.requirements?.models),
      contextBudget: normalizeNonNegativeInteger(input.requirements?.contextBudget),
      networkPolicy: input.requirements?.networkPolicy ?? "deny-by-default"
    },
    provenance: {
      sourceUrl,
      sourceCommit: sourceCommit.toLowerCase(),
      sourceLicense,
      sourcePath: optionalText(input.provenance?.sourcePath, 2_000),
      evidence: uniqueStrings(input.provenance?.evidence)
    },
    evaluation: {
      testCases: normalizeTestCases(input.evaluation?.testCases),
      qualityThreshold: normalizeThreshold(input.evaluation?.qualityThreshold ?? 0.8)
    }
  };

  assertCapabilitySpec(spec);
  return Object.freeze(spec);
}

export function assertCapabilitySpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new CapabilityValidationError("capability_invalid");
  if (!/^capability_[0-9a-f-]{36}$/i.test(spec.id)) throw new CapabilityValidationError("capability_id_invalid");
  if (spec.schemaVersion !== "1") throw new CapabilityValidationError("capability_schema_version_invalid");
  if (!KIND_SET.has(spec.kind)) throw new CapabilityValidationError("capability_kind_invalid");
  requireText(spec.metadata?.name, "capability_name_invalid", 120);
  requireSlug(spec.metadata?.slug, "capability_slug_invalid");
  requireText(spec.execution?.instructions, "capability_instructions_invalid", 500_000, true);
  requireText(spec.provenance?.sourceUrl, "capability_source_url_invalid", 2_000);
  requireText(spec.provenance?.sourceCommit, "capability_source_commit_invalid", 128);
  requireText(spec.provenance?.sourceLicense, "capability_source_license_invalid", 120);
  return spec;
}

export function importReaCapability(evidence, overrides = {}) {
  if (!evidence || typeof evidence !== "object") throw new CapabilityValidationError("rea_evidence_invalid");
  const capability = evidence.capability ?? {};
  return createCapabilitySpec({
    ...capability,
    ...overrides,
    metadata: { ...capability.metadata, ...overrides.metadata },
    contract: { ...capability.contract, ...overrides.contract },
    execution: { ...capability.execution, ...overrides.execution },
    requirements: { ...capability.requirements, ...overrides.requirements },
    evaluation: { ...capability.evaluation, ...overrides.evaluation },
    provenance: {
      sourceUrl: evidence.sourceUrl,
      sourceCommit: evidence.sourceCommit,
      sourceLicense: evidence.sourceLicense,
      sourcePath: evidence.sourcePath ?? "",
      evidence: evidence.evidence ?? [],
      ...capability.provenance,
      ...overrides.provenance
    }
  });
}

export function compileCapability(specInput, harnessInput, options = {}) {
  const spec = assertCapabilitySpec(specInput);
  const profile = typeof harnessInput === "string" ? HARNESS_PROFILES[harnessInput] : harnessInput;
  if (!profile) throw new CapabilityValidationError("harness_profile_unknown");
  assertHarnessProfile(profile);

  const warnings = [];
  const unsupported = [];
  if (spec.kind === "agent" && !profile.agentsNative) unsupported.push("agents");
  if (spec.kind === "command" && !profile.commandsNative) warnings.push("command_compiled_as_skill");
  if (spec.kind === "hook" && !profile.hooks) unsupported.push("hooks");
  if (spec.kind === "mcp" && !profile.mcp) unsupported.push("mcp");
  if (unsupported.length && !options.allowDegraded) {
    throw new CapabilityValidationError("capability_not_supported", `Harness ${profile.id} does not support: ${unsupported.join(", ")}`);
  }

  const effectiveKind = spec.kind === "command" && !profile.commandsNative ? "skill" : spec.kind;
  const files = compileFiles(spec, profile, effectiveKind, warnings, options);
  const manifest = {
    capabilityId: spec.id,
    capabilityVersion: spec.version,
    harnessId: profile.id,
    sourceCommit: spec.provenance.sourceCommit,
    sourceLicense: spec.provenance.sourceLicense,
    degraded: unsupported,
    warnings,
    files: files.map((file) => ({ path: file.path, digest: digest(file.content), bytes: Buffer.byteLength(file.content) }))
  };

  return {
    manifest,
    files,
    receipt: createCompilationReceipt(spec, profile, manifest)
  };
}

export class CapabilityRegistry {
  #byId = new Map();
  #bySlug = new Map();

  add(specInput) {
    const spec = assertCapabilitySpec(specInput);
    const versions = this.#byId.get(spec.id) ?? new Map();
    if (versions.has(spec.version)) throw new CapabilityValidationError("capability_version_exists");
    versions.set(spec.version, spec);
    this.#byId.set(spec.id, versions);

    const slugKey = spec.metadata.slug;
    const slugVersions = this.#bySlug.get(slugKey) ?? [];
    slugVersions.push(spec);
    slugVersions.sort((a, b) => compareSemver(b.version, a.version));
    this.#bySlug.set(slugKey, slugVersions);
    return spec;
  }

  get(id, version) {
    const versions = this.#byId.get(id);
    if (!versions) return null;
    if (version) return versions.get(version) ?? null;
    return [...versions.values()].sort((a, b) => compareSemver(b.version, a.version))[0] ?? null;
  }

  resolve(slug, version) {
    const versions = this.#bySlug.get(slug) ?? [];
    if (!version) return versions[0] ?? null;
    return versions.find((entry) => entry.version === version) ?? null;
  }

  list({ kind, tag, sourceUrl } = {}) {
    const latest = [...this.#bySlug.values()].map((entries) => entries[0]);
    return latest.filter((spec) =>
      (!kind || spec.kind === kind) &&
      (!tag || spec.metadata.tags.includes(tag)) &&
      (!sourceUrl || spec.provenance.sourceUrl === sourceUrl)
    );
  }
}

export function createDriftRecord({ previous, current, harnessId = null }) {
  assertCapabilitySpec(previous);
  assertCapabilitySpec(current);
  if (previous.metadata.slug !== current.metadata.slug) throw new CapabilityValidationError("drift_slug_mismatch");
  const changes = [];
  if (previous.provenance.sourceCommit !== current.provenance.sourceCommit) changes.push("source_commit");
  if (digest(previous.execution.instructions) !== digest(current.execution.instructions)) changes.push("instructions");
  if (digest(previous.requirements) !== digest(current.requirements)) changes.push("requirements");
  if (digest(previous.contract) !== digest(current.contract)) changes.push("contract");
  return Object.freeze({
    capabilitySlug: current.metadata.slug,
    fromVersion: previous.version,
    toVersion: current.version,
    harnessId,
    changed: changes.length > 0,
    changes,
    previousDigest: digest(previous),
    currentDigest: digest(current)
  });
}

function compileFiles(spec, profile, kind, warnings, options) {
  const slug = spec.metadata.slug;
  if (kind === "skill") {
    const base = profile.paths.skill;
    const fullBody = renderSkill(spec);
    const limit = profile.skillBodyMaxBytes;
    if (limit > 0 && Buffer.byteLength(fullBody) > limit) {
      const details = spec.execution.instructions;
      const main = renderSkill(spec, `Detailed instructions were moved to [references/details.md](references/details.md) for ${profile.displayName} portability.`);
      if (Buffer.byteLength(main) > limit) throw new CapabilityValidationError("compiled_skill_body_too_large");
      warnings.push("skill_body_split_for_harness_limit");
      return [
        { path: `${base}/${slug}/SKILL.md`, content: main },
        { path: `${base}/${slug}/references/details.md`, content: details }
      ];
    }
    return [{ path: `${base}/${slug}/SKILL.md`, content: fullBody }];
  }

  if (kind === "agent") {
    if (profile.id === "codex") {
      return [{ path: `${profile.paths.agent}/${slug}.toml`, content: renderCodexAgent(spec) }];
    }
    return [{ path: `${profile.paths.agent}/${slug}.md`, content: renderAgent(spec, profile) }];
  }

  if (kind === "command" || kind === "workflow") {
    const ext = profile.id === "antigravity" ? "toml" : "md";
    return [{ path: `${profile.paths.command}/${slug}.${ext}`, content: renderCommand(spec, profile) }];
  }

  if (kind === "hook") {
    return [{ path: `hooks/${slug}.json`, content: `${JSON.stringify({ name: spec.metadata.name, instructions: spec.execution.instructions }, null, 2)}\n` }];
  }

  if (kind === "mcp") {
    return [{ path: `mcp/${slug}.json`, content: `${JSON.stringify({ name: spec.metadata.name, requirements: spec.requirements }, null, 2)}\n` }];
  }

  if (options.allowDegraded) {
    warnings.push("capability_emitted_as_documentation_only");
    return [{ path: `unsupported/${slug}.md`, content: renderSkill(spec) }];
  }
  throw new CapabilityValidationError("capability_kind_compile_unsupported");
}

function renderSkill(spec, body = spec.execution.instructions) {
  return `---\nname: ${spec.metadata.slug}\ndescription: ${yamlScalar(spec.metadata.description || spec.metadata.name)}\n---\n\n# ${spec.metadata.name}\n\n${body.trim()}\n`;
}

function renderAgent(spec, profile) {
  const tools = mapTools(spec.requirements.tools, profile);
  const frontmatter = [
    "---",
    `name: ${spec.metadata.slug}`,
    `description: ${yamlScalar(spec.metadata.description || spec.metadata.name)}`
  ];
  if (tools.length) frontmatter.push(`tools: ${tools.join(", ")}`);
  frontmatter.push("---", "");
  return `${frontmatter.join("\n")}\n${spec.execution.instructions.trim()}\n`;
}

function renderCodexAgent(spec) {
  const readonly = spec.requirements.permissions.length === 0 || spec.requirements.permissions.every((p) => p === "read");
  const lines = [
    `name = ${tomlString(spec.metadata.slug)}`,
    `description = ${tomlString(spec.metadata.description || spec.metadata.name)}`,
    `sandbox_mode = ${tomlString(readonly ? "read-only" : "workspace-write")}`,
    `developer_instructions = ${tomlString(spec.execution.instructions)}`
  ];
  if (spec.requirements.models[0]) lines.push(`model = ${tomlString(spec.requirements.models[0])}`);
  return `${lines.join("\n")}\n`;
}

function renderCommand(spec, profile) {
  if (profile.id === "antigravity") {
    return `description = ${tomlString(spec.metadata.description || spec.metadata.name)}\nprompt = ${tomlString(spec.execution.instructions)}\n`;
  }
  return `---\ndescription: ${yamlScalar(spec.metadata.description || spec.metadata.name)}\n---\n\n${spec.execution.instructions.trim()}\n`;
}

function createCompilationReceipt(spec, profile, manifest) {
  const receipt = {
    schemaVersion: "1",
    capabilityId: spec.id,
    capabilityVersion: spec.version,
    capabilityDigest: digest(spec),
    harnessId: profile.id,
    harnessProfileDigest: digest(profile),
    source: {
      url: spec.provenance.sourceUrl,
      commit: spec.provenance.sourceCommit,
      license: spec.provenance.sourceLicense
    },
    manifestDigest: digest(manifest),
    fileCount: manifest.files.length,
    warnings: [...manifest.warnings],
    degraded: [...manifest.degraded]
  };
  return Object.freeze({ ...receipt, receiptDigest: digest(receipt) });
}

function mapTools(tools, profile) {
  if (!tools.length) return [];
  const lower = tools.map((tool) => tool.toLowerCase());
  if (["cursor", "opencode", "copilot", "pi", "antigravity"].includes(profile.id)) return lower;
  return tools;
}

function normalizeContractEntries(entries) {
  if (entries == null) return [];
  if (!Array.isArray(entries)) throw new CapabilityValidationError("capability_contract_entries_invalid");
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object") throw new CapabilityValidationError("capability_contract_entry_invalid");
    return {
      name: requireText(entry.name, "capability_contract_entry_name_invalid", 120),
      description: optionalText(entry.description, 1_000),
      required: entry.required !== false
    };
  });
}

function normalizeNamedTextEntries(entries) {
  if (entries == null) return [];
  if (!Array.isArray(entries)) throw new CapabilityValidationError("capability_named_entries_invalid");
  return entries.map((entry) => ({
    name: requireText(entry?.name, "capability_named_entry_name_invalid", 240),
    content: requireText(entry?.content, "capability_named_entry_content_invalid", 500_000, true)
  }));
}

function normalizeTestCases(entries) {
  if (entries == null) return [];
  if (!Array.isArray(entries)) throw new CapabilityValidationError("capability_test_cases_invalid");
  return entries.map((entry, index) => ({
    id: entry?.id ?? `case-${index + 1}`,
    input: requireText(entry?.input, "capability_test_case_input_invalid", 50_000, true),
    expected: optionalText(entry?.expected, 50_000)
  }));
}

function normalizeNonNegativeInteger(value) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new CapabilityValidationError("capability_context_budget_invalid");
  return value;
}

function normalizeThreshold(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new CapabilityValidationError("capability_quality_threshold_invalid");
  }
  return value;
}

function uniqueStrings(values) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new CapabilityValidationError("capability_string_list_invalid");
  return [...new Set(values.map((value) => requireText(value, "capability_string_invalid", 2_000).trim()))];
}

function optionalText(value, maxLength) {
  if (value == null) return "";
  return requireText(value, "capability_text_invalid", maxLength, true);
}

function requireText(value, code, maxLength, allowEmpty = false) {
  if (typeof value !== "string" || value.length > maxLength || (!allowEmpty && !value.trim())) {
    throw new CapabilityValidationError(code);
  }
  return value;
}

function requireSlug(value, code) {
  if (typeof value !== "string" || !SLUG_RE.test(value) || value.length > 120) throw new CapabilityValidationError(code);
  return value;
}

function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new CapabilityValidationError("capability_slug_invalid");
  return slug.slice(0, 120).replace(/-$/g, "");
}

function digest(value) {
  const content = typeof value === "string" ? value : JSON.stringify(sortValue(value));
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function compareSemver(a, b) {
  const pa = a.split(/[.-]/).slice(0, 3).map(Number);
  const pb = b.split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return a.localeCompare(b);
}
