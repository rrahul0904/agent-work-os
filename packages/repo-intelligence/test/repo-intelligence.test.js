import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REPO_CONTEXT_EVIDENCE_SCHEMA,
  REPO_MAP_SCHEMA,
  RepoScanError,
  scanRepository,
  selectRepositoryContext
} from "../src/index.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-atlas-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function put(root, relative, content) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

test("scanRepository builds deterministic metadata without retaining source contents", async () => {
  await withFixture(async (root) => {
    await put(root, ".gitignore", "generated/\n");
    await put(root, ".repoatlasignore", "private.ts\n");
    await put(root, "src/billing/subscription.ts", [
      "const TOP_SECRET_TOKEN = 'must-not-appear-in-map';",
      "export function cancelSubscription() {}",
      "",
      "export function refundInvoice() {}"
    ].join("\n"));
    await put(root, "src/auth/session.js", "export const session = true;\n");
    await put(root, "src/private.ts", "export const hidden = true;\n");
    await put(root, "docs/architecture.md", "# Architecture\n\nBilling service.\n");
    await put(root, "generated/client.ts", "export const generated = true;\n");
    await put(root, "node_modules/pkg/index.js", "module.exports = {};\n");
    await put(root, "assets/logo.bin", "ignored-extension\n");

    const first = await scanRepository(root);
    const second = await scanRepository(root);

    assert.equal(first.schemaVersion, REPO_MAP_SCHEMA);
    assert.equal(first.digest, second.digest);
    assert.equal(first.metrics.files, 3);
    assert.equal(first.metrics.lines, 6);
    assert.deepEqual(first.files.map((file) => file.path), [
      "docs/architecture.md",
      "src/auth/session.js",
      "src/billing/subscription.ts"
    ]);
    assert.equal(first.languages.Markdown.files, 1);
    assert.equal(first.languages.JavaScript.files, 1);
    assert.equal(first.languages.TypeScript.files, 1);
    assert.equal(first.exclusions.defaultDirectory, 1);
    assert.equal(first.exclusions.ignoreRule, 2);
    assert.equal(JSON.stringify(first).includes("must-not-appear-in-map"), false);
  });
});

test("selectRepositoryContext ranks task-relevant paths and enforces the token budget", async () => {
  await withFixture(async (root) => {
    await put(root, "services/billing/stripe/subscription.ts", "export function cancelStripeSubscription() { return true; }\n");
    await put(root, "services/billing/webhooks.ts", "export function stripeWebhook() { return true; }\n");
    await put(root, "services/profile/avatar.ts", "export function resizeAvatar() { return true; }\n");
    await put(root, "README.md", "# Fixture\n");

    const map = await scanRepository(root);
    const evidence = selectRepositoryContext(map, {
      task: "Implement Stripe billing subscription cancellation and webhook handling",
      maxFiles: 2,
      maxEstimatedTokens: 10_000
    });

    assert.equal(evidence.schemaVersion, REPO_CONTEXT_EVIDENCE_SCHEMA);
    assert.equal(evidence.repositoryDigest, map.digest);
    assert.equal(evidence.selected.length, 2);
    assert.equal(evidence.selected[0].path, "services/billing/stripe/subscription.ts");
    assert.equal(evidence.selected[1].path, "services/billing/webhooks.ts");
    assert.ok(evidence.selected[0].relevance > 0);
    assert.ok(evidence.estimatedTokens <= evidence.budget.maxEstimatedTokens);
    assert.match(evidence.digest, /^sha256:[0-9a-f]{64}$/u);
  });
});

test("scanRepository rejects symlink roots and never follows symlink entries", async (t) => {
  if (process.platform === "win32") t.skip("symlink permissions vary on Windows CI");
  await withFixture(async (root) => {
    const real = path.join(root, "real");
    const external = path.join(root, "external");
    await mkdir(real, { recursive: true });
    await mkdir(external, { recursive: true });
    await put(root, "real/index.js", "export const local = true;\n");
    await put(root, "external/secret.js", "export const externalSecret = true;\n");
    await symlink(external, path.join(real, "linked-external"), "dir");
    await symlink(real, path.join(root, "root-link"), "dir");

    const map = await scanRepository(real);
    assert.equal(map.files.length, 1);
    assert.equal(map.files[0].path, "index.js");
    assert.equal(map.exclusions.symlink, 1);

    await assert.rejects(
      () => scanRepository(path.join(root, "root-link")),
      (error) => error instanceof RepoScanError && error.code === "repo_root_symlink_forbidden"
    );
  });
});

test("scanRepository fails closed when a recognized source file exceeds configured size", async () => {
  await withFixture(async (root) => {
    await put(root, "src/huge.js", "0123456789abcdef\n");

    await assert.rejects(
      () => scanRepository(root, { limits: { maxFileBytes: 8 } }),
      (error) => error instanceof RepoScanError && error.code === "repo_file_size_limit_exceeded"
    );
  });
});
