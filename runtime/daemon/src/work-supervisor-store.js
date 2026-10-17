import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createWakeQueue, createWorkLedger } from "./work-supervisor.js";

export async function createPersistentWorkSupervisor({
  filePath,
  now = () => Date.now(),
  maxSelfWakeDepth = 4
} = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "") throw new Error("work_supervisor_store_path_required");

  const resolvedPath = path.resolve(filePath);
  const ledger = createWorkLedger({ now });
  const wakes = createWakeQueue({ now, maxSelfWakeDepth });
  const recovered = [];

  const stored = await readSnapshot(resolvedPath);
  if (stored) {
    const hydrated = ledger.hydrate(stored.workItems ?? []);
    for (const entry of hydrated) if (entry.recovered) recovered.push(entry);
    wakes.hydrate(stored.wakeDeliveries ?? []);
    if (recovered.length) await persist();
  }

  return {
    async createWork(input) {
      const work = ledger.create(input);
      await persist();
      return work;
    },

    async transitionWork(workId, transition) {
      const result = ledger.transition(workId, transition);
      await persist();
      return result;
    },

    getWork(workId) {
      return ledger.get(workId);
    },

    listWork() {
      return ledger.list();
    },

    async enqueueWake(input) {
      const result = wakes.enqueue(input);
      if (result.kind === "queued") await persist();
      return result;
    },

    async settleWake(deliveryId, status, detail) {
      const result = wakes.settle(deliveryId, status, detail);
      await persist();
      return result;
    },

    nextWake() {
      return wakes.next();
    },

    getWake(deliveryId) {
      return wakes.get(deliveryId);
    },

    listWakes() {
      return wakes.list();
    },

    snapshot() {
      return {
        version: 1,
        workItems: ledger.list(),
        wakeDeliveries: wakes.list()
      };
    },

    drainRecoveredWork() {
      return recovered.splice(0, recovered.length).map((entry) => structuredClone(entry));
    },

    async flush() {
      await persist();
    }
  };

  async function persist() {
    const snapshot = {
      version: 1,
      workItems: ledger.list(),
      wakeDeliveries: wakes.list()
    };
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    const tempPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await rename(tempPath, resolvedPath);
  }
}

async function readSnapshot(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("work_supervisor_store_invalid");
    if (parsed.version !== 1) throw new Error("work_supervisor_store_version_unsupported");
    if (!Array.isArray(parsed.workItems) || !Array.isArray(parsed.wakeDeliveries)) {
      throw new Error("work_supervisor_store_shape_invalid");
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
