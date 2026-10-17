import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

const DEFAULT_MAX_READ_BYTES = 1024 * 1024;
const DEFAULT_MAX_WRITE_BYTES = 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_TIMEOUT_MS = 60_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createMachineTools(policy, options = {}) {
  const maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
  const maxWriteBytes = options.maxWriteBytes ?? DEFAULT_MAX_WRITE_BYTES;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnImpl = options.spawnImpl ?? spawn;

  return {
    info() {
      return { platform: os.platform(), arch: os.arch(), hostname: os.hostname(), policy: policy.describe() };
    },

    async list(inputPath = ".") {
      const target = policy.resolveWorkspacePath(inputPath, "read");
      const entries = await fs.readdir(target, { withFileTypes: true });
      return {
        path: target,
        truncated: entries.length > maxEntries,
        entries: entries.slice(0, maxEntries).map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : entry.isSymbolicLink() ? "symlink" : "other"
        }))
      };
    },

    async read(inputPath) {
      const target = policy.resolveWorkspacePath(inputPath, "read");
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error("machine_tool_read_not_file");
      if (stat.size > maxReadBytes) throw new Error(`machine_tool_read_too_large:${stat.size}`);
      const buffer = await fs.readFile(target);
      return { path: target, size: stat.size, sha256: sha256(buffer), content: buffer.toString("utf8") };
    },

    async write(request = {}) {
      if (typeof request.path !== "string" || typeof request.content !== "string") throw new Error("machine_tool_write_invalid");
      const target = policy.resolveWorkspacePath(request.path, "write");
      const buffer = Buffer.from(request.content, "utf8");
      if (buffer.length > maxWriteBytes) throw new Error(`machine_tool_write_too_large:${buffer.length}`);

      let existing;
      let existingStat;
      try {
        existingStat = await fs.stat(target);
        if (!existingStat.isFile()) throw new Error("machine_tool_write_not_file");
        existing = await fs.readFile(target);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (request.expectedSha256 !== undefined) {
        if (!existing) throw new Error("machine_tool_write_precondition_missing");
        const actual = sha256(existing);
        if (actual !== request.expectedSha256) throw new Error(`machine_tool_write_precondition_failed:${actual}`);
      }

      const temp = path.join(path.dirname(target), `.agent-work-os-${path.basename(target)}-${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temp, buffer, existingStat ? { mode: existingStat.mode & 0o777 } : undefined);
        await fs.rename(temp, target);
      } finally {
        await fs.rm(temp, { force: true }).catch(() => {});
      }
      return { path: target, size: buffer.length, sha256: sha256(buffer), replaced: Boolean(existing) };
    },

    async run(request = {}) {
      const program = policy.assertCommand(request.program);
      const cwd = policy.resolveWorkspacePath(request.cwd ?? ".", "execute");
      const args = Array.isArray(request.args) ? request.args : [];
      if (args.some((arg) => typeof arg !== "string")) throw new Error("machine_tool_args_invalid");
      if (args.length > 256) throw new Error("machine_tool_args_too_many");
      const requestedTimeout = Number(request.timeoutMs ?? defaultTimeoutMs);
      const timeoutMs = Math.max(1, Math.min(Number.isFinite(requestedTimeout) ? requestedTimeout : defaultTimeoutMs, defaultTimeoutMs));
      const childEnv = { ...process.env };
      delete childEnv.AGENT_WORK_OS_MACHINE_TOKEN;
      delete childEnv.AGENT_WORK_OS_TOKEN;

      return new Promise((resolve, reject) => {
        const child = spawnImpl(program, args, { cwd, env: childEnv, shell: false, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = Buffer.alloc(0);
        let stderr = Buffer.alloc(0);
        let truncated = false;
        let timedOut = false;

        const collect = (current, chunk) => {
          if (current.length >= maxOutputBytes) { truncated = true; return current; }
          const remaining = maxOutputBytes - current.length;
          if (chunk.length > remaining) truncated = true;
          return Buffer.concat([current, chunk.subarray(0, remaining)]);
        };
        child.stdout?.on("data", (chunk) => { stdout = collect(stdout, Buffer.from(chunk)); });
        child.stderr?.on("data", (chunk) => { stderr = collect(stderr, Buffer.from(chunk)); });
        child.once("error", reject);
        const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
        timer.unref?.();
        child.once("close", (code, signal) => {
          clearTimeout(timer);
          resolve({ program, args, cwd, exitCode: code, signal, timedOut, truncated, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") });
        });
      });
    }
  };
}
