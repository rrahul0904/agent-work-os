import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { WorkMemoryError, validatePage } from "./work-memory.js";

export class WorkMemoryStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.pages = {};
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || parsed.schema !== "work-memory-store/v1" || typeof parsed.pages !== "object" || Array.isArray(parsed.pages)) {
        throw new WorkMemoryError("invalid_store", "Unsupported Work Memory store payload");
      }
      for (const [workId, page] of Object.entries(parsed.pages)) {
        validatePage(page);
        if (page.workId !== workId) {
          throw new WorkMemoryError("store_key_mismatch", `Stored page key does not match workId: ${workId}`);
        }
      }
      this.pages = structuredClone(parsed.pages);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return this;
  }

  list() {
    return Object.values(this.pages)
      .map((page) => structuredClone(page))
      .sort((a, b) => a.workId.localeCompare(b.workId));
  }

  get(workId) {
    const page = this.pages[workId];
    return page ? structuredClone(page) : undefined;
  }

  async create(page) {
    validatePage(page);
    if (this.pages[page.workId]) {
      throw new WorkMemoryError("work_memory_exists", `Work Memory page already exists: ${page.workId}`);
    }
    if (page.revision !== 0) {
      throw new WorkMemoryError("invalid_initial_revision", "New Work Memory pages must start at revision 0");
    }
    this.pages[page.workId] = structuredClone(page);
    await this.#persist();
    return this.get(page.workId);
  }

  async save(page, { expectedStoredRevision } = {}) {
    validatePage(page);
    const current = this.pages[page.workId];
    if (!current) throw new WorkMemoryError("unknown_work_memory", `Unknown Work Memory page: ${page.workId}`);
    if (current.revision !== expectedStoredRevision) {
      throw new WorkMemoryError("stored_revision_conflict", "Persisted Work Memory revision changed", {
        expected: expectedStoredRevision,
        actual: current.revision,
      });
    }
    if (page.revision <= current.revision) {
      throw new WorkMemoryError("revision_not_advanced", "Saved Work Memory revision must advance");
    }
    this.pages[page.workId] = structuredClone(page);
    await this.#persist();
    return this.get(page.workId);
  }

  #persist() {
    const snapshot = JSON.stringify({ schema: "work-memory-store/v1", pages: this.pages }, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, snapshot, "utf8");
      await rename(tempPath, this.filePath);
    });
    return this.writeChain;
  }
}
