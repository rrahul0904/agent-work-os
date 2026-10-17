import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const DEFAULT_MAX_READ_BYTES = 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_TIMEOUT_MS = 60_000;

export function createMachineTools(policy, options = {}) {
  const maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnImpl = options.spawnImpl ?? spawn;

  return {
    info() {
      return {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        policy: policy.describe()
      };
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
      return { path: target, size: stat.size, content: await fs.readFile(target, "utf8") };
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
          resolve({
            program,
            args,
            cwd,
            exitCode: code,
            signal,
            timedOut,
            truncated,
            stdout: stdout.toString("utf8"),
            stderr: stderr.toString("utf8")
          });
        });
      });
    }
  };
}
