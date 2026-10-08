import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const CONTEXT_SCHEMA = "project-context/v1";
const REVISION_SCHEMA = "project-context-revision/v1";
const HANDOFF_SCHEMA = "context-handoff/v1";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertSafeId(label, value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a safe non-empty identifier`);
  }
  return value;
}

function assertString(label, value, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`${label} must be a string`);
  return value;
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("project context must be an object");
  if (snapshot.schemaVersion !== CONTEXT_SCHEMA) throw new Error(`project context schemaVersion must be ${CONTEXT_SCHEMA}`);
  const projectId = assertSafeId("projectId", snapshot.projectId);
  const revision = assertSafeId("revision", snapshot.revision);
  assertString("updatedAt", snapshot.updatedAt);
  if (snapshot.summary !== undefined) assertString("summary", snapshot.summary, { allowEmpty: true });
  if (snapshot.vocabulary !== undefined && (!snapshot.vocabulary || typeof snapshot.vocabulary !== "object" || Array.isArray(snapshot.vocabulary))) {
    throw new Error("vocabulary must be an object");
  }
  for (const [term, definition] of Object.entries(snapshot.vocabulary ?? {})) {
    assertString("vocabulary term", term);
    assertString(`vocabulary.${term}`, definition);
  }
  if (snapshot.constraints !== undefined && !Array.isArray(snapshot.constraints)) throw new Error("constraints must be an array");
  for (const constraint of snapshot.constraints ?? []) assertString("constraint", constraint);
  if (snapshot.evidenceRefs !== undefined && !Array.isArray(snapshot.evidenceRefs)) throw new Error("evidenceRefs must be an array");
  for (const ref of snapshot.evidenceRefs ?? []) assertString("evidenceRef", ref);
  if (snapshot.decisions !== undefined && !Array.isArray(snapshot.decisions)) throw new Error("decisions must be an array");
  const decisionIds = new Set();
  for (const decision of snapshot.decisions ?? []) {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) throw new Error("decision must be an object");
    const id = assertSafeId("decision.id", decision.id);
    if (decisionIds.has(id)) throw new Error(`duplicate decision id ${id}`);
    decisionIds.add(id);
    assertString(`decision.${id}.statement`, decision.statement);
    if (!["active", "superseded", "retracted"].includes(decision.status)) throw new Error(`decision.${id}.status is invalid`);
    if (decision.reason !== undefined) assertString(`decision.${id}.reason`, decision.reason, { allowEmpty: true });
  }
  if (snapshot.activeDesign !== undefined && snapshot.activeDesign !== null) {
    const design = snapshot.activeDesign;
    if (typeof design !== "object" || Array.isArray(design)) throw new Error("activeDesign must be an object or null");
    assertSafeId("activeDesign.id", design.id);
    assertString("activeDesign.title", design.title);
    if (!Array.isArray(design.successCriteria)) throw new Error("activeDesign.successCriteria must be an array");
    for (const criterion of design.successCriteria) assertString("success criterion", criterion);
    if (design.unknowns !== undefined && !Array.isArray(design.unknowns)) throw new Error("activeDesign.unknowns must be an array");
    for (const unknown of design.unknowns ?? []) assertString("design unknown", unknown);
  }
  return canonicalize({ ...snapshot, projectId, revision });
}

async function atomicWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temp, file);
}

function oneLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function renderContext(snapshot) {
  const lines = [
    "# Agent Work OS project context",
    `Project: ${snapshot.projectId}`,
    `Revision: ${snapshot.revision}`,
  ];
  if (snapshot.summary) lines.push("", "## Summary", oneLine(snapshot.summary));

  const vocabulary = Object.entries(snapshot.vocabulary ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (vocabulary.length) {
    lines.push("", "## Vocabulary");
    for (const [term, definition] of vocabulary) lines.push(`- ${oneLine(term)}: ${oneLine(definition)}`);
  }

  if (snapshot.constraints?.length) {
    lines.push("", "## Constraints");
    for (const constraint of snapshot.constraints) lines.push(`- ${oneLine(constraint)}`);
  }

  const activeDecisions = (snapshot.decisions ?? [])
    .filter((decision) => decision.status === "active")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (activeDecisions.length) {
    lines.push("", "## Current decisions");
    for (const decision of activeDecisions) {
      lines.push(`- [${decision.id}] ${oneLine(decision.statement)}${decision.reason ? ` — ${oneLine(decision.reason)}` : ""}`);
    }
  }

  if (snapshot.activeDesign) {
    const design = snapshot.activeDesign;
    lines.push("", "## Active design", `${design.id}: ${oneLine(design.title)}`);
    if (design.successCriteria.length) {
      lines.push("Success criteria:");
      for (const criterion of design.successCriteria) lines.push(`- ${oneLine(criterion)}`);
    }
    if (design.unknowns?.length) {
      lines.push("Open unknowns:");
      for (const unknown of design.unknowns) lines.push(`- ${oneLine(unknown)}`);
    }
  }

  if (snapshot.evidenceRefs?.length) {
    lines.push("", "## Evidence refs");
    for (const ref of [...snapshot.evidenceRefs].sort()) lines.push(`- ${oneLine(ref)}`);
  }
  return `${lines.join("\n")}\n`;
}

function boundPrompt(prompt, budgetChars) {
  if (!Number.isInteger(budgetChars) || budgetChars < 256) throw new Error("budgetChars must be an integer >= 256");
  if (prompt.length <= budgetChars) return { prompt, truncated: false };
  const marker = "\n[context truncated to deterministic character budget]\n";
  return { prompt: `${prompt.slice(0, budgetChars - marker.length)}${marker}`, truncated: true };
}

export class ProjectContextStore {
  constructor(root) {
    if (!root) throw new Error("ProjectContextStore root is required");
    this.root = path.resolve(root);
  }

  projectDir(projectId) {
    return path.join(this.root, assertSafeId("projectId", projectId));
  }

  async writeSnapshot(snapshot) {
    const normalized = normalizeSnapshot(snapshot);
    const digest = sha256(canonicalJson(normalized));
    const envelope = {
      schemaVersion: REVISION_SCHEMA,
      projectId: normalized.projectId,
      revision: normalized.revision,
      digest,
      snapshot: normalized,
    };
    const projectDir = this.projectDir(normalized.projectId);
    const revisionFile = path.join(projectDir, "revisions", `${digest}.json`);
    try {
      const existing = JSON.parse(await fs.readFile(revisionFile, "utf8"));
      if (canonicalJson(existing) !== canonicalJson(envelope)) throw new Error(`revision collision for ${digest}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await atomicWrite(revisionFile, `${JSON.stringify(envelope, null, 2)}\n`);
    }
    await atomicWrite(
      path.join(projectDir, "current.json"),
      `${JSON.stringify({ schemaVersion: "project-context-pointer/v1", projectId: normalized.projectId, revision: normalized.revision, digest }, null, 2)}\n`,
    );
    return envelope;
  }

  async readRevision(projectId, digest) {
    assertSafeId("projectId", projectId);
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("digest must be a sha256 hex digest");
    const file = path.join(this.projectDir(projectId), "revisions", `${digest}.json`);
    const envelope = JSON.parse(await fs.readFile(file, "utf8"));
    if (envelope.schemaVersion !== REVISION_SCHEMA || envelope.projectId !== projectId || envelope.digest !== digest) {
      throw new Error(`invalid project context revision envelope for ${projectId}`);
    }
    const actual = sha256(canonicalJson(normalizeSnapshot(envelope.snapshot)));
    if (actual !== digest) throw new Error(`project context revision ${digest} failed integrity verification`);
    return envelope;
  }

  async readCurrent(projectId) {
    const pointer = JSON.parse(await fs.readFile(path.join(this.projectDir(projectId), "current.json"), "utf8"));
    if (pointer.schemaVersion !== "project-context-pointer/v1" || pointer.projectId !== projectId) throw new Error(`invalid current context pointer for ${projectId}`);
    const envelope = await this.readRevision(projectId, pointer.digest);
    if (envelope.revision !== pointer.revision) throw new Error(`current context pointer revision mismatch for ${projectId}`);
    return envelope;
  }

  async createHandoff({ projectId, worktreeId = null, taskId = null, runId = null, budgetChars = 12000, createdAt = new Date().toISOString() }) {
    const envelope = await this.readCurrent(projectId);
    for (const [label, value] of [["worktreeId", worktreeId], ["taskId", taskId], ["runId", runId]]) {
      if (value !== null) assertSafeId(label, value);
    }
    const bounded = boundPrompt(renderContext(envelope.snapshot), budgetChars);
    const promptDigest = sha256(bounded.prompt);
    const binding = { projectId, worktreeId, taskId, runId };
    const handoffId = sha256(canonicalJson({ binding, contextDigest: envelope.digest, promptDigest })).slice(0, 24);
    const handoff = {
      schemaVersion: HANDOFF_SCHEMA,
      handoffId,
      createdAt,
      binding,
      context: { revision: envelope.revision, digest: envelope.digest },
      prompt: bounded.prompt,
      promptDigest,
      budgetChars,
      truncated: bounded.truncated,
    };
    await atomicWrite(path.join(this.projectDir(projectId), "handoffs", `${handoffId}.json`), `${JSON.stringify(handoff, null, 2)}\n`);
    return handoff;
  }

  async readHandoff(projectId, handoffId) {
    assertSafeId("projectId", projectId);
    assertSafeId("handoffId", handoffId);
    const handoff = JSON.parse(await fs.readFile(path.join(this.projectDir(projectId), "handoffs", `${handoffId}.json`), "utf8"));
    if (handoff.schemaVersion !== HANDOFF_SCHEMA || handoff.binding?.projectId !== projectId || handoff.handoffId !== handoffId) {
      throw new Error(`invalid context handoff ${handoffId}`);
    }
    if (sha256(handoff.prompt) !== handoff.promptDigest) throw new Error(`context handoff ${handoffId} failed prompt integrity verification`);
    await this.readRevision(projectId, handoff.context.digest);
    return handoff;
  }
}

export const PROJECT_CONTEXT_SCHEMAS = Object.freeze({
  context: CONTEXT_SCHEMA,
  revision: REVISION_SCHEMA,
  handoff: HANDOFF_SCHEMA,
});
