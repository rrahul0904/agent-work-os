import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export class ShellRunner {
  constructor({ timeoutMs = 600_000, maxOutputBytes = 1_000_000 } = {}) {
    this.timeoutMs = timeoutMs;
    this.maxOutputBytes = maxOutputBytes;
  }

  async run(commandSpec, { cwd, env = {}, stage = "command" } = {}) {
    const command = commandSpec?.command;
    if (typeof command !== "string" || !command.trim()) throw new Error("shell_command_required");
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const result = await spawnShell(command, {
      cwd,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      env: { ...process.env, ...env }
    });
    return {
      name: commandSpec.name ?? stage,
      command,
      ok: result.code === 0 && !result.timedOut,
      code: result.code,
      signal: result.signal,
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
      startedAt,
      durationMs: Date.now() - started
    };
  }
}

export class GitWorktreeManager {
  constructor({ runner = new ShellRunner() } = {}) { this.runner = runner; }

  async create({ repoPath, baseRef, runId, root }) {
    const repo = path.resolve(repoPath);
    const worktreeRoot = root ? path.resolve(root) : path.join(os.tmpdir(), "agent-work-os-worktrees");
    await fs.mkdir(worktreeRoot, { recursive: true });
    const safeRun = runId.replace(/[^A-Za-z0-9._-]/g, "-");
    const worktreePath = path.join(worktreeRoot, safeRun);
    try {
      await fs.access(worktreePath);
      throw new Error("shipping_worktree_path_exists");
    } catch (error) {
      if (error.message === "shipping_worktree_path_exists") throw error;
    }
    const baseShaResult = await this.runner.run({ command: `git rev-parse ${shellQuote(baseRef)}` }, { cwd: repo, stage: "git.base-sha" });
    if (!baseShaResult.ok) throw new Error(`shipping_worktree_base_ref_failed:${compact(baseShaResult.stderr)}`);
    const baseSha = baseShaResult.stdout.trim();
    const createResult = await this.runner.run({ command: `git worktree add --detach ${shellQuote(worktreePath)} ${shellQuote(baseSha)}` }, { cwd: repo, stage: "git.worktree-add" });
    if (!createResult.ok) throw new Error(`shipping_worktree_create_failed:${compact(createResult.stderr)}`);
    return { repoPath: repo, worktreePath, baseSha };
  }

  async remove({ repoPath, worktreePath, force = false }) {
    const result = await this.runner.run({ command: `git worktree remove ${force ? "--force " : ""}${shellQuote(path.resolve(worktreePath))}` }, { cwd: path.resolve(repoPath), stage: "git.worktree-remove" });
    if (!result.ok) throw new Error(`shipping_worktree_remove_failed:${compact(result.stderr)}`);
    return true;
  }

  async sha(worktreePath) {
    const result = await this.runner.run({ command: "git rev-parse HEAD" }, { cwd: path.resolve(worktreePath), stage: "git.sha" });
    if (!result.ok) throw new Error(`shipping_worktree_sha_failed:${compact(result.stderr)}`);
    return result.stdout.trim();
  }
}

async function spawnShell(command, { cwd, env, timeoutMs, maxOutputBytes }) {
  return await new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-lc", command], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (current, chunk) => `${current}${chunk}`.slice(-maxOutputBytes);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk.toString("utf8")); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk.toString("utf8")); });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut, stdout, stderr }); });
  });
}
function shellQuote(value) { return `'${String(value).replaceAll("'", `'\\''`)}'`; }
function compact(value) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 400); }
