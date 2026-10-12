import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cli = path.resolve("scripts/change-airlock.mjs");

async function git(cwd, ...args) {
  return await execFileAsync("git", args, { cwd });
}

async function commitAll(cwd, message) {
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-m", message);
}

test("CLI binds PASS receipt to exact real Git SHAs", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "change-airlock-pass-"));
  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.email", "airlock@example.invalid");
  await git(repo, "config", "user.name", "Change Airlock Test");

  await writeFile(path.join(repo, "math.js"), "export const add = (a, b) => a + b;\n");
  await writeFile(path.join(repo, "math.test.js"), "assert.equal(add(1, 2), 3);\n");
  await commitAll(repo, "base");
  const baseSha = (await git(repo, "rev-parse", "HEAD")).stdout.trim();

  await writeFile(path.join(repo, "math.js"), "export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n");
  await writeFile(path.join(repo, "math.test.js"), "assert.equal(add(1, 2), 3);\nassert.equal(sub(3, 2), 1);\n");
  await commitAll(repo, "feature");
  const headSha = (await git(repo, "rev-parse", "HEAD")).stdout.trim();

  const output = path.join(repo, "airlock.json");
  const result = await execFileAsync(process.execPath, [cli, "--base", "HEAD^", "--head", "HEAD", "--output", output], { cwd: repo });
  const report = JSON.parse(result.stdout);
  const written = JSON.parse(await readFile(output, "utf8"));

  assert.equal(report.decision, "PASS");
  assert.equal(report.baseSha, baseSha);
  assert.equal(report.headSha, headSha);
  assert.equal(written.receiptDigest, report.receiptDigest);
  assert.match(report.diffDigest, /^[a-f0-9]{64}$/);
  assert.match(report.receiptDigest, /^[a-f0-9]{64}$/);
});

test("CLI exits non-zero and emits BLOCK receipt for weakened real Git change", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "change-airlock-block-"));
  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.email", "airlock@example.invalid");
  await git(repo, "config", "user.name", "Change Airlock Test");

  await writeFile(path.join(repo, "logic.test.js"), "assert.equal(compute(), 42);\n");
  await commitAll(repo, "base");
  await writeFile(path.join(repo, "logic.test.js"), "// assertion removed\n");
  await commitAll(repo, "weaken test");

  let failure;
  try {
    await execFileAsync(process.execPath, [cli, "--base", "HEAD^", "--head", "HEAD"], { cwd: repo });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure, "BLOCK decision must produce a non-zero exit code");
  assert.equal(failure.code, 1);
  const report = JSON.parse(failure.stdout);
  assert.equal(report.decision, "BLOCK");
  assert.ok(report.findings.some((item) => item.ruleId === "AIRLOCK_ASSERTION_DELTA"));
});
