import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildProductSummary, listReceipts, loadPortfolio, rankPortfolio, scoreProject } from "../src/product-state.js";

test("portfolio ranking favors high-value near-shipping work and excludes shipped from next", () => {
  const ranked = rankPortfolio([
    { id: "shipped", name: "Done", status: "SHIPPED", value: 5, readiness: 100, effort: 1, risk: 1 },
    { id: "near", name: "Near", status: "UAT_REQUIRED", value: 5, readiness: 88, effort: 2, risk: 2 },
    { id: "early", name: "Early", status: "BUILDING", value: 5, readiness: 30, effort: 4, risk: 4 }
  ]);
  assert.equal(ranked[0].id, "near");
  assert.equal(ranked.at(-1).id, "shipped");
  const summary = buildProductSummary({ portfolio: ranked });
  assert.equal(summary.nextProject.id, "near");
});

test("blockers lower priority score", () => {
  const open = scoreProject({ status: "READY", value: 4, readiness: 70, effort: 2, risk: 2, blockers: [] });
  const blocked = scoreProject({ status: "READY", value: 4, readiness: 70, effort: 2, risk: 2, blockers: [{ code: "BLOCKED_CREDENTIAL" }] });
  assert.ok(open > blocked);
});

test("loads portfolio and recursively discovers receipts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "product-state-"));
  const portfolioPath = path.join(root, "portfolio.json");
  await writeFile(portfolioPath, JSON.stringify({ projects: [{ id: "p1", name: "Project", status: "READY" }] }));
  const receiptRoot = path.join(root, "receipts");
  await mkdir(path.join(receiptRoot, "p1"), { recursive: true });
  await writeFile(path.join(receiptRoot, "p1", "1.0.json"), JSON.stringify({ version: "receipt/v1", project: { id: "p1", releaseVersion: "1.0" }, status: "SHIPPED" }));
  const portfolio = await loadPortfolio(portfolioPath);
  const receipts = await listReceipts(receiptRoot);
  assert.equal(portfolio[0].id, "p1");
  assert.equal(receipts[0].path, path.join("p1", "1.0.json"));
});
