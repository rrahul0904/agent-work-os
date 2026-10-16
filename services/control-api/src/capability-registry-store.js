import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCapabilitySpec, CapabilityValidationError } from "../../../packages/capability-fabric/src/index.js";

const MIGRATION_URL = new URL("../../../migrations/010_capability_registry.sql", import.meta.url);

export class CapabilityRegistryStoreError extends Error {
  constructor(code, message = code, statusCode = 400) {
    super(message);
    this.name = "CapabilityRegistryStoreError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class TenantCapabilityRegistryRepository {
  constructor(store) {
    this.store = store;
    this.localPath = `${store.filePath}.capabilities.json`;
    this.localWriteChain = Promise.resolve();
    this.migrationPromise = null;
  }

  async initialize() {
    if (!this.store.pool) await this.#readLocalState();
  }

  async add(organizationId, specInput, { createdBy = null, createdAt = new Date().toISOString() } = {}) {
    const spec = validateSpec(specInput);
    requireText(organizationId, "capability_registry_organization_id_invalid");
    if (!Number.isFinite(Date.parse(createdAt))) throw new CapabilityRegistryStoreError("capability_registry_created_at_invalid");
    const entry = createEntry(organizationId, spec, createdBy, createdAt);
    await this.#ensurePostgresStore();

    if (!this.store.pool) {
      const state = await this.#readLocalState();
      const entries = state.organizations[organizationId] ?? [];
      if (entries.some((item) =>
        (item.capabilityId === entry.capabilityId || item.slug === entry.slug) && item.version === entry.version
      )) throw new CapabilityRegistryStoreError("capability_registry_version_exists", undefined, 409);
      entries.push(entry);
      state.organizations[organizationId] = entries;
      await this.#writeLocalState(state);
      return structuredClone(entry);
    }

    try {
      await this.store.pool.query(
        `INSERT INTO agent_work_os_capabilities_v1
          (organization_id, capability_id, capability_version, slug, kind, source_url, source_commit, source_license, created_by, record, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
        [organizationId, spec.id, spec.version, spec.metadata.slug, spec.kind,
          spec.provenance.sourceUrl, spec.provenance.sourceCommit, spec.provenance.sourceLicense,
          createdBy, JSON.stringify(spec), createdAt]
      );
      return structuredClone(entry);
    } catch (error) {
      if (error?.code === "23505") throw new CapabilityRegistryStoreError("capability_registry_version_exists", undefined, 409);
      if (error?.code === "23503") throw new CapabilityRegistryStoreError("capability_registry_scope_invalid", undefined, 404);
      throw error;
    }
  }

  async getById(organizationId, capabilityId, version = null) {
    requireText(organizationId, "capability_registry_organization_id_invalid");
    requireText(capabilityId, "capability_registry_capability_id_invalid");
    const entries = await this.#queryEntries(organizationId, { capabilityId });
    return selectVersion(entries, version);
  }

  async resolve(organizationId, slug, version = null) {
    requireText(organizationId, "capability_registry_organization_id_invalid");
    requireText(slug, "capability_registry_slug_invalid");
    const entries = await this.#queryEntries(organizationId, { slug });
    return selectVersion(entries, version);
  }

  async listByOrganization(organizationId, filters = {}) {
    requireText(organizationId, "capability_registry_organization_id_invalid");
    const entries = await this.#queryEntries(organizationId, filters);
    const filtered = entries.filter((entry) =>
      (!filters.kind || entry.kind === filters.kind) &&
      (!filters.tag || entry.spec.metadata.tags.includes(filters.tag)) &&
      (!filters.sourceUrl || entry.sourceUrl === filters.sourceUrl)
    );
    if (filters.allVersions === true) return sortEntries(filtered).map(structuredClone);
    const latest = new Map();
    for (const entry of sortEntries(filtered)) if (!latest.has(entry.slug)) latest.set(entry.slug, entry);
    return [...latest.values()].map(structuredClone);
  }

  async #queryEntries(organizationId, filters = {}) {
    await this.#ensurePostgresStore();
    if (!this.store.pool) {
      const state = await this.#readLocalState();
      return (state.organizations[organizationId] ?? [])
        .filter((entry) => !filters.capabilityId || entry.capabilityId === filters.capabilityId)
        .filter((entry) => !filters.slug || entry.slug === filters.slug)
        .map(structuredClone);
    }

    const values = [organizationId];
    const where = ["organization_id = $1"];
    if (filters.capabilityId) { values.push(filters.capabilityId); where.push(`capability_id = $${values.length}`); }
    if (filters.slug) { values.push(filters.slug); where.push(`slug = $${values.length}`); }
    if (filters.kind) { values.push(filters.kind); where.push(`kind = $${values.length}`); }
    if (filters.sourceUrl) { values.push(filters.sourceUrl); where.push(`source_url = $${values.length}`); }
    const result = await this.store.pool.query(
      `SELECT organization_id, capability_id, capability_version, slug, kind, source_url, source_commit, source_license, created_by, record, created_at
       FROM agent_work_os_capabilities_v1
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, slug, capability_version`,
      values
    );
    return result.rows.map((row) => createEntry(
      row.organization_id,
      validateSpec(row.record),
      row.created_by ?? null,
      new Date(row.created_at).toISOString()
    ));
  }

  async #ensurePostgresStore() {
    if (!this.store.pool) return;
    if (!this.migrationPromise) {
      this.migrationPromise = readFile(MIGRATION_URL, "utf8")
        .then((migration) => this.store.pool.query(migration))
        .catch((error) => {
          this.migrationPromise = null;
          throw error;
        });
    }
    await this.migrationPromise;
  }

  async #readLocalState() {
    try {
      const parsed = JSON.parse(await readFile(this.localPath, "utf8"));
      if (parsed?.schemaVersion !== "1" || !parsed.organizations || typeof parsed.organizations !== "object" || Array.isArray(parsed.organizations)) {
        throw new CapabilityRegistryStoreError("capability_registry_local_store_invalid", undefined, 500);
      }
      for (const [organizationId, entries] of Object.entries(parsed.organizations)) {
        requireText(organizationId, "capability_registry_organization_id_invalid");
        if (!Array.isArray(entries)) throw new CapabilityRegistryStoreError("capability_registry_local_store_invalid", undefined, 500);
        for (const entry of entries) validateStoredEntry(entry, organizationId);
      }
      return parsed;
    } catch (error) {
      if (error?.code === "ENOENT") return { schemaVersion: "1", organizations: {} };
      if (error instanceof SyntaxError) throw new CapabilityRegistryStoreError("capability_registry_local_store_invalid_json", undefined, 500);
      throw error;
    }
  }

  #writeLocalState(state) {
    const snapshot = `${JSON.stringify(state, null, 2)}\n`;
    this.localWriteChain = this.localWriteChain.catch(() => {}).then(async () => {
      await mkdir(path.dirname(this.localPath), { recursive: true });
      const temp = `${this.localPath}.tmp`;
      await writeFile(temp, snapshot, "utf8");
      await rename(temp, this.localPath);
    });
    return this.localWriteChain;
  }
}

function validateSpec(spec) {
  try { return assertCapabilitySpec(spec); }
  catch (error) {
    if (error instanceof CapabilityValidationError) throw new CapabilityRegistryStoreError(error.code, error.message, 400);
    throw error;
  }
}

function createEntry(organizationId, spec, createdBy, createdAt) {
  return {
    organizationId,
    capabilityId: spec.id,
    version: spec.version,
    slug: spec.metadata.slug,
    kind: spec.kind,
    sourceUrl: spec.provenance.sourceUrl,
    sourceCommit: spec.provenance.sourceCommit,
    sourceLicense: spec.provenance.sourceLicense,
    createdBy,
    createdAt,
    spec: structuredClone(spec)
  };
}

function validateStoredEntry(entry, organizationId) {
  if (!entry || typeof entry !== "object" || entry.organizationId !== organizationId) {
    throw new CapabilityRegistryStoreError("capability_registry_local_store_invalid", undefined, 500);
  }
  const spec = validateSpec(entry.spec);
  const expected = createEntry(organizationId, spec, entry.createdBy ?? null, entry.createdAt);
  for (const field of ["capabilityId", "version", "slug", "kind", "sourceUrl", "sourceCommit", "sourceLicense"]) {
    if (entry[field] !== expected[field]) throw new CapabilityRegistryStoreError("capability_registry_local_store_invalid", undefined, 500);
  }
  if (!Number.isFinite(Date.parse(entry.createdAt))) throw new CapabilityRegistryStoreError("capability_registry_local_store_invalid", undefined, 500);
}

function selectVersion(entries, version) {
  if (version) return structuredClone(entries.find((entry) => entry.version === version) ?? null);
  return structuredClone(sortEntries(entries)[0] ?? null);
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => compareSemver(b.version, a.version) || b.createdAt.localeCompare(a.createdAt));
}

function compareSemver(a, b) {
  const [acore, apre = ""] = a.split("-", 2);
  const [bcore, bpre = ""] = b.split("-", 2);
  const aparts = acore.split(".").map(Number);
  const bparts = bcore.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if (aparts[i] !== bparts[i]) return aparts[i] - bparts[i];
  if (!apre && bpre) return 1;
  if (apre && !bpre) return -1;
  return apre.localeCompare(bpre);
}

function requireText(value, code) {
  if (typeof value !== "string" || !value.trim()) throw new CapabilityRegistryStoreError(code);
  return value;
}
