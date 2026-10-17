import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMachinePolicy } from "../src/machine-policy.js";
import { createMachineTools } from "../src/machine-tools.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "awos-machine-"));
  fs.writeFileSync(path.join(root, "hello.txt"), "hello\n");
  return root;
}

test("policy is deny-by-default", () => {
  const policy = createMachinePolicy();
  assert.equal(policy.enabled, false);
  assert.throws(() => policy.resolveWorkspacePath(".", "read"), /permission_denied:read/);
});

test("workspace paths remain inside configured roots", () => {
  const root = fixture();
  const policy = createMachinePolicy({ workspaceRoots: [root], permissions: ["read"] });
  assert.equal(policy.resolveWorkspacePath(path.join(root, "hello.txt"), "read"), path.join(root, "hello.txt"));
  assert.throws(() => policy.resolveWorkspacePath(path.dirname(root), "read"), /path_denied/);
});

test("symlink escape is rejected", () => {
  const root = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "awos-outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
  fs.symlinkSync(outside, path.join(root, "escape"), "dir");
  const policy = createMachinePolicy({ workspaceRoots: [root], permissions: ["read"] });
  assert.throws(() => policy.resolveWorkspacePath(path.join(root, "escape", "secret.txt"), "read"), /path_denied/);
});

test("command execution requires explicit executable grant", async () => {
  const root = fixture();
  const policy = createMachinePolicy({ workspaceRoots: [root], permissions: ["execute"], commands: [process.execPath] });
  const tools = createMachineTools(policy, { timeoutMs: 5000 });
  const result = await tools.run({ program: process.execPath, args: ["-e", "process.stdout.write('ok')"], cwd: root });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "ok");
  assert.throws(() => policy.assertCommand("sh"), /command_denied/);
});

test("read and list are bounded to granted workspace", async () => {
  const root = fixture();
  const policy = createMachinePolicy({ workspaceRoots: [root], permissions: ["read"] });
  const tools = createMachineTools(policy);
  assert.equal((await tools.read(path.join(root, "hello.txt"))).content, "hello\n");
  assert.ok((await tools.list(root)).entries.some((entry) => entry.name === "hello.txt"));
});
