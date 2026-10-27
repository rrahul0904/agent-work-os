import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CoworkReadOnlyFilesAdapter } from "../src/cowork-files-adapter.js";

async function rootFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-cowork-"));
  await writeFile(path.join(root, "notes.md"), "approved workspace notes");
  await writeFile(path.join(root, ".env"), "SECRET=not-an-approved-file");
  await writeFile(path.join(root, "large.txt"), "x".repeat(33_000));
  await writeFile(path.join(root, "binary.txt"), Buffer.from([0, 2, 3, 1]));
  await mkdir(path.join(root, "safe"));
  await writeFile(path.join(root, "safe", "report.json"), '{"ok": true}');
  return { root, clean: () => rm(root, { recursive: true, force: true }) };
}

test("off by default and invalid configured workspace is never advertised", () => {
  assert.equal(new CoworkReadOnlyFilesAdapter({ env: {} }).capability(), null);
  assert.equal(new CoworkReadOnlyFilesAdapter({ env: { AGENT_WORK_OS_COWORK_FILES_READONLY_ENABLED: "true", AGENT_WORK_OS_COWORK_FILES_ROOT: "./relative" } }).capability(), null);
});

test("opted-in Cowork file operations list and read approved text without mutations", async () => {
  const f = await rootFixture();
  try {
    const adapter = new CoworkReadOnlyFilesAdapter({
      env: { AGENT_WORK_OS_COWORK_FILES_READONLY_ENABLED: "true", AGENT_WORK_OS_COWORK_FILES_ROOT: f.root }
    });
    assert.equal(adapter.capability().mode, "read_only");
    const events = [];
    const first = await adapter.run({ sessionId: "owner", cwd: f.root, prompt: "list" }, (x) => events.push(x));
    assert.equal(first.nativeSessionId, "cowork-files-owner");
    const listed = JSON.parse(events.find((e) => e.kind === "text").text);
    assert.ok(listed.files.includes("notes.md"));
    assert.ok(!listed.files.includes(".env"));
    await adapter.run({ sessionId: "owner", cwd: f.root, nativeSessionId: first.nativeSessionId, prompt: "read safe/report.json" }, (x) => events.push(x));
    const read = JSON.parse(events.filter((e) => e.kind === "text").at(-1).text);
    assert.equal(read.file, "safe/report.json");
    assert.equal(read.text, '{"ok": true}');
    assert.equal(read.truncated, false);
    assert.ok(!JSON.stringify(events).includes("SECRET="));
  } finally { await f.clean(); }
});

test("blocks path traversal, hidden secrets, binary, oversized text and symlink escapes", async () => {
  const f = await rootFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "awos-cowork-outside-"));
  await writeFile(path.join(outside, "outside.txt"), "off limits");
  await symlink(path.join(outside, "outside.txt"), path.join(f.root, "alias.txt"));
  try {
    const adapter = new CoworkReadOnlyFilesAdapter({
      env: { AGENT_WORK_OS_COWORK_FILES_READONLY_ENABLED: "true", AGENT_WORK_OS_COWORK_FILES_ROOT: f.root }
    });
    for (const command of ["read ../outside.txt", "read .env", "read /etc/passwd", "read alias.txt", "read large.txt", "read binary.txt"]) {
      await assert.rejects(adapter.run({ sessionId: "s", cwd: f.root, prompt: command }, () => {}), /COWORK_/);
    }
    for (const command of ["delete notes.md", "write notes.md", "exec cat notes.md", "browser open https://example.com"]) {
      await assert.rejects(adapter.run({ sessionId: "s", cwd: f.root, prompt: command }, () => {}), /COWORK_ACTION_DENIED/);
    }
  } finally { await f.clean(); await rm(outside, { recursive: true, force: true }); }
});

test("rejects foreign project folders and mismatched session identities", async () => {
  const f = await rootFixture();
  const other = await mkdtemp(path.join(os.tmpdir(), "awos-cowork-other-"));
  try {
    const adapter = new CoworkReadOnlyFilesAdapter({
      env: { AGENT_WORK_OS_COWORK_FILES_READONLY_ENABLED: "true", AGENT_WORK_OS_COWORK_FILES_ROOT: f.root }
    });
    await assert.rejects(adapter.run({ sessionId: "s", cwd: other, prompt: "list" }, () => {}), /COWORK_WORKSPACE_MISMATCH/);
    await assert.rejects(adapter.run({ sessionId: "s", cwd: f.root, prompt: "list", nativeSessionId: "other" }, () => {}), /COWORK_SESSION_MISMATCH/);
  } finally { await f.clean(); await rm(other, { recursive: true, force: true }); }
});
