#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { scanRepository, selectRepositoryContext } from "../packages/repo-intelligence/src/index.js";
import { analyzeRepositoryTopology } from "../packages/repo-intelligence/src/topology.js";
import { analyzeStructuralRisk } from "../packages/repo-intelligence/src/risk.js";
import { createRepositoryEvidenceBundle } from "../packages/repo-intelligence/src/evidence.js";
import { diffRepositoryMaps } from "../packages/repo-intelligence/src/diff.js";

const [command, repoArg = ".", ...flags] = process.argv.slice(2);

try {
  if (command === "map") {
    const result = await scanRepository(repoArg);
    await emit(result, getFlag(flags, "--output="));
  } else if (command === "topology") {
    const map = await scanRepository(repoArg);
    const result = await analyzeRepositoryTopology(repoArg, map);
    await emit(result, getFlag(flags, "--output="));
  } else if (command === "context") {
    const task = getFlag(flags, "--task=");
    if (!task) throw commandError("repo_atlas_task_required", "context requires --task=<objective>");
    const maxFiles = parseIntegerFlag(flags, "--max-files=", 24);
    const maxEstimatedTokens = parseIntegerFlag(flags, "--max-tokens=", 24_000);
    const map = await scanRepository(repoArg);
    const result = selectRepositoryContext(map, { task, maxFiles, maxEstimatedTokens });
    await emit(result, getFlag(flags, "--output="));
  } else if (command === "risk") {
    const topN = parseIntegerFlag(flags, "--top=", 25);
    const map = await scanRepository(repoArg);
    const topology = await analyzeRepositoryTopology(repoArg, map);
    const result = analyzeStructuralRisk(map, topology, { topN });
    await emit(result, getFlag(flags, "--output="));
  } else if (command === "bundle") {
    const map = await scanRepository(repoArg);
    const topology = await analyzeRepositoryTopology(repoArg, map);
    const risk = analyzeStructuralRisk(map, topology, { topN: parseIntegerFlag(flags, "--top=", 25) });
    const task = getFlag(flags, "--task=");
    const context = task
      ? selectRepositoryContext(map, {
          task,
          maxFiles: parseIntegerFlag(flags, "--max-files=", 24),
          maxEstimatedTokens: parseIntegerFlag(flags, "--max-tokens=", 24_000)
        })
      : null;
    const result = createRepositoryEvidenceBundle({
      repoMap: map,
      topology,
      risk,
      context,
      provenance: {
        repository: getFlag(flags, "--repository=") ?? undefined,
        ref: getFlag(flags, "--ref=") ?? undefined,
        commit: getFlag(flags, "--commit=") ?? undefined,
        source: getFlag(flags, "--source=") ?? "local-checkout"
      }
    });
    await emit(result, getFlag(flags, "--output="));
  } else if (command === "diff") {
    const currentMapPath = flags.find((value) => !value.startsWith("--"));
    if (!currentMapPath) throw commandError("repo_atlas_diff_arguments_required", "diff requires <previous-map.json> <current-map.json>");
    const previous = await readJson(repoArg);
    const current = await readJson(currentMapPath);
    const result = diffRepositoryMaps(previous, current);
    await emit(result, getFlag(flags, "--output="));
  } else {
    process.stderr.write(
      "Usage:\n" +
      "  npm run repo:atlas -- map <repo-path> [--output=<file>]\n" +
      "  npm run repo:atlas -- topology <repo-path> [--output=<file>]\n" +
      "  npm run repo:atlas -- context <repo-path> --task=<objective> [--max-files=24] [--max-tokens=24000] [--output=<file>]\n" +
      "  npm run repo:atlas -- risk <repo-path> [--top=25] [--output=<file>]\n" +
      "  npm run repo:atlas -- bundle <repo-path> [--task=<objective>] [--repository=<owner/name>] [--ref=<ref>] [--commit=<sha>] [--source=<kind>] [--output=<file>]\n" +
      "  npm run repo:atlas -- diff <previous-map.json> <current-map.json> [--output=<file>]\n"
    );
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: error.code ?? error.name ?? "repo_atlas_failed",
    message: error.message,
    details: error.details ?? undefined
  })}\n`);
  process.exitCode = 1;
}

async function readJson(filename) {
  return JSON.parse(await readFile(path.resolve(filename), "utf8"));
}

async function emit(value, outputPath) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(serialized);
    return;
  }
  const target = path.resolve(outputPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, serialized, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, output: target, schemaVersion: value.schemaVersion, digest: value.digest })}\n`);
}

function getFlag(flags, prefix) {
  const match = flags.find((flag) => flag.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function parseIntegerFlag(flags, prefix, fallback) {
  const raw = getFlag(flags, prefix);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw commandError("repo_atlas_flag_invalid", `Invalid ${prefix}${raw}`);
  return value;
}

function commandError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
