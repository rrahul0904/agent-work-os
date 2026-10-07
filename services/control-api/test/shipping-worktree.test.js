import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GitWorktreeManager, ShellRunner } from "../src/shipping-adapters.js";

async function sh(command, cwd) {
  const result = await new ShellRunner({ timeoutMs: 10000 }).run({ command }, { cwd });
  assert.equal(result.ok, true, `${command}: ${result.stderr}`);
  return result.stdout.trim();
}

test("creates isolated worktree at exact base SHA and removes it", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-wt-test-"));
  const repo = path.join(root, "repo");
  const trees = path.join(root, "trees");
  await fs.mkdir(repo);
  await sh("git init -q && git config user.email test@example.com && git config user.name Test", repo);
  await fs.writeFile(path.join(repo, "README.md"), "hello\n");
  await sh("git add README.md && git commit -qm initial", repo);
  const expected = await sh("git rev-parse HEAD", repo);
  const manager = new GitWorktreeManager({ runner: new ShellRunner({ timeoutMs: 10000 }) });
  const wt = await manager.create({ repoPath: repo, baseRef: "HEAD", runId: "run-1", root: trees });
  assert.equal(wt.baseSha, expected);
  assert.equal(await manager.sha(wt.worktreePath), expected);
  await manager.remove({ repoPath: repo, worktreePath: wt.worktreePath });
  await assert.rejects(() => fs.access(wt.worktreePath));
});
