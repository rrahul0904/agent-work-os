import fs from "node:fs/promises";
import path from "node:path";
import { reconcileShippingRunOnStartup, verifyShippingRun } from "./shipping-receipts.js";

export class ShippingStore {
  constructor(root) {
    if (typeof root !== "string" || !root.trim()) throw new Error("shipping_store_root_required");
    this.root = path.resolve(root);
  }

  async save(run) {
    const verification = verifyShippingRun(run);
    if (!verification.valid) throw new Error(`shipping_store_run_invalid:${verification.errors.join(",")}`);
    await fs.mkdir(this.root, { recursive: true });
    const destination = this.pathFor(run.runId);
    const temp = `${destination}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temp, destination);
    return destination;
  }

  async load(runId) {
    const raw = await fs.readFile(this.pathFor(runId), "utf8");
    const run = JSON.parse(raw);
    const verification = verifyShippingRun(run);
    if (!verification.valid) throw new Error(`shipping_store_run_invalid:${verification.errors.join(",")}`);
    return run;
  }

  async reconcile(runId, options = {}) {
    const run = await this.load(runId);
    const reconciled = reconcileShippingRunOnStartup(run, options);
    await this.save(reconciled);
    return reconciled;
  }

  pathFor(runId) {
    if (typeof runId !== "string" || !/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error("shipping_store_run_id_invalid");
    return path.join(this.root, `${runId}.json`);
  }
}
