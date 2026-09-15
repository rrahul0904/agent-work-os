import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function loadMachineId() {
  const root = process.env.AGENT_WORK_OS_HOME ?? path.join(os.homedir(), ".agent-work-os");
  const file = path.join(root, "machine.json");
  try { const parsed = JSON.parse(await readFile(file, "utf8")); if (parsed.id) return parsed.id; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const id = crypto.randomUUID(); await mkdir(root, { recursive: true }); await writeFile(file, JSON.stringify({ id }, null, 2)); return id;
}
