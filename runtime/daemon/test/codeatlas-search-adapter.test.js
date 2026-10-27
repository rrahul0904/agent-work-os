import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { CodeAtlasSearchAdapter, sealCodeAtlasIndex, verifyCodeAtlasIndex } from "../src/codeatlas-search-adapter.js";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "awos-codeatlas-"));
  execFileSync("git", ["init", "-q", root]);
  writeFileSync(path.join(root, "README.md"), "Clean repo\n");
  execFileSync("git", ["-C", root, "add", "README.md"]);
  execFileSync("git", ["-C", root, "-c", "user.name=CI", "-c", "user.email=ci@example.invalid", "commit", "-qm", "initial"]);
  const folder = path.join(root, ".codeatlas");
  mkdirSync(folder);
  writeFileSync(path.join(folder, "index.sqlite3"), "disposable fake index bytes");
  const stamp = sealCodeAtlasIndex(root);
  return { root, stamp, clean: () => rmSync(root, { recursive: true, force: true }) };
}

test("disabled unless operator explicitly enables CodeAtlas and pins one absolute workspace", () => {
  assert.equal(new CodeAtlasSearchAdapter({ env: {} }).capability(), null);
  assert.equal(new CodeAtlasSearchAdapter({ env: { AGENT_WORK_OS_CODEATLAS_READONLY_ENABLED: "true", AGENT_WORK_OS_CODEATLAS_ROOT: "relative" } }).capability(), null);
});

test("CodeAtlas runs only pre-indexed pinned-revision symbol search with redacted fields", async () => {
  const f = fixture();
  try {
    const commands = [];
    const adapter = new CodeAtlasSearchAdapter({
      env: { AGENT_WORK_OS_CODEATLAS_READONLY_ENABLED: "true", AGENT_WORK_OS_CODEATLAS_ROOT: f.root },
      execFileImpl: async (program, args, options) => {
        commands.push({ program, args, cwd: options.cwd });
        return { stdout: JSON.stringify([
          { qualified_name: "service.process_order", kind: "function", language: "python",
            file_path: path.join(f.root, "src/service.py"), start_line: 10,
            docstring: "secret vendor credential", metadata: { token: "secret" } },
          { qualified_name: "foreign.secret", kind: "function", file_path: "/outside/path.py", start_line: 1 }
        ]) };
      }
    });
    const events = [];
    const run = await adapter.run({ sessionId: "s", cwd: f.root, prompt: "search process_order" }, (e) => events.push(e));
    assert.equal(run.nativeSessionId, "codeatlas-s");
    assert.equal(commands[0].program, "codeatlas");
    assert.deepEqual(commands[0].args, ["search", "process_order", "--db", path.join(f.root, ".codeatlas", "index.sqlite3")]);
    const output = JSON.parse(events.find((e) => e.kind === "text").text);
    assert.equal(output.revision, f.stamp.revision);
    assert.equal(output.symbols[0].qualifiedName, "service.process_order");
    assert.equal(output.symbols[0].file, "src/service.py");
    assert.equal(output.symbolCount, 1);
    assert.ok(!JSON.stringify(events).includes("secret vendor credential"));
    assert.ok(!JSON.stringify(events).includes("secret"));
    assert.equal(output.indexProvenance, "operator_sealed");
  } finally { f.clean(); }
});

test("CodeAtlas rejects command injection, foreign workspace, dirty tree, stale index and interrupted identity", async () => {
  const f = fixture();
  let calls = 0;
  const adapter = new CodeAtlasSearchAdapter({
    env: { AGENT_WORK_OS_CODEATLAS_READONLY_ENABLED: "true", AGENT_WORK_OS_CODEATLAS_ROOT: f.root },
    execFileImpl: async () => { calls++; return { stdout: "[]" }; }
  });
  try {
    for (const prompt of ["index .", "profile object", "search ; rm -rf /", "search foo --db /tmp/bad", "search foo\nbar"]) {
      await assert.rejects(adapter.run({ sessionId: "s", cwd: f.root, prompt }, () => {}), /CODEATLAS_SEARCH_ONLY/);
    }
    assert.equal(calls, 0);
    await assert.rejects(adapter.run({ sessionId: "s", cwd: os.tmpdir(), prompt: "search foo" }, () => {}), /CODEATLAS_WORKSPACE_MISMATCH/);
    writeFileSync(path.join(f.root, "README.md"), "modified");
    await assert.rejects(adapter.run({ sessionId: "s", cwd: f.root, prompt: "search foo" }, () => {}), /CODEATLAS_TRACKED_TREE_DIRTY/);
    execFileSync("git", ["-C", f.root, "checkout", "--", "README.md"]);
    writeFileSync(path.join(f.root, ".codeatlas", "index.sqlite3"), "tampered");
    await assert.rejects(adapter.run({ sessionId: "s", cwd: f.root, prompt: "search foo" }, () => {}), /CODEATLAS_INDEX_STALE_OR_UNBOUND/);
    assert.equal(calls, 0);
  } finally { f.clean(); }
});

test("CodeAtlas index sealing disallows symlinked index directory", () => {
  const f = fixture();
  try {
    const other = mkdtempSync(path.join(os.tmpdir(), "outside-index-"));
    rmSync(path.join(f.root, ".codeatlas"), { recursive: true });
    symlinkSync(other, path.join(f.root, ".codeatlas"), "dir");
    assert.throws(() => verifyCodeAtlasIndex(f.root), /CODEATLAS_INDEX_DIR_NOT_SAFE/);
    rmSync(other, { recursive: true });
  } finally { f.clean(); }
});
