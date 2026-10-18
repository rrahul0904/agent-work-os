/**
 * Read-only inspection and explicit, evidence-pinned import for Markdown/JSON role packs.
 * Never fetches, executes, installs, registers MCP connectors, or grants permissions.
 * Original clean-room Agent Work OS adapter; source shapes are public file formats.
 */
import { createHash } from "node:crypto";
import { CapabilityValidationError, createCapabilitySpec } from "./index.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const PIN = /^[0-9a-f]{40}$/i;
const SAFE_ORIGIN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/;

function invalid(code) { throw new CapabilityValidationError(code); }
function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(code);
  return value;
}
function string(value, code, max = 2000) {
  if (typeof value !== "string" || value.length > max || !value.trim()) invalid(code);
  return value.trim();
}
function slug(value, code) {
  if (!SLUG.test(string(value, code, 120))) invalid(code);
  return value;
}
function frontmatterScalar(value) {
  const val = value.trim();
  if (val.startsWith('"')) {
    try { const parsed = JSON.parse(val); if (typeof parsed === "string") return parsed; } catch {}
    invalid("role_pack_frontmatter_scalar_invalid");
  }
  if (/^[>|\[{]/.test(val) || /[\u0000-\u001f]/.test(val)) invalid("role_pack_frontmatter_scalar_unsupported");
  return val;
}

export function parseRoleSkill(file, role) {
  object(file, "role_pack_skill_invalid");
  const contents = string(file.contents, "role_pack_skill_contents_invalid", 300_000);
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(contents);
  if (!match) invalid("role_pack_skill_frontmatter_missing");
  const fields = Object.create(null);
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = /^([a-z][a-z0-9-]*):\s*(.*)$/.exec(line);
    if (!item || Object.hasOwn(fields, item[1])) invalid("role_pack_skill_frontmatter_invalid");
    fields[item[1]] = frontmatterScalar(item[2]);
  }
  const name = slug(fields.name, "role_pack_skill_name_invalid");
  const description = string(fields.description, "role_pack_skill_description_invalid", 2000);
  const expected = `${role}/skills/${name}/SKILL.md`;
  if (file.path !== expected) invalid("role_pack_skill_path_invalid");
  const instructions = string(match[2], "role_pack_skill_body_invalid", 295_000);
  return Object.freeze({ name, description, path: expected, instructions, argumentHint: fields["argument-hint"] ?? "" });
}

export function inspectRolePack(bundle) {
  object(bundle, "role_pack_invalid");
  const source = object(bundle.source, "role_pack_source_invalid");
  const sourceUrl = string(source.url, "role_pack_source_url_invalid");
  if (!SAFE_ORIGIN.test(sourceUrl)) invalid("role_pack_source_url_unapproved");
  const sourceCommit = string(source.commit, "role_pack_unpinned_source");
  if (!PIN.test(sourceCommit)) invalid("role_pack_unpinned_source");
  const sourceLicense = string(source.license, "role_pack_source_license_missing", 100);
  if (sourceLicense !== "Apache-2.0") invalid("role_pack_license_review_required");
  const observedAt = string(source.observedAt, "role_pack_observation_required", 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(observedAt) || !Number.isFinite(Date.parse(observedAt))) {
    invalid("role_pack_observation_invalid");
  }
  const manifest = object(bundle.manifest, "role_pack_manifest_invalid");
  const role = slug(manifest.name, "role_pack_name_invalid");
  const version = string(manifest.version, "role_pack_version_invalid", 80);
  if (!SEMVER.test(version)) invalid("role_pack_version_invalid");
  const description = string(manifest.description, "role_pack_description_invalid", 2000);
  if (!Array.isArray(bundle.skills) || bundle.skills.length < 1 || bundle.skills.length > 100) {
    invalid("role_pack_skills_invalid");
  }
  const skills = bundle.skills.map((skill) => parseRoleSkill(skill, role));
  if (new Set(skills.map((skill) => skill.name)).size !== skills.length) invalid("role_pack_skill_duplicate");
  const servers = bundle.mcpConfig == null ? {} : object(object(bundle.mcpConfig, "role_pack_mcp_invalid").mcpServers, "role_pack_mcp_servers_invalid");
  if (Object.keys(servers).length > 100) invalid("role_pack_too_many_connectors");
  const connectors = Object.entries(servers).map(([id, config]) => {
    string(id, "role_pack_connector_name_invalid", 120);
    const item = object(config, "role_pack_connector_config_invalid");
    const transport = item.type === "http" && typeof item.url === "string" ? "http" : "other";
    const endpoint = transport === "http" ? item.url : "";
    const validEndpoint = endpoint.length > 0 && /^https:\/\//i.test(endpoint);
    return Object.freeze({ id, transport, endpoint: validEndpoint ? endpoint : "", status: "disabled-unreviewed", needsConfiguration: !validEndpoint });
  });
  return Object.freeze({ role, version, description, source: Object.freeze({ url: sourceUrl, commit: sourceCommit.toLowerCase(), license: sourceLicense, observedAt }), skills, connectors,
    policy: Object.freeze({ automaticInstall: false, mcpRegistration: false, network: "deny-by-default", outboundActions: "approval-required", sourceTrust: "unreviewed" }) });
}

function stableCapabilityId(sourceUrl, role, skillName) {
  const hex = createHash("sha256").update(`${sourceUrl}#${role}/${skillName}`).digest("hex");
  // Deterministic UUID-shaped identity for matching capability versions across source revisions.
  return `capability_${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

export function importRolePack(bundle, { approveInstructions = false } = {}) {
  const inventory = inspectRolePack(bundle);
  if (approveInstructions !== true) invalid("role_pack_instruction_approval_required");
  const capabilities = inventory.skills.map((skill) => createCapabilitySpec({
    id: stableCapabilityId(inventory.source.url, inventory.role, skill.name),
    version: inventory.version,
    kind: "skill",
    createdAt: inventory.source.observedAt,
    metadata: {
      name: `${inventory.role}: ${skill.name}`,
      slug: `${inventory.role}-${skill.name}`,
      description: skill.description,
      triggers: [`/${skill.name}`],
      tags: ["knowledge-work", "role-pack", inventory.role]
    },
    execution: { instructions: skill.instructions },
    requirements: { tools: [], permissions: [], models: [], networkPolicy: "deny-by-default" },
    provenance: {
      sourceUrl: inventory.source.url,
      sourceCommit: inventory.source.commit,
      sourceLicense: inventory.source.license,
      sourcePath: skill.path,
      evidence: [skill.path, `${inventory.role}/.claude-plugin/plugin.json`]
    },
    evaluation: { testCases: [], qualityThreshold: 0.8 }
  }));
  return Object.freeze({ inventory, capabilities });
}
