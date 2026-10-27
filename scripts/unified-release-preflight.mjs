#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { evaluateUnifiedReleasePreflight } from "../packages/release-preflight/src/index.js";

try {
  const file = process.argv[2];
  if (process.argv.length !== 3 || !file) throw new Error("usage: node scripts/unified-release-preflight.mjs <evidence-manifest.json>");
  const input = JSON.parse(readFileSync(file, "utf8"));
  const result = evaluateUnifiedReleasePreflight(input);
  console.log(JSON.stringify(result, null, 2));
  if (!result.readyForOwnerReview) process.exitCode = 1;
} catch (error) {
  console.error("preflight error: invalid or unreadable evidence manifest");
  process.exitCode = 2;
}
